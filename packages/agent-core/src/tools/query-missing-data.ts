import { z } from 'zod';
import { MetricType } from '../planner/analysis-plan';
import type { ToolDefinition, ToolExecutionContext, ToolResult } from './tool-types';

// ── 输入 schema ──
const MissingDataInputSchema = z.object({
  metric: MetricType.optional(),
});
type MissingDataInput = z.infer<typeof MissingDataInputSchema>;

// ── 输出 schema ──
const MissingDataOutputSchema = z.object({
  items: z.array(z.object({
    metric: z.string(),
    scope: z.string(),
    missingCount: z.number(),
    totalCount: z.number(),
    completenessPct: z.number(),
    lastAvailableDate: z.string().nullable(),
    impact: z.string(),
  })),
  hasMissingData: z.boolean(),
});
type MissingDataOutput = z.infer<typeof MissingDataOutputSchema>;

/** 查询缺失数据状态 */
export const queryMissingDataTool: ToolDefinition<MissingDataInput, MissingDataOutput> = {
  name: 'queryMissingData',
  description: '查询指定指标的缺失数据状态',
  inputSchema: MissingDataInputSchema,
  outputSchema: MissingDataOutputSchema,
  async execute(input, ctx): Promise<ToolResult<MissingDataOutput>> {
    try {
      let items = ctx.packet.missingData;

      // 按 metric 过滤
      if (input.metric) {
        items = items.filter((md) => md.metric === input.metric);
      }

      const outputItems = items.map((md) => ({
        metric: md.metric,
        scope: md.scope,
        missingCount: md.missingCount,
        totalCount: md.totalCount,
        // MissingDataItem 没有直接提供 completenessPct，需要根据 missingCount / totalCount 计算
        completenessPct: md.totalCount > 0
          ? ((md.totalCount - md.missingCount) / md.totalCount) * 100
          : 100,
        lastAvailableDate: md.lastAvailableDate ?? null,
        impact: md.impact,
      }));

      return {
        success: true,
        data: {
          items: outputItems,
          hasMissingData: items.length > 0,
        },
        evidenceIds: items.map((md) => md.evidenceId),
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'missing_data_query_error',
          message: error instanceof Error ? error.message : '查询缺失数据失败',
        },
      };
    }
  },
};

export type { MissingDataInput, MissingDataOutput };
