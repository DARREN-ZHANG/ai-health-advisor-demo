import { z } from 'zod';
import { MetricType } from '../planner/analysis-plan';
import type { MetricValue, MetricSummary } from '../context/context-packet';
import type { ToolDefinition, ToolExecutionContext, ToolResult } from './tool-types';

// ── 输入 schema ──
const MetricSummaryInputSchema = z.object({
  metric: MetricType,
  dateRange: z.object({ start: z.string(), end: z.string() }).optional(),
  aggregation: z.enum(['avg', 'max', 'min', 'latest']).optional(),
});
type MetricSummaryInput = z.infer<typeof MetricSummaryInputSchema>;

// ── 输出 schema ──
const MetricSummaryOutputSchema = z.object({
  value: z.number().nullable(),
  unit: z.string(),
  trend: z.enum(['up', 'down', 'stable', 'unknown']).optional(),
  dataPoints: z.number(),
});
type MetricSummaryOutput = z.infer<typeof MetricSummaryOutputSchema>;

/** 查询指定指标在 packet 中的汇总数据 */
export const queryMetricSummaryTool: ToolDefinition<MetricSummaryInput, MetricSummaryOutput> = {
  name: 'queryMetricSummary',
  description: '查询指定指标在指定时间范围内的汇总数据',
  inputSchema: MetricSummaryInputSchema,
  outputSchema: MetricSummaryOutputSchema,
  async execute(input, ctx): Promise<ToolResult<MetricSummaryOutput>> {
    try {
      // 1. 从 visibleCharts 查找匹配 metric 的 dataSummary
      const chartMatch = ctx.packet.visibleCharts.find(
        (vc) => vc.metric === input.metric && vc.dataSummary,
      );

      // 2. 从 homepage.trend7d 查找
      const trendMatch = ctx.packet.homepage?.trend7d?.find(
        (ms) => ms.metric === input.metric,
      );

      // 优先使用 chartMatch，其次 trendMatch
      const summary = chartMatch?.dataSummary ?? trendMatch;

      if (!summary) {
        return {
          success: true,
          data: { value: null, unit: '', trend: 'unknown', dataPoints: 0 },
          evidenceIds: [],
        };
      }

      // 根据 aggregation 选择对应的 value
      const valueEntry = getAggregatedValue(summary, input.aggregation ?? 'avg');

      return {
        success: true,
        data: {
          value: valueEntry?.value ?? null,
          unit: valueEntry?.unit ?? '',
          trend: summary.trendDirection,
          dataPoints: summary.missing.totalCount - summary.missing.missingCount,
        },
        evidenceIds: summary.evidenceIds,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'metric_query_error',
          message: error instanceof Error ? error.message : '查询指标数据失败',
        },
      };
    }
  },
};

/** 根据聚合类型选择对应的 MetricValue */
function getAggregatedValue(
  summary: { latest?: MetricValue; average?: MetricValue; min?: MetricValue; max?: MetricValue },
  aggregation: 'avg' | 'max' | 'min' | 'latest',
): MetricValue | undefined {
  switch (aggregation) {
    case 'latest': return summary.latest;
    case 'avg': return summary.average;
    case 'max': return summary.max;
    case 'min': return summary.min;
  }
}

// 导出类型供 index.ts 使用
export type { MetricSummaryInput, MetricSummaryOutput };
