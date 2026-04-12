'use client';

import { Container, Section } from '@health-advisor/ui';
import { MorningBriefCard } from '@/components/homepage/MorningBriefCard';
import { MicroInsightPills } from '@/components/homepage/MicroInsightPills';
import { HistoricalTrendsGrid } from '@/components/homepage/HistoricalTrendsGrid';

// Mock 数据，后续 Wave 5.1 联通全链路时将从 store/query 获取
const mockBrief = {
  status: 'good' as const,
  title: '今日早报',
  summary: '昨晚睡眠质量极佳，深睡时长达到 2 小时 30 分钟。静息心率为 58 bpm，处于理想范围。建议今日可以进行中等强度的有氧训练。',
  microTips: ['建议 23:00 前入睡', '多喝水'],
};

const mockInsights = [
  '过去 7 天平均步数 10,245',
  '心率变异性 (HRV) 稳步回升',
  '睡眠负债已清空',
  '静息心率下降 2%',
];

const mockTrends = [
  { id: 'hrv', label: 'HRV', value: 65, unit: 'ms', change: 12, status: 'good' as const },
  { id: 'sleep', label: '睡眠', value: '7.5', unit: 'h', change: -5, status: 'warning' as const },
  { id: 'activity', label: '步数', value: '12,400', unit: 'steps', change: 8, status: 'good' as const },
  { id: 'stress', label: '压力负荷', value: 24, unit: '/100', change: -15, status: 'good' as const },
];

export default function HomePage() {
  return (
    <Container className="py-6 space-y-8">
      {/* 顶部标题栏 */}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">AI Health Advisor</h1>
          <p className="text-slate-400 text-sm">智能健康顾问</p>
        </div>
      </header>

      {/* 晨报部分 */}
      <Section title="今日简报" className="space-y-4">
        <MorningBriefCard {...mockBrief} />
      </Section>

      {/* 微贴士部分 */}
      <Section title="智能洞察" className="space-y-3">
        <MicroInsightPills insights={mockInsights} />
      </Section>

      {/* 历史趋势概览 */}
      <Section title="历史趋势" className="space-y-4">
        <HistoricalTrendsGrid trends={mockTrends} />
      </Section>

      {/* 底部占位，后续 Wave 4.3 接入 AI Advisor 浮动入口 */}
      <div className="h-20" />
    </Container>
  );
}
