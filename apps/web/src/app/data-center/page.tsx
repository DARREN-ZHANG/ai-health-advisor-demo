'use client';

import { Container } from '@health-advisor/ui';
import { DataCenterControls } from '@/components/data-center/DataCenterControls';
import { ChartContainer } from '@/components/data-center/ChartContainer';
import { ReflectionSection } from '@/components/data-center/ReflectionSection';
import { useDataCenterStore } from '@/stores/data-center.store';
import { useProfileStore } from '@/stores/profile.store';
import { useMemo } from 'react';
import type { DataTab } from '@health-advisor/shared';
import { useTranslations } from 'next-intl';

/** tab 到翻译键的映射 */
const TAB_TITLE_KEYS: Record<string, string> = {
  overview: 'tabOverview',
  sleep: 'tabSleep',
  hrv: 'tabHrv',
  'resting-hr': 'tabRestingHr',
  activity: 'tabActivity',
  spo2: 'tabSpo2',
  stress: 'tabStress',
};

const STATIC_CHARTS: Partial<Record<DataTab, { src: string; alt: string }[]>> = {
  sleep: [1, 2, 3, 4, 5].map((index) => ({
    src: `/valo/images/sleep-chart-${index}.png`,
    alt: `Sleep chart ${index}`,
  })),
  activity: [1, 2, 3, 4].map((index) => ({
    src: `/valo/images/activity-chart-${index}.png`,
    alt: `Activity chart ${index}`,
  })),
};

export default function DataCenterPage() {
  const { activeTab, timeframe } = useDataCenterStore();
  const { currentProfileId } = useProfileStore();
  const t = useTranslations('dataCenter');
  const staticCharts = STATIC_CHARTS[activeTab] ?? STATIC_CHARTS.sleep!;

  // ReflectionSection 内部自行调用 useViewSummary；这里不再重复请求。
  const reflectionPageContext = useMemo(
    () => ({ page: 'data-center' as const, tab: activeTab, timeframe }),
    [activeTab, timeframe],
  );

  return (
    <Container className="relative w-full max-w-[430px] overflow-x-hidden !px-0 pb-20 pt-[22px]">
      <h1 className="sr-only">{t('pageTitle')}</h1>

      <DataCenterControls />

      <ReflectionSection
        profileId={currentProfileId}
        pageContext={reflectionPageContext}
      />

      <ChartContainer title={t(TAB_TITLE_KEYS[activeTab] || 'dataMetric')}>
        <StaticChartStack charts={staticCharts} />
      </ChartContainer>
    </Container>
  );
}

function StaticChartStack({
  charts,
}: {
  charts: { src: string; alt: string }[];
}) {
  return (
    <div className="flex flex-col gap-4" data-valo-static-charts="">
      {charts.map((chart) => (
        <img
          key={chart.src}
          src={chart.src}
          alt={chart.alt}
          className="block h-auto w-full select-none"
          draggable={false}
        />
      ))}
    </div>
  );
}
