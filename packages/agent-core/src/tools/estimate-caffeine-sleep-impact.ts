import { z } from 'zod';
import type { RecentEventPacket } from '../context/context-packet';
import type { ToolDefinition, ToolExecutionContext, ToolResult } from './tool-types';

const DEFAULT_HALF_LIFE_HOURS = 5;
const DEFAULT_TARGET_SLEEP_HOUR = 23;

const CaffeineSleepImpactInputSchema = z.object({
  targetSleepTime: z.string().optional(),
});
type CaffeineSleepImpactInput = z.infer<typeof CaffeineSleepImpactInputSchema>;

const CaffeineSleepImpactOutputSchema = z.object({
  hasCaffeineEvent: z.boolean(),
  event: z.object({
    start: z.string(),
    end: z.string(),
    confidence: z.number(),
  }).optional(),
  estimatedCaffeineLoad: z.object({
    basis: z.literal('physiological_proxy'),
    measuredChemically: z.literal(false),
    halfLifeHours: z.number(),
    eliminationRateK: z.number(),
    hoursUntilSleep: z.number(),
    remainingRatioAtSleep: z.number(),
  }).optional(),
  sleepImpact: z.object({
    riskLevel: z.enum(['low', 'moderate', 'high']),
    rationale: z.string(),
  }).optional(),
  advice: z.object({
    tone: z.literal('supportive_partner'),
    message: z.string(),
  }).optional(),
});
type CaffeineSleepImpactOutput = z.infer<typeof CaffeineSleepImpactOutputSchema>;

export const estimateCaffeineSleepImpactTool: ToolDefinition<CaffeineSleepImpactInput, CaffeineSleepImpactOutput> = {
  name: 'estimateCaffeineSleepImpact',
  description: '基于 possible_caffeine_intake 事件估算目标入睡时间的咖啡因剩余比例和睡眠影响',
  inputSchema: CaffeineSleepImpactInputSchema,
  outputSchema: CaffeineSleepImpactOutputSchema,
  async execute(input, ctx): Promise<ToolResult<CaffeineSleepImpactOutput>> {
    try {
      const targetSleepTime = input.targetSleepTime ?? defaultTargetSleepTime(ctx);
      const targetMs = parseProjectTimestamp(targetSleepTime).getTime();
      const event = selectLatestCaffeineEventBeforeSleep(ctx, targetMs);

      if (!event) {
        return {
          success: true,
          data: { hasCaffeineEvent: false },
          evidenceIds: [],
        };
      }

      const eventStartMs = parseProjectTimestamp(event.start).getTime();
      const hoursUntilSleep = round((targetMs - eventStartMs) / 3_600_000, 2);
      const eliminationRateK = round(Math.log(2) / DEFAULT_HALF_LIFE_HOURS, 3);
      const remainingRatioAtSleep = round(Math.exp(-eliminationRateK * hoursUntilSleep), 2);
      const riskLevel = classifyRisk(remainingRatioAtSleep);
      const evidenceLimited = event.confidence < 0.8;

      return {
        success: true,
        data: {
          hasCaffeineEvent: true,
          event: {
            start: event.start,
            end: event.end,
            confidence: event.confidence,
          },
          estimatedCaffeineLoad: {
            basis: 'physiological_proxy',
            measuredChemically: false,
            halfLifeHours: DEFAULT_HALF_LIFE_HOURS,
            eliminationRateK,
            hoursUntilSleep,
            remainingRatioAtSleep,
          },
          sleepImpact: {
            riskLevel,
            rationale: buildRationale(remainingRatioAtSleep, riskLevel, evidenceLimited),
          },
          advice: {
            tone: 'supportive_partner',
            message: buildAdvice(riskLevel),
          },
        },
        evidenceIds: event.evidenceIds,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'caffeine_sleep_impact_error',
          message: error instanceof Error ? error.message : '咖啡因睡眠影响估算失败',
        },
      };
    }
  },
};

function defaultTargetSleepTime(ctx: ToolExecutionContext): string {
  const anchor =
    ctx.context.demoNow
    ?? (ctx.packet.homepage?.latest24h.date ? `${ctx.packet.homepage.latest24h.date}T${String(DEFAULT_TARGET_SLEEP_HOUR).padStart(2, '0')}:00` : undefined)
    ?? `${ctx.packet.dataWindow.end}T${String(DEFAULT_TARGET_SLEEP_HOUR).padStart(2, '0')}:00`;

  const datePart = anchor.includes('T') ? anchor.split('T')[0]! : anchor;
  return `${datePart}T${String(DEFAULT_TARGET_SLEEP_HOUR).padStart(2, '0')}:00`;
}

function selectLatestCaffeineEventBeforeSleep(
  ctx: ToolExecutionContext,
  targetSleepMs: number,
): RecentEventPacket | undefined {
  const events = ctx.packet.homepage?.recentEvents ?? [];
  return events
    .filter((event) => event.type === 'possible_caffeine_intake')
    .map((event) => ({ event, startMs: parseProjectTimestamp(event.start).getTime() }))
    .filter(({ startMs }) => startMs < targetSleepMs)
    .sort((a, b) => b.startMs - a.startMs)[0]?.event;
}

function parseProjectTimestamp(value: string): Date {
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    const parsed = new Date(`${value}:00`);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})?$/.test(value)) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  throw new Error(`无效时间格式: ${value}`);
}

function classifyRisk(remainingRatio: number): 'low' | 'moderate' | 'high' {
  if (remainingRatio < 0.25) return 'low';
  if (remainingRatio <= 0.5) return 'moderate';
  return 'high';
}

function buildRationale(
  remainingRatio: number,
  riskLevel: 'low' | 'moderate' | 'high',
  evidenceLimited: boolean,
): string {
  const percent = Math.round(remainingRatio * 100);
  const impact =
    riskLevel === 'high'
      ? '对入睡和深睡的影响可能偏高'
      : riskLevel === 'moderate'
        ? '可能轻到中度影响入睡和深睡比例'
        : '对今晚睡眠的影响预计较低';
  const limited = evidenceLimited ? '摄入证据有限，' : '';
  return `${limited}到目标入睡时间预计仍有约 ${percent}% 的咖啡因负荷，${impact}。该结果基于戒指生理信号估算，不是血液化学实测。`;
}

function buildAdvice(riskLevel: 'low' | 'moderate' | 'high'): string {
  if (riskLevel === 'high') {
    return '今晚建议把睡前 90 分钟留给低刺激活动，避免再摄入含咖啡因饮品，并把训练或高强度工作安排前移。';
  }
  if (riskLevel === 'moderate') {
    return '今晚可以把入睡前 60 分钟留给降刺激活动。如果还想喝热饮，建议换成无咖啡因选项。';
  }
  return '今晚继续保持放松节奏即可，睡前避免追加含咖啡因饮品，让身体自然进入恢复状态。';
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export type { CaffeineSleepImpactInput, CaffeineSleepImpactOutput };
