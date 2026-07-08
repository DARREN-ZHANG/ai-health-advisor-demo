import {
  AgentResponseEnvelopeSchema,
  ChartTokenId,
  ActionOptionSchema,
  FutureSuggestionSchema,
  AgentTaskType,
} from '@health-advisor/shared';
import type { AgentResponseEnvelope, PageContext, FutureSuggestion } from '@health-advisor/shared';
import { ChartTokenIdSchema } from '@health-advisor/shared';
import { MAX_CHART_TOKENS, MAX_MICRO_TIPS, MAX_ACTIONS } from '../constants/limits';

export interface ParseMeta {
  taskType: AgentTaskType;
  pageContext: PageContext;
  defaultStatusColor?: AgentResponseEnvelope['statusColor'];
  /** 当前模拟时间（YYYY-MM-DDTHH:mm），用于校验 futureSuggestions 的 timePoint 区间 */
  demoNow?: string;
}

export interface ParseSuccess {
  success: true;
  envelope: AgentResponseEnvelope;
}

export interface ParseFailure {
  success: false;
  error: string;
  raw: string;
}

export type ParseResult = ParseSuccess | ParseFailure;

/**
 * 将模型原始输出解析为 AgentResponseEnvelope。
 * - 提取 JSON（支持 markdown 代码块包裹）
 * - Zod 校验 + chartToken 白名单过滤
 * - 自动填充 meta 字段
 */
