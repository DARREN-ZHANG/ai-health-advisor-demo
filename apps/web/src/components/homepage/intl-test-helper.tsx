import type { ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';

/**
 * Homepage 测试用 next-intl 包装器。
 *
 * 提供 `health.state.*`、`health.switchStatus.*`、`homepage.*` 与
 * `common.*` 的最小可用子集，让 HealthHero / SwitchStatusDialog / HomeHeader
 * 渲染时不抛 MISSING_MESSAGE；翻译文案的真实性由 messages/*.json 与
 * I7.1 全量校验负责，这里只关心组件渲染与交互。
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
