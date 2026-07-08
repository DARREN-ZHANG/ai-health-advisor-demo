import { z } from 'zod';
import { ChartTokenIdSchema } from './chart-token';
import { AgentTaskType } from '../types/agent';
import { MicroEventParamsSchema, MicroEventTypeSchema } from './micro-event';

export const AgentTaskTypeSchema = z.nativeEnum(AgentTaskType);

export const DataTabSchema = z.enum([
  'overview',
  'hrv',
  'sleep',
  'resting-hr',
  'activity',
  'spo2',
  'stress',
]);

export const TimeframeSchema = z.enum(['day', 'week', 'month', 'year', 'custom']);

const DateRangeSchema = z.object({
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const PageContextSchema = z
  .object({
    profileId: z.string().min(1),
    page: z.string().min(1),
    dataTab: DataTabSchema.optional(),
    timeframe: TimeframeSchema,
    customDateRange: DateRangeSchema.optional(),
  })
  .refine(
    (ctx) => {
      if (ctx.timeframe === 'custom') {
        return ctx.customDateRange !== undefined;
      }
      return true;
    },
    {
      message: 'customDateRange is required when timeframe is "custom"',
      path: ['customDateRange'],
    },
  );

export const ActionInteractionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('calendar'),
    calendar: z.object({
      title: z.string().min(1),
      timingLabel: z.string().min(1),
      durationMinutes: z.number().int().positive(),
    }),
  }),
  z.object({
    kind: z.literal('micro_event'),
    microEvent: z.object({
      type: MicroEventTypeSchema,
      durationMinutes: z.number().int().positive().optional(),
      params: MicroEventParamsSchema.optional(),
    }),
  }),
]);

export const ActionOptionSchema = z.object({
  id: z.string().min(1),
  emoji: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  aiPromise: z.string().min(1),
  interaction: ActionInteractionSchema.optional(),
});

/** 未来时间点建议 Schema — timePoint 必须是 HH:mm 格式 */
const HH_MM_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export const FutureSuggestionSchema = z.object({
  timePoint: z.string().regex(HH_MM_REGEX, 'timePoint must be HH:mm in 00:00-23:59'),
  predictedState: z.string().min(1),
  rationale: z.string().min(1),
  action: ActionOptionSchema,
});

const MemoryCandidateKindSchema = z.enum([
  'allergy',
  'medical_constraint',
  'goal',
  'preference',
  'workflow_contact',
  'workflow_consent',
  'correction',
  'revocation',
]);

export const MemoryCandidateConfirmationSchema = z.object({
  id: z.string().min(1),
  kind: MemoryCandidateKindSchema,
  proposedConfirmationText: z.string().min(1),
  evidenceQuote: z.string().min(1),
});

export const AgentResponseEnvelopeSchema = z.object({
  summary: z.string().min(1),
  source: z.string().min(1),
  statusColor: z.enum(['good', 'warning', 'error']),
  chartTokens: z.array(ChartTokenIdSchema),
  microTips: z.array(z.string()).optional(),
  actions: z.array(ActionOptionSchema).max(3).optional(),
  actionsSectionTitle: z.string().optional(),
  memoryCandidates: z.array(MemoryCandidateConfirmationSchema).optional(),
  futureSuggestions: z.array(FutureSuggestionSchema).max(2).optional(),
  meta: z.object({
    taskType: AgentTaskTypeSchema,
    pageContext: PageContextSchema,
    finishReason: z.enum(['complete', 'fallback', 'timeout', 'cached']),
    sessionId: z.string().optional(),
  }),
});
