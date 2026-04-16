'use client';

import { Container, Section, Drawer } from '@health-advisor/ui';
import { ChartRoot } from '@health-advisor/charts';
import { DataCenterControls } from '@/components/data-center/DataCenterControls';
import { ChartContainer } from '@/components/data-center/ChartContainer';
import { ViewSummaryTrigger } from '@/components/data-center/ViewSummaryTrigger';
import { ChartTokenRenderer } from '@/components/advisor/ChartTokenRenderer';
import { useDataCenterStore } from '@/stores/data-center.store';
import { useProfileStore } from '@/stores/profile.store';
import { useDataCenterQuery } from '@/hooks/use-data-query';
import { useDataChartOption } from '@/hooks/use-data-chart-option';
import { useViewSummary } from '@/hooks/use-ai-query';
import { useState } from 'react';
import type { AgentResponseEnvelope, DataCenterResponse, DataTab, StressTimelineResponse } from '@health-advisor/shared';
import { SparklesIcon, InboxIcon } from '@heroicons/react/24/outline';

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
  const [isSummaryDrawerOpen, setIsSummaryDrawerOpen] = useState(false);

  // 获取图表数据
  const { data: chartData, isLoading, isFetching, error } = useDataCenterQuery(currentProfileId, activeTab, timeframe);
  const chartOption = useDataChartOption(activeTab as DataTab, chartData);

  const isAnyLoading = isLoading || isFetching;

  // 获取 AI 总结（按需触发，点击按钮时才请求）
  const {
    data: summaryData,
    isLoading: isSummaryLoading,
    isFetching: isSummaryFetching,
    refetch: fetchSummary
  } = useViewSummary(currentProfileId, activeTab, timeframe);

  const handleSummaryClick = () => {
    setIsSummaryDrawerOpen(true);
    fetchSummary();
  };

  const isChartEmpty = !chartData || (
    activeTab === 'stress' 
      ? (chartData as StressTimelineResponse).points?.length === 0 
      : (chartData as DataCenterResponse).timeline?.length === 0
  );

  const recordCount = isAnyLoading ? '--' : (
    activeTab === 'stress'
      ? (chartData as StressTimelineResponse)?.points?.length || 0
      : (chartData as DataCenterResponse)?.metadata?.recordCount || 0
  );

  const lastUpdatedLabel = getLastUpdatedLabel(chartData, activeTab, isAnyLoading, !!error);

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
          isLoading={isAnyLoading}
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
          <p className="text-xl font-bold text-slate-200 mt-1">{lastUpdatedLabel}</p>
        </div>
        <div className="p-4 rounded-lg border border-slate-800 bg-slate-900/50">
          <p className="text-xs text-slate-500 uppercase tracking-wider">状态</p>
          <p className={`text-xl font-bold mt-1 ${error ? 'text-red-400' : 'text-green-400'}`}>
            {error ? '连接异常' : '已连接'}
          </p>
        </div>
      </div>

      {/* 悬浮总结按钮 */}
      {!isSummaryDrawerOpen && (
        <ViewSummaryTrigger onClick={handleSummaryClick} isLoading={isSummaryLoading || isSummaryFetching} />
      )}

      {/* AI 总结 Drawer */}
      <Drawer
        open={isSummaryDrawerOpen}
        onClose={() => setIsSummaryDrawerOpen(false)}
        title="AI 视图总结"
        size="lg"
      >
        <div className="space-y-6 py-2">
          {(isSummaryLoading || isSummaryFetching) ? (
            <div className="space-y-4 animate-pulse">
              <div className="h-4 bg-slate-800 rounded w-full" />
              <div className="h-4 bg-slate-800 rounded w-11/12" />
              <div className="h-4 bg-slate-800 rounded w-4/5" />
              <div className="h-32 bg-slate-800/50 rounded-xl w-full mt-8" />
            </div>
          ) : summaryData ? (
            <>
              <ResponseMetaRow response={summaryData} />
              
              <div className="bg-slate-800/30 rounded-xl p-5 border border-slate-800/50">
                <p className="text-slate-200 leading-relaxed text-sm whitespace-pre-wrap font-medium">
                  {summaryData.summary}
                </p>
              </div>

              {summaryData.chartTokens && summaryData.chartTokens.length > 0 && (
                <div className="space-y-4 pt-4">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-widest border-l-2 border-blue-500 pl-2">
                    相关数据趋势
                  </p>
                  <div className="flex flex-col gap-4">
                    {summaryData.chartTokens.map((token, i) => (
                      <ChartTokenRenderer key={i} tokenId={token} />
                    ))}
                  </div>
                </div>
              )}

              {summaryData.microTips.length > 0 && (
                <div className="space-y-4 pt-4">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-widest border-l-2 border-emerald-500 pl-2">
                    建议动作
                  </p>
                  <div className="grid grid-cols-1 gap-3">
                    {summaryData.microTips.map((tip, i) => (
                      <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/10 text-emerald-400">
                        <SparklesIcon className="w-4 h-4 mt-0.5 shrink-0" />
                        <span className="text-sm font-medium">{tip}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 space-y-4 text-slate-500">
              <InboxIcon className="w-12 h-12 opacity-20" />
              <p>无法获取总结内容</p>
            </div>
          )}
          
          <div className="pt-8 pb-4 flex justify-center">
            <button
              onClick={() => setIsSummaryDrawerOpen(false)}
              className="px-6 py-2 text-sm font-medium text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-full transition-all border border-slate-800"
            >
              关闭回顾
            </button>
          </div>
        </div>
      </Drawer>
    </Container>
  );
}

function getLastUpdatedLabel(
  data: DataCenterResponse | StressTimelineResponse | null | undefined,
  activeTab: DataTab,
  isLoading: boolean,
  hasError: boolean,
): string {
  if (isLoading) return '--';
  if (hasError) return '不可用';
  if (!data) return '无数据';

  const lastDate = activeTab === 'stress'
    ? (data as StressTimelineResponse).points.at(-1)?.date
    : (data as DataCenterResponse).timeline.at(-1)?.date;

  return lastDate ?? '无数据';
}

function ResponseMetaRow({ response }: { response: AgentResponseEnvelope }) {
  return (
    <div className="flex flex-wrap gap-2">
      <span className={`rounded px-2 py-1 text-[10px] uppercase tracking-wider ${getStatusColorClassName(response.statusColor)}`}>
        {response.statusColor}
      </span>
      <span className="rounded px-2 py-1 text-[10px] uppercase tracking-wider text-slate-300 bg-slate-800">
        {response.source}
      </span>
      <span className="rounded px-2 py-1 text-[10px] uppercase tracking-wider text-slate-400 bg-slate-900 border border-slate-800">
        {response.meta.finishReason}
      </span>
    </div>
  );
}

function getStatusColorClassName(statusColor: AgentResponseEnvelope['statusColor']): string {
  if (statusColor === 'error') {
    return 'text-red-400 bg-red-400/10';
  }

  if (statusColor === 'warning') {
    return 'text-yellow-400 bg-yellow-400/10';
  }

  return 'text-emerald-400 bg-emerald-400/10';
}
