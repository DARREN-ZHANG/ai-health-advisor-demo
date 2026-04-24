'use client';

import { Container, Section, Button } from '@health-advisor/ui';
import { MorningBriefCard } from '@/components/homepage/MorningBriefCard';
import { ProfileAdminSection } from '@/components/homepage/ProfileAdminSection';
import { ActiveSensingBanner } from '@/components/layout/ActiveSensingBanner';
import { useProfileStore } from '@/stores/profile.store';
import { useMorningBrief, useRefetchBrief } from '@/hooks/use-ai-query';
import { useUIStore } from '@/stores/ui.store';
import { useEffect } from 'react';
import type { StatusColor } from '@health-advisor/ui';

export default function HomePage() {
  const { currentProfileId } = useProfileStore();
  const { showToast } = useUIStore();
  const { data, isLoading, error, isFetching } = useMorningBrief(currentProfileId);
  const refetchBrief = useRefetchBrief(currentProfileId);

  const isAnyLoading = isLoading || isFetching || refetchBrief.isPending;

  useEffect(() => {
    if (error) {
      const isTimeout = error instanceof Error && 'code' in error && (error as { code: string }).code === 'TIMEOUT';
      if (!isTimeout) {
        showToast('获取简报失败: ' + (error instanceof Error ? error.message : '未知错误'), 'error');
      }
    }
  }, [error, showToast]);

  const briefData = {
    status: mapApiStatusToUi(data?.statusColor, data?.meta.finishReason),
    title: '实时简报',
    summary: data?.summary || (error ? '无法获取简报数据，请检查网络连接。' : '正在为您准备实时健康简报...'),
    microTips: data?.microTips || [],
  };

  return (
    <Container className="py-6 space-y-8">
      {/* 顶部标题栏 */}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">AI Health Advisor</h1>
          <p className="text-slate-400 text-sm">
            {describeBriefSource(data?.source)}
          </p>
        </div>
        <Button
          variant="ghost"
          onClick={() => refetchBrief.mutate()}
          disabled={isAnyLoading}
          className="text-xs text-slate-500 h-auto py-1 px-2"
        >
          {refetchBrief.isPending ? '正在刷新...' : '手动刷新'}
        </Button>
      </header>

      {/* Active Sensing 灵动监测 */}
      <ActiveSensingBanner />

      {/* 晨报部分 */}
      <Section title="实时简报" className="space-y-4">
        <MorningBriefCard
          {...briefData}
          isLoading={isAnyLoading}
        />
      </Section>

      {/* God Mode Profile 管理 */}
      <ProfileAdminSection />

      {/* 趋势数据已迁移至数据分析页 */}

      <div className="h-20" />
    </Container>
  );
}

function describeBriefSource(source?: string) {
  if (source === 'fallback') {
    return '运行在离线受限模式';
  }

  if (source === 'llm') {
    return '智能健康顾问';
  }

  return '智能健康顾问';
}

/**
 * 将 API 返回的 AgentStatusColor 映射为 UI 组件期望的 StatusColor。
 * API 使用 'error' 表示红色状态，UI 使用 'alert'。
 */
function mapApiStatusToUi(
  apiStatus?: string,
  finishReason?: string,
): StatusColor {
  if (apiStatus === 'error') return 'alert';
  if (apiStatus === 'warning') return 'warning';
  if (apiStatus === 'good') return 'good';
  // fallback 时显示警告色
  if (finishReason === 'fallback') return 'warning';
  return 'good';
}
