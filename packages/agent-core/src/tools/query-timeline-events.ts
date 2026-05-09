import { z } from 'zod';
import type { ToolDefinition, ToolExecutionContext, ToolResult } from './tool-types';

// ── 输入 schema ──
const TimelineEventsInputSchema = z.object({
  eventType: z.string().optional(),
  dateRange: z.object({ start: z.string(), end: z.string() }).optional(),
});
type TimelineEventsInput = z.infer<typeof TimelineEventsInputSchema>;

// ── 输出 schema ──
const TimelineEventsOutputSchema = z.object({
  events: z.array(z.object({
    type: z.string(),
    start: z.string(),
    end: z.string(),
    durationMin: z.number(),
    confidence: z.number(),
  })),
});
type TimelineEventsOutput = z.infer<typeof TimelineEventsOutputSchema>;

/** 查询时间线事件（如运动、睡眠事件） */
export const queryTimelineEventsTool: ToolDefinition<TimelineEventsInput, TimelineEventsOutput> = {
  name: 'queryTimelineEvents',
  description: '查询时间线事件（如运动、睡眠事件）',
  inputSchema: TimelineEventsInputSchema,
  outputSchema: TimelineEventsOutputSchema,
  async execute(input, ctx): Promise<ToolResult<TimelineEventsOutput>> {
    try {
      // 从 homepage.recentEvents 获取
      let events = ctx.packet.homepage?.recentEvents ?? [];

      // 按 eventType 过滤
      if (input.eventType) {
        events = events.filter((e) => e.type === input.eventType);
      }

      // 按 dateRange 过滤
      if (input.dateRange) {
        events = events.filter(
          (e) => e.start >= input.dateRange!.start && e.end <= input.dateRange!.end,
        );
      }

      if (events.length === 0) {
        return {
          success: true,
          data: { events: [] },
          evidenceIds: [],
        };
      }

      const outputEvents = events.map((e) => ({
        type: e.type,
        start: e.start,
        end: e.end,
        durationMin: e.durationMin,
        confidence: e.confidence,
      }));

      const allEvidenceIds = events.flatMap((e) => e.evidenceIds);

      return {
        success: true,
        data: { events: outputEvents },
        evidenceIds: allEvidenceIds,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'timeline_query_error',
          message: error instanceof Error ? error.message : '查询时间线事件失败',
        },
      };
    }
  },
};

export type { TimelineEventsInput, TimelineEventsOutput };
