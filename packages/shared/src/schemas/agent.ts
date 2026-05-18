import { z } from 'zod';
import { ChartTokenIdSchema } from './chart-token';
import { AgentTaskType } from '../types/agent';

export const AgentTaskTypeSchema = z.nativeEnum(AgentTaskType);

export const DataTabSchema = z.enum(['overview', 'hrv', 'sleep', 'resting-hr', 'activity', 'spo2', 'stress']);

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
    { message: 'customDateRange is required when timeframe is "custom"', path: ['customDateRange'] },
  );

export const ActionOptionSchema = z.object({
  id: z.string().min(1),
  emoji: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  aiPromise: z.string().min(1),
});

export const AgentResponseEnvelopeSchema = z.object({
  summary: z.string().min(1),
  source: z.string().min(1),
  statusColor: z.enum(['good', 'warning', 'error']),
  chartTokens: z.array(ChartTokenIdSchema),
  microTips: z.array(z.string()).optional(),
  actions: z.array(ActionOptionSchema).max(3).optional(),
  meta: z.object({
    taskType: AgentTaskTypeSchema,
    pageContext: PageContextSchema,
    finishReason: z.enum(['complete', 'fallback', 'timeout', 'cached']),
    sessionId: z.string().optional(),
  }),
});
