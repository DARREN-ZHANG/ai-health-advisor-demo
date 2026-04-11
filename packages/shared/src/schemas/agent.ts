import { z } from 'zod';
import { ChartTokenIdSchema } from './chart-token';
import { AgentTaskType } from '../types/agent';

export const AgentTaskTypeSchema = z.nativeEnum(AgentTaskType);

export const DataTabSchema = z.enum(['hrv', 'sleep', 'resting-hr', 'activity', 'spo2', 'stress']);

export const TimeframeSchema = z.enum(['day', 'week', 'month', 'year']);

export const PageContextSchema = z.object({
  profileId: z.string().min(1),
  page: z.string().min(1),
  dataTab: DataTabSchema.optional(),
  timeframe: TimeframeSchema,
});

export const AgentResponseEnvelopeSchema = z.object({
  summary: z.string().min(1),
  chartTokens: z.array(ChartTokenIdSchema),
  microTips: z.array(z.string()),
  meta: z.object({
    taskType: AgentTaskTypeSchema,
    pageContext: PageContextSchema,
    finishReason: z.enum(['complete', 'fallback', 'timeout']),
  }),
});