export function parseAgentResponse(raw: string, meta: ParseMeta): ParseResult {
  const jsonStr = extractJson(raw);
  if (!jsonStr) {
    return {
      success: false,
      error: '无法从模型输出中提取 JSON',
      raw,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return {
      success: false,
      error: 'JSON 解析失败',
      raw,
    };
  }

  if (!parsed || typeof parsed !== 'object') {
    return {
      success: false,
      error: '模型输出不是有效的 JSON 对象',
      raw,
    };
  }

  const obj = parsed as Record<string, unknown>;

  // chartToken 白名单过滤
  const rawTokens = Array.isArray(obj.chartTokens) ? obj.chartTokens : [];
  const validTokens = rawTokens
    .filter((t): t is string => typeof t === 'string')
    .filter((t) => {
      const result = ChartTokenIdSchema.safeParse(t);
      return result.success;
    })
    .map((t) => t as ChartTokenId)
    .slice(0, MAX_CHART_TOKENS);

  // microTips 截断
  const rawTips = Array.isArray(obj.microTips)
    ? obj.microTips.filter((t): t is string => typeof t === 'string')
    : [];
  const tips = rawTips.slice(0, MAX_MICRO_TIPS);

  // actions 严格校验
  let actions: AgentResponseEnvelope['actions'] = undefined;
  if (obj.actions !== undefined) {
    if (!Array.isArray(obj.actions)) {
      return {
        success: false,
        error: 'actions 必须是数组',
        raw,
      };
    }
    if (obj.actions.length > MAX_ACTIONS) {
      return {
        success: false,
        error: `actions 数量超过最大值 ${MAX_ACTIONS}`,
        raw,
      };
    }
    const validatedActions: NonNullable<AgentResponseEnvelope['actions']> = [];
    for (const item of obj.actions) {
      const parsedAction = ActionOptionSchema.safeParse(item);
      if (!parsedAction.success) {
        // 降级：尝试解析为无 interaction 的基础 action，避免单个非法 interaction 导致整体失败
        const baseParsed = ActionOptionSchema.safeParse({
          ...(item && typeof item === 'object' ? item : {}),
          interaction: undefined,
        });
        if (baseParsed.success) {
          validatedActions.push(baseParsed.data);
          continue;
        }
        return {
          success: false,
          error: `actions 中包含非法项: ${parsedAction.error.issues.map((i) => i.message).join(', ')}`,
          raw,
        };
      }
      validatedActions.push(parsedAction.data);
    }
    actions = validatedActions;
  }

  // statusColor 严格类型检查：非字符串值不静默降级，触发 parse 失败走 fallback
  const statusColor = parseStatusColor(obj.statusColor, meta.defaultStatusColor);
  if (obj.statusColor !== undefined && obj.statusColor !== statusColor) {
    return {
      success: false,
      error: `statusColor 类型错误: 期望 'good'|'warning'|'error'，收到 ${JSON.stringify(obj.statusColor)}`,
      raw,
    };
  }

  // summary 必须存在
  const summary = typeof obj.summary === 'string' ? obj.summary : '';
  if (!summary) {
    return {
      success: false,
      error: '缺少 summary 字段',
      raw,
    };
  }

  const actionsSectionTitle =
    typeof obj.actionsSectionTitle === 'string' && obj.actionsSectionTitle.length > 0
      ? obj.actionsSectionTitle
      : undefined;

  // futureSuggestions 校验（仅 homepage 任务）：schema 校验 + 区间过滤 + 数量截断
  // 校验失败整体丢弃 futureSuggestions，不影响 summary/actions 渲染
  let futureSuggestions: AgentResponseEnvelope['futureSuggestions'] = undefined;
  if (meta.taskType === AgentTaskType.HOMEPAGE_SUMMARY && obj.futureSuggestions !== undefined) {
    const validated = validateFutureSuggestions(obj.futureSuggestions, meta.demoNow);
    if (validated.length > 0) futureSuggestions = validated;
  }

  const envelope: AgentResponseEnvelope = {
    summary,
    source: typeof obj.source === 'string' && obj.source.length > 0 ? obj.source : 'llm',
    statusColor,
    chartTokens: validTokens,
    microTips: tips.length > 0 ? tips : undefined,
    actions,
    actionsSectionTitle,
    futureSuggestions,
    meta: {
      taskType: meta.taskType,
      pageContext: meta.pageContext,
      finishReason: 'complete',
    },
  };

  // 最终 Zod 校验
  const result = AgentResponseEnvelopeSchema.safeParse(envelope);
  if (!result.success) {
    return {
      success: false,
      error: `schema 校验失败: ${result.error.issues.map((i) => i.message).join(', ')}`,
      raw,
    };
  }

  return { success: true, envelope: result.data };
}

function parseStatusColor(
  value: unknown,
  fallback: AgentResponseEnvelope['statusColor'] = 'good',
): AgentResponseEnvelope['statusColor'] {
  if (value === 'good' || value === 'warning' || value === 'error') {
    return value;
  }

  return fallback;
}

/**
 * 校验 futureSuggestions：
 * - schema 校验（FutureSuggestionSchema）逐项过滤非法项
 * - 区间过滤：当 demoNow 提供时，保留 (demoNow, 23:59] 区间内的项
 * - 数量截断：demoNow < 21:00 → 最多 2 个；demoNow ≥ 21:00 → 最多 1 个
 *
 * 当 demoNow 缺失（非 demo timeline 场景）时返回空数组，
 * 因为没有"当前时间"概念就无法判断"未来"。
 * 校验失败整体丢弃，不影响 summary/actions 渲染。
 */
function validateFutureSuggestions(raw: unknown, demoNow: string | undefined): FutureSuggestion[] {
  if (!Array.isArray(raw)) return [];
  if (!demoNow) return [];

  const demoHm = extractHhMm(demoNow);
  if (!demoHm) return [];

  // 1. schema 校验
  const schemaValid: FutureSuggestion[] = [];
  for (const item of raw) {
    const result = FutureSuggestionSchema.safeParse(item);
    if (result.success) schemaValid.push(result.data);
  }

  // 2. 区间过滤 (demoNow, 23:59]
  const inRange = schemaValid.filter((s) => s.timePoint > demoHm && s.timePoint <= '23:59');

  // 3. 数量截断：21:00 前 2 个，之后 1 个
  const limit = demoHm < '21:00' ? 2 : 1;
  return inRange.slice(0, limit);
}

/** 从 YYYY-MM-DDTHH:mm 提取 HH:mm 字符串，失败返回 null */
function extractHhMm(iso: string | undefined): string | null {
  if (!iso || iso.length < 16) return null;
  const hhmm = iso.slice(11, 16);
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(hhmm) ? hhmm : null;
}

function extractJson(text: string): string | null {
  const trimmed = text.trim();

  // 直接是 JSON
  if (trimmed.startsWith('{')) {
    return trimmed;
  }

  // markdown 代码块
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeBlockMatch?.[1]) {
    return codeBlockMatch[1].trim();
  }

  return null;
}
