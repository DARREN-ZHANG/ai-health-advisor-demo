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
    dateLabel: '今天',
    timeWindow: '时间窗口',
    dataMetric: '数据指标',
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
