import { z } from 'zod';

export const StressTimelinePointSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  stressLoadScore: z.number().min(0).max(100),
  contributors: z.object({
    hrv: z.number().min(0).max(100),
    sleep: z.number().min(0).max(100),
    activity: z.number().min(0).max(100),
  }),
});

export const StressTrendSchema = z.enum(['improving', 'stable', 'declining']);

export const StressSummaryStatsSchema = z.object({
  average: z.number().min(0).max(100),
  max: z.number().min(0).max(100),
  min: z.number().min(0).max(100),
  trend: StressTrendSchema,
});

export const StressTimelineResponseSchema = z.object({
  points: z.array(StressTimelinePointSchema),
  summary: StressSummaryStatsSchema,
});
