import type { ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';

/**
 * AI Advisor 测试用 next-intl 包装器。
 *
 * 提供 advisor + common.openAIAdvisor 的最小可用子集，让 Trigger /
 * SmartPrompts / Drawer 渲染时不抛 MISSING_MESSAGE。文案真实性由
 * messages/*.json 与 I7.1 的全量校验负责，这里只关心组件渲染与交互。
 */
const ZH_MESSAGES = {
  common: {
    openAIAdvisor: '打开 AI 顾问',
  },
  advisor: {
    title: 'AI 顾问',
    beta: 'BETA',
    clearChat: '清空对话',
    clearSession: '清空',
    clearConfirm: '确定要清除所有对话记录并重置 AI 会话吗？',
    welcomeTitle: '你好，我是你的健康顾问',
    welcomeSubtitle: '有什么健康问题尽管问我',
    suggestionsTitle: '试试这些问题：',
    composerPlaceholder: '输入你的问题...',
    send: '发送',
    close: '关闭',
    moreOptions: '更多选项',
    analyzing: '仔细分析中...',
    networkError: '发送失败，请检查网络连接',
    sendFailedDetail: '发送失败: {error}',
    smartPrompts: {
      sleepAnalysis: '分析我昨晚的睡眠质量',
      hrvTrends: '我最近的 HRV 趋势如何？',
      exerciseAdvice: '给我的运动计划提点建议',
      stressInquiry: '为什么我最近感觉压力很大？',
    },
  },
} as const;

export function AdvisorIntlProvider({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="zh" messages={ZH_MESSAGES}>
      {children}
    </NextIntlClientProvider>
  );
}
