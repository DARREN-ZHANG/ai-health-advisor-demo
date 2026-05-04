'use client';

import { useState, useEffect } from 'react';
import { Container, Section, Button, Drawer } from '@health-advisor/ui';
import { Cog6ToothIcon } from '@heroicons/react/24/outline';
import { MorningBriefCard } from '@/components/homepage/MorningBriefCard';
import { ConfigArea } from '@/components/homepage/ConfigArea';
import { ActiveSensingBanner } from '@/components/layout/ActiveSensingBanner';
import { useProfileStore } from '@/stores/profile.store';
import { useMorningBrief, useRefetchBrief } from '@/hooks/use-ai-query';
import { useUIStore } from '@/stores/ui.store';
import type { StatusColor } from '@health-advisor/ui';
import { useTranslations } from 'next-intl';

export default function HomePage() {
  const { currentProfileId } = useProfileStore();
  const { showToast } = useUIStore();
  const { data, isLoading, error, isFetching } = useMorningBrief(currentProfileId);
  const refetchBrief = useRefetchBrief(currentProfileId);
  const t = useTranslations('homepage');
  const [isConfigDrawerOpen, setIsConfigDrawerOpen] = useState(false);

  const isAnyLoading = isLoading || isFetching || refetchBrief.isPending;

  useEffect(() => {
    if (error) {
      const isTimeout = error instanceof Error && 'code' in error && (error as { code: string }).code === 'TIMEOUT';
      if (!isTimeout) {
        showToast(
          t('briefFetchFailed', { error: error instanceof Error ? error.message : t('unknownError') }),
          'error'
        );
      }
    }
  }, [error, showToast, t]);

  const briefData = {
    status: mapApiStatusToUi(data?.statusColor, data?.meta.finishReason),
    title: t('realtimeBrief'),
    summary: data?.summary || (error ? t('briefNetworkError') : t('briefPreparing')),
    microTips: data?.microTips || [],
  };

  return (
    <Container className="py-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* 左侧 Config Area - 仅桌面端显示 */}
        <aside className="hidden lg:block lg:col-span-5 xl:col-span-4">
          <div className="lg:sticky lg:top-20 max-h-[calc(100dvh-6rem)] overflow-y-auto pr-2 scrollbar-hide">
            <ConfigArea disabled={isAnyLoading} />
          </div>
        </aside>

        {/* 右侧主内容区 */}
        <div className="lg:col-span-7 xl:col-span-8 space-y-8">
          {/* 顶部标题栏 */}
          <header className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-100">AI Health Advisor</h1>
              <p className="text-slate-400 text-sm">
                {describeBriefSource(data?.source, t)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {/* 移动端 Config 抽屉触发按钮 */}
              <Button
                variant="ghost"
                onClick={() => setIsConfigDrawerOpen(true)}
                className="md:hidden text-slate-400 hover:text-slate-200 hover:bg-slate-800 p-2"
                aria-label={t('openConfig')}
              >
                <Cog6ToothIcon className="w-5 h-5" />
              </Button>
              <Button
                variant="ghost"
                onClick={() => refetchBrief.mutate()}
                disabled={isAnyLoading}
                className="text-xs text-slate-500 h-auto py-1 px-2"
              >
                {refetchBrief.isPending ? t('refreshing') : t('manualRefresh')}
              </Button>
            </div>
          </header>

          {/* Active Sensing 灵动监测 */}
          <ActiveSensingBanner />

          {/* 晨报部分 */}
          <Section title={t('realtimeBrief')} className="space-y-4">
            <MorningBriefCard
              {...briefData}
              isLoading={isAnyLoading}
            />
          </Section>

          {/* 趋势数据已迁移至数据分析页 */}

          <div className="h-20" />
        </div>
      </div>

      {/* 移动端 Config 底部抽屉 */}
      <Drawer
        open={isConfigDrawerOpen}
        onClose={() => setIsConfigDrawerOpen(false)}
        side="bottom"
        size="lg"
        title={t('configTitle')}
      >
        <ConfigArea disabled={isAnyLoading} />
      </Drawer>
    </Container>
  );
}

function describeBriefSource(source: string | undefined, t: (key: string) => string) {
  if (source === 'fallback') {
    return t('sourceFallback');
  }

  if (source === 'llm') {
    return t('sourceLLM');
  }

  return t('sourceLLM');
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
