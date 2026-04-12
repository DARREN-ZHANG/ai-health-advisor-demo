'use client';

import { Container, Section, Button } from '@health-advisor/ui';
import { MorningBriefCard } from '@/components/homepage/MorningBriefCard';
import { MicroInsightPills } from '@/components/homepage/MicroInsightPills';
import { HistoricalTrendsGrid } from '@/components/homepage/HistoricalTrendsGrid';
import { useProfileStore } from '@/stores/profile.store';
import { useMorningBrief } from '@/hooks/use-ai-query';
import type { StatusColor } from '@health-advisor/ui';

import { useUIStore } from '@/stores/ui.store';
import { useEffect } from 'react';

export default function HomePage() {
  const { currentProfileId } = useProfileStore();
  const { showToast } = useUIStore();
  const { data, isLoading, error, refetch, isRefetching } = useMorningBrief(currentProfileId);

  useEffect(() => {
    if (error) {
      showToast('获取简报失败: ' + (error instanceof Error ? error.message : '未知错误'), 'error');
    }
  }, [error, showToast]);

  // Fallback data mapping
  const briefData = {
    status: (data?.meta.finishReason === 'fallback' ? 'warning' : 'good') as StatusColor,
    title: '今日简报',
    summary: data?.summary || (error ? '无法获取简报数据，请检查网络连接。' : '正在为您准备今日健康简报...'),
    microTips: data?.microTips || [],
  };

  const insights = data?.microTips || [];

  // TODO: Wave 5.1 后续将从真实的 chart-data 接口获取趋势值
  const mockTrends = [
    { id: 'hrv', label: 'HRV', value: '--', unit: 'ms', change: 0, status: 'good' as const },
    { id: 'sleep', label: '睡眠', value: '--', unit: 'h', change: 0, status: 'warning' as const },
    { id: 'activity', label: '步数', value: '--', unit: 'steps', change: 0, status: 'good' as const },
    { id: 'stress', label: '压力负荷', value: '--', unit: '/100', change: 0, status: 'good' as const },
  ];

  return (
    <Container className="py-6 space-y-8">
      {/* 顶部标题栏 */}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">AI Health Advisor</h1>
          <p className="text-slate-400 text-sm">
            {data?.meta.finishReason === 'fallback' ? '⚠️ 运行在离线受限模式' : '智能健康顾问'}
          </p>
        </div>
        <Button 
          variant="ghost" 
          onClick={() => refetch()} 
          disabled={isLoading || isRefetching}
          className="text-xs text-slate-500 h-auto py-1 px-2"
        >
          {isRefetching ? '正在刷新...' : '手动刷新'}
        </Button>
      </header>

      {/* 晨报部分 */}
      <Section title="今日简报" className="space-y-4">
        <MorningBriefCard 
          {...briefData} 
          isLoading={isLoading} 
        />
      </Section>

      {/* 微贴士部分 */}
      <Section title="智能洞察" className="space-y-3">
        <MicroInsightPills insights={insights} />
      </Section>

      {/* 历史趋势概览 */}
      <Section title="历史趋势" className="space-y-4">
        <HistoricalTrendsGrid trends={mockTrends} />
      </Section>

      <div className="h-20" />
    </Container>
  );
}
