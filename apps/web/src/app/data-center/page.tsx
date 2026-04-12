'use client';

import { Container, Section, Modal } from '@health-advisor/ui';
import { ChartRoot } from '@health-advisor/charts';
import { DataCenterControls } from '@/components/data-center/DataCenterControls';
import { ChartContainer } from '@/components/data-center/ChartContainer';
import { ViewSummaryTrigger } from '@/components/data-center/ViewSummaryTrigger';
import { useDataCenterStore } from '@/stores/data-center.store';
import { useProfileStore } from '@/stores/profile.store';
import { useDataCenterQuery, type DataCenterResponse } from '@/hooks/use-data-query';
import { useDataChartOption } from '@/hooks/use-data-chart-option';
import { useViewSummary } from '@/hooks/use-ai-query';
import { useState } from 'react';
import type { DataTab, StressTimelineResponse } from '@health-advisor/shared';

const tabLabels: Record<string, string> = {
  sleep: '睡眠分析',
  hrv: 'HRV 趋势',
  'resting-hr': '静息心率',
  activity: '活动分布',
  spo2: '血氧饱和度',
  stress: '压力负荷',
};

export default function DataCenterPage() {
  const { activeTab, timeframe } = useDataCenterStore();
  const { currentProfileId } = useProfileStore();
  const [isSummaryModalOpen, setIsSummaryModalOpen] = useState(false);

  // 获取图表数据
  const { data: chartData, isLoading, error } = useDataCenterQuery(currentProfileId, activeTab, timeframe);
  const chartOption = useDataChartOption(activeTab as DataTab, chartData);

  // 获取 AI 总结 (按需触发通过 enabled 控制，或者直接使用 refetch)
  const { 
    data: summaryData, 
    isLoading: isSummaryLoading, 
    refetch: fetchSummary 
  } = useViewSummary(currentProfileId, activeTab, timeframe);

  const handleSummaryClick = () => {
    setIsSummaryModalOpen(true);
    fetchSummary();
  };

  const isChartEmpty = !chartData || (
    activeTab === 'stress' 
      ? (chartData as StressTimelineResponse).points?.length === 0 
      : (chartData as DataCenterResponse).timeline?.length === 0
  );

  const recordCount = isLoading ? '--' : (
    activeTab === 'stress'
      ? (chartData as StressTimelineResponse)?.points?.length || 0
      : (chartData as DataCenterResponse)?.metadata?.recordCount || 0
  );

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
        <ChartContainer 
          title={tabLabels[activeTab] || '数据指标'} 
          isLoading={isLoading}
          isEmpty={isChartEmpty}
          error={error ? '加载失败，请重试' : undefined}
        >
          {chartOption && <ChartRoot option={chartOption} height={350} />}
        </ChartContainer>
      </Section>

      {/* 补充指标卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-lg border border-slate-800 bg-slate-900/50">
          <p className="text-xs text-slate-500 uppercase tracking-wider">数据完整度</p>
          <p className="text-xl font-bold text-slate-200 mt-1">
            {recordCount} 天
          </p>
        </div>
        <div className="p-4 rounded-lg border border-slate-800 bg-slate-900/50">
          <p className="text-xs text-slate-500 uppercase tracking-wider">最后更新</p>
          <p className="text-xl font-bold text-slate-200 mt-1">今天</p>
        </div>
        <div className="p-4 rounded-lg border border-slate-800 bg-slate-900/50">
          <p className="text-xs text-slate-500 uppercase tracking-wider">状态</p>
          <p className="text-xl font-bold text-green-400 mt-1">已连接</p>
        </div>
      </div>

      {/* 悬浮总结按钮 */}
      <ViewSummaryTrigger onClick={handleSummaryClick} />

      {/* AI 总结 Modal */}
      <Modal 
        open={isSummaryModalOpen} 
        onClose={() => setIsSummaryModalOpen(false)}
        title="AI 视图总结"
      >
        <div className="space-y-4 py-2">
          {isSummaryLoading ? (
            <div className="space-y-3 animate-pulse">
              <div className="h-4 bg-slate-800 rounded w-full" />
              <div className="h-4 bg-slate-800 rounded w-5/6" />
              <div className="h-4 bg-slate-800 rounded w-4/6" />
            </div>
          ) : summaryData ? (
            <>
              <p className="text-slate-300 leading-relaxed text-sm">
                {summaryData.summary}
              </p>
              {summaryData.microTips.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-slate-800">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">建议动作</p>
                  <div className="flex flex-wrap gap-2">
                    {summaryData.microTips.map((tip, i) => (
                      <span key={i} className="text-xs px-2 py-1 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20">
                        {tip}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-slate-500 text-center py-8">无法获取总结内容</p>
          )}
          <div className="pt-4 flex justify-end">
            <button 
              onClick={() => setIsSummaryModalOpen(false)}
              className="text-xs text-slate-400 hover:text-slate-200"
            >
              关闭
            </button>
          </div>
        </div>
      </Modal>
    </Container>
  );
}
