import { z } from 'zod';
import {
  AgentTaskTypeSchema,
  PageContextSchema,
  DataTabSchema,
  TimeframeSchema,
} from '@health-advisor/shared';

const DateRangeSchema = z.object({
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const AgentRequestSchema = z.object({
  requestId: z.string().min(1),
  sessionId: z.string().min(1),
  profileId: z.string().min(1),
  taskType: AgentTaskTypeSchema,
  pageContext: PageContextSchema,
  tab: DataTabSchema.optional(),
  timeframe: TimeframeSchema.optional(),
  dateRange: DateRangeSchema.optional(),
  userMessage: z.string().optional(),
  smartPromptId: z.string().optional(),
  visibleChartIds: z.array(z.string()).optional(),
});

export type AgentRequest = z.infer<typeof AgentRequestSchema>;
