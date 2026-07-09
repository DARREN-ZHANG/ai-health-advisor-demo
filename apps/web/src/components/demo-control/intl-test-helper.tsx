import type { ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';

/**
 * Demo Control 测试用 next-intl 包装器。
 *
 * 提供 demo control + godMode.segments + godMode.segmentsHelp 的最小可用子集，
 * 让组件渲染时不抛 MISSING_MESSAGE；翻译文案的真实性由 messages/*.json 与
 * I7.1 的全量校验负责，这里只关心组件渲染与交互。
 *
 * 仅在 demo-control 测试中使用；I7.1 接入更通用方案时可以下沉。
 */
const ZH_MESSAGES = {
  demoControl: {
    title: '添加事件',
    add: '添加',
    live: 'LIVE',
    close: '关闭',
    openTrigger: '打开 Demo 控制',
    currentTime: '当前时间',
    events: '事件',
    recentEvents: '近期事件',
    noRecentEvents: '暂无近期事件',
    advanceOneHour: '+1h',
    reset: '重置',
    groupDailyRhythm: '日常节律',
    groupSportTraining: '运动训练',
    groupStateIntake: '状态与摄入',
    segmentCount: '{count, plural, other {# 个片段}}',
    help: '帮助',
    operationFailed: '操作失败',
    advanceFailed: '推进时钟失败',
    resetFailed: '重置时间轴失败',
    resetSucceeded: '时间轴已重置',
    resetConfirmTitle: '重置时间轴？',
    resetConfirmDescription: '将清空当前 Profile 的全部演示时间轴数据。',
    resetConfirmAction: '重置',
    resetConfirmCancel: '取消',
  },
  godMode: {
    segments: {
      mealIntake: '进餐',
      steadyCardio: '有氧',
      prolongedSedentary: '久坐',
      intermittentExercise: 'HIIT 运动',
      walk: '散步',
      sleep: '睡眠',
      nap: '小憩',
      deepFocus: '专注',
      anxietyEpisode: '焦虑',
      alcoholIntake: '饮酒',
      caffeineIntake: '咖啡因',
      relaxation: '放松',
      strengthTraining: '力量',
    },
    segmentsHelp: {
      mealIntake: '心率 65→85 缓升后回落，步数极少。',
      steadyCardio: '心率 120-150 持续高位。',
      prolongedSedentary: '心率 56-72 极低位，步数为零。',
      intermittentExercise: '心率在 120-180 与 65-95 间交替。',
      walk: '心率 85-125 中等，步数稳定累积。',
      sleep: '心率随睡眠阶段变化，步数为零。',
      nap: '心率 52-62 低位，步数为零。',
      deepFocus: '心率 50-66 低位平稳，步数为零。',
      anxietyEpisode: '心率正弦波式飙升，体动焦躁。',
      alcoholIntake: '心率渐升，HRV 下降。',
      caffeineIntake: '心率渐升，HRV 下降。',
      relaxation: '心率 47-57 低位放松。',
      strengthTraining: '心率在组内与休息间交替。',
    },
  },
} as const;

export function DemoControlIntlProvider({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="zh" messages={ZH_MESSAGES}>
      {children}
    </NextIntlClientProvider>
  );
}
