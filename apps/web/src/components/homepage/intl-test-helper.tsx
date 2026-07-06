import type { ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';

/**
 * Homepage 测试用 next-intl 包装器。
 *
 * 提供 `health.state.*`、`health.switchStatus.*`、`homepage.*` 与
 * `common.*` 的最小可用子集，让 HealthHero / SwitchStatusDialog / HomeHeader
 * / BriefTimeline / ActionCard / ActionTimerSheet / AppointmentSheet 渲染时不抛
 * MISSING_MESSAGE；翻译文案的真实性由 messages/*.json 与 I7.1 全量校验负责，
 * 这里只关心组件渲染与交互。
 *
 * 与 demo-control/intl-test-helper 同构，但 namespace 不同；为避免跨目录
 * 共享测试代码带来耦合，故意各自维护一份。
 */
const ZH_MESSAGES = {
  common: {
    close: '关闭',
  },
  homepage: {
    avatarPlaceholder: '账户切换（即将上线）',
    realtimeBrief: '实时简报',
    briefPreparing: '准备中…',
    briefNetworkError: '网络错误',
    manualRefresh: '刷新',
    refreshing: '刷新中…',
    sourceLLM: '智能健康顾问',
    sourceFallback: '离线受限模式',
    now: '现在',
    microTipsTitle: '提示',
    afternoon: { title: '下午', body: '已安排轻食与舒缓拉伸。' },
    night: { title: '晚间', body: '已就绪放松流程，建议降低屏幕亮度。' },
    action: {
      yes: '确认',
      notNow: '稍后',
      recorded: '已记录',
      dismissed: '已忽略',
    },
    timer: {
      title: '行动计时',
      pause: '暂停',
      resume: '继续',
      stop: '取消',
      completeNow: '立即完成',
    },
    appointment: {
      title: '添加到日历',
      confirm: '确认',
      cancel: '取消',
      disclaimer: '演示功能 — 不会打开日历应用',
    },
  },
  health: {
    state: {
      'prime-readiness': '最佳准备',
      'active-recovery': '积极恢复',
      'metabolic-sluggish': '代谢迟缓',
      'glycogen-depleted': '糖原耗尽',
    },
    switchStatus: {
      title: '切换状态',
      legend: '选择健康状态',
      ringLabel: '切换健康状态',
    },
  },
  // DemoControlTrigger 在 God Mode 启用时由 HomeHeader 渲染，
  // 提供最小可用 namespace 避免 MISSING_MESSAGE 警告。
  demoControl: {
    openTrigger: '打开 Demo 控制',
  },
} as const;

export function HomepageIntlProvider({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="zh" messages={ZH_MESSAGES}>
      {children}
    </NextIntlClientProvider>
  );
}

export const HOMEPAGE_TEST_MESSAGES = ZH_MESSAGES;
