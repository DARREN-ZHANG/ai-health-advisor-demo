import { z } from 'zod';
import { MetricType } from '../planner/analysis-plan';
import type { ToolDefinition, ToolExecutionContext, ToolResult } from './tool-types';

// ── 输入 schema ──
const VisibleChartInputSchema = z.object({
  chartToken: z.string().optional(),
  metric: MetricType.optional(),
});
type VisibleChartInput = z.infer<typeof VisibleChartInputSchema>;

// ── 输出 schema ──
const VisibleChartOutputSchema = z.object({
  charts: z.array(z.object({
    chartToken: z.string(),
    metric: z.string(),
    timeframe: z.string(),
    latestValue: z.number().nullable(),
    unit: z.string(),
    trend: z.string(),
  })),
});
type VisibleChartOutput = z.infer<typeof VisibleChartOutputSchema>;

/** 从 visibleCharts 查询图表事实 */
export const queryVisibleChartFactsTool: ToolDefinition<VisibleChartInput, VisibleChartOutput> = {
  name: 'queryVisibleChartFacts',
  description: '查询当前页面可见图表的数据事实',
  inputSchema: VisibleChartInputSchema,
  outputSchema: VisibleChartOutputSchema,
  async execute(input, ctx): Promise<ToolResult<VisibleChartOutput>> {
    try {
      let charts = ctx.packet.visibleCharts;

      // 按 chartToken 过滤
      if (input.chartToken) {
        charts = charts.filter((vc) => vc.chartToken === input.chartToken);
      }
      // 按 metric 过滤
      if (input.metric) {
        charts = charts.filter((vc) => vc.metric === input.metric);
      }

      if (charts.length === 0) {
        return {
          success: true,
          data: { charts: [] },
          evidenceIds: [],
        };
      }

      const chartFacts = charts.map((vc) => ({
        chartToken: vc.chartToken,
        metric: vc.metric,
        timeframe: vc.timeframe,
        latestValue: vc.dataSummary.latest?.value ?? null,
        unit: vc.dataSummary.latest?.unit ?? '',
        trend: vc.dataSummary.trendDirection,
      }));

      const allEvidenceIds = charts.flatMap((vc) => vc.evidenceIds);

      return {
        success: true,
        data: { charts: chartFacts },
        evidenceIds: allEvidenceIds,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'chart_query_error',
          message: error instanceof Error ? error.message : '查询图表数据失败',
        },
      };
    }
  },
};

export type { VisibleChartInput, VisibleChartOutput };
