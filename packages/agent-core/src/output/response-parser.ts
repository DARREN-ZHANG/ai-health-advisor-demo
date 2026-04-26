import { AgentResponseEnvelopeSchema, ChartTokenId } from '@health-advisor/shared';
import type { AgentResponseEnvelope, AgentTaskType, PageContext } from '@health-advisor/shared';
import { ChartTokenIdSchema } from '@health-advisor/shared';
import { MAX_CHART_TOKENS, MAX_MICRO_TIPS } from '../constants/limits';

export interface ParseMeta {
  taskType: AgentTaskType;
  pageContext: PageContext;
  defaultStatusColor?: AgentResponseEnvelope['statusColor'];
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

  // statusColor 严格类型检查：非字符串值不静默降级，触发 parse 失败走 fallback
  const statusColor = parseStatusColor(obj.statusColor, meta.defaultStatusColor);
  if (
    obj.statusColor !== undefined &&
    obj.statusColor !== statusColor
  ) {
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

  const envelope: AgentResponseEnvelope = {
    summary,
    source: typeof obj.source === 'string' && obj.source.length > 0 ? obj.source : 'llm',
    statusColor,
    chartTokens: validTokens,
    microTips: tips,
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
