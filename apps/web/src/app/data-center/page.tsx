'use client';

import { Container, Section } from '@health-advisor/ui';
import { ChartRoot } from '@health-advisor/charts';
import { DataCenterControls } from '@/components/data-center/DataCenterControls';
import { ChartContainer } from '@/components/data-center/ChartContainer';
import { ViewSummaryTrigger } from '@/components/data-center/ViewSummaryTrigger';
import { useDataCenterStore } from '@/stores/data-center.store';

// Mock 图表配置，后续 Wave 5.1 联通全链路时将从 store/query 获取
const mockChartOption = {
  tooltip: {
    trigger: 'axis' as const,
    backgroundColor: '#1e293b',
    borderColor: '#334155',
    textStyle: { color: '#f8fafc' },
  },
  grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
  xAxis: {
    type: 'category' as const,
    boundaryGap: false,
    data: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
    axisLine: { lineStyle: { color: '#334155' } },
  },
  yAxis: {
    type: 'value' as const,
    axisLine: { show: false },
    splitLine: { lineStyle: { color: '#1e293b' } },
  },
  series: [
    {
      name: '数值',
      type: 'line' as const,
      smooth: true,
      data: [120, 132, 101, 134, 90, 230, 210],
      itemStyle: { color: '#3b82f6' },
      areaStyle: {
        color: {
          type: 'linear' as const,
          x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(59, 130, 246, 0.3)' },
            { offset: 1, color: 'rgba(59, 130, 246, 0)' }
          ]
        }
      }
    }
  ]
};

const tabLabels: Record<string, string> = {
  sleep: '睡眠分析',
  hrv: 'HRV 趋势',
  'resting-hr': '静息心率',
  activity: '活动分布',
  spo2: '血氧饱和度',
  stress: '压力负荷',
};

export default function DataCenterPage() {
  const { activeTab } = useDataCenterStore();

  const handleSummaryClick = () => {
    // TODO: Wave 5.1 联通 /ai/view-summary 全链路
  };

  return (
    <Container className="py-6 space-y-6 relative pb-24">
      <header>
        <h1 className="text-2xl font-bold text-slate-100">数据中心</h1>
        <p className="text-slate-400 text-sm">深度审计与复盘</p>
      </header>

      {/* 控制区域：Tab 切换与时间窗 */}
      <DataCenterControls />

      {/* 图表展示区域 */}
      <Section className="space-y-4">
        <ChartContainer title={tabLabels[activeTab] || '数据指标'}>
          <ChartRoot option={mockChartOption} height={350} />
        </ChartContainer>
      </Section>

      {/* 补充指标卡片（可选，后续可扩展） */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-lg border border-slate-800 bg-slate-900/50">
          <p className="text-xs text-slate-500 uppercase tracking-wider">周期平均值</p>
          <p className="text-xl font-bold text-slate-200 mt-1">128.5</p>
        </div>
        <div className="p-4 rounded-lg border border-slate-800 bg-slate-900/50">
          <p className="text-xs text-slate-500 uppercase tracking-wider">最高峰值</p>
          <p className="text-xl font-bold text-slate-200 mt-1">210.0</p>
        </div>
        <div className="p-4 rounded-lg border border-slate-800 bg-slate-900/50">
          <p className="text-xs text-slate-500 uppercase tracking-wider">波动率</p>
          <p className="text-xl font-bold text-green-400 mt-1">-5.2%</p>
        </div>
      </div>

      {/* 悬浮总结按钮 */}
      <ViewSummaryTrigger onClick={handleSummaryClick} />
    </Container>
  );
}
