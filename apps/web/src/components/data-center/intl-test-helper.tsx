import type { ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';

/**
 * data-center 测试用 next-intl 包装器。
 *
 * 提供 `dataCenter.*` 与 `common.*` 的最小可用子集，让 ReflectionSection
 * 等组件渲染时不抛 MISSING_MESSAGE；翻译文案的真实性由 messages/*.json
 * 与 I7.1 全量校验负责，这里只关心组件渲染与交互。
 *
 * 与 homepage / demo-control / life-log 同构，但 namespace 不同；为避免跨
 * 目录共享测试代码带来耦合，故意各自维护一份。
 */
const ZH_MESSAGES = {
  common: {
    close: '关闭',
    loadFailed: '加载失败',
    noData: '暂无数据',
  },
  dataCenter: {
    today: 'Today',
    datePagination: '日期分页',
    previousDate: '前一天',
    nextDate: '后一天',
    sleep: '睡眠',
    activity: '活动',
    hrv: 'HRV',
    restingHr: '静息心率',
    stress: '压力负荷',
    spo2: '血氧',
    dateLabel: '今天',
    timeWindow: '时间窗口',
    dataMetric: '数据指标',
    sleepDetail: {
      durationTitle: '睡眠时长',
      durationUnit: '时',
      durationMinute: '分',
      completionLabel: '达成目标',
      completionNoGoal: '未设置目标',
      stagesTitle: '睡眠分期',
      stageDeep: '深睡',
      stageLight: '浅睡',
      stageRem: 'REM',
      stageAwake: '清醒',
      efficiencyTitle: '睡眠效率',
      efficiencyUnit: '%',
      scoreTitle: '睡眠得分',
      snapshotLabel: '快照',
      noData: '—',
    },
    activityDetail: {
      stepsLabel: '步数',
      distanceLabel: '距离',
      distanceUnit: '公里',
      caloriesLabel: '热量',
      caloriesUnit: '千卡',
      activeMinutesLabel: '活动',
      activeMinutesUnit: '分钟',
      snapshotLabel: '快照',
      noData: '—',
    },
    reflection: {
      title: '洞察',
      loading: '正在生成洞察...',
      empty: '暂无洞察',
      tipsTitle: '建议动作',
    },
  },
} as const;

export function DataCenterIntlProvider({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="zh" messages={ZH_MESSAGES}>
      {children}
    </NextIntlClientProvider>
  );
}

export const DATA_CENTER_TEST_MESSAGES = ZH_MESSAGES;
