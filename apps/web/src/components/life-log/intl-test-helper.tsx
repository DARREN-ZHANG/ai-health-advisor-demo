import type { ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';

/**
 * Life Log 测试用 next-intl 包装器。
 *
 * 提供 `lifeLog.*` namespace 的最小可用子集，让 LifeLogPanel /
 * LifeLogCategorySection / LifeLogEntryRow / LifeLogEntrySheet 渲染时不抛
 * MISSING_MESSAGE。
 *
 * 与 homepage/intl-test-helper 同构；为避免跨目录共享测试代码带来耦合，
 * 故意各自维护一份。
 */
const ZH_MESSAGES = {
  lifeLog: {
    title: '生活记录',
    sessionOnlyBadge: '仅当前会话',
    category: {
      caffeine: '咖啡因',
      alcohol: '酒精',
      hydration: '饮水',
    },
    unit: {
      cup: '杯',
    },
    quickAdd: '+1 杯',
    customAdd: '自定义',
    edit: '编辑',
    delete: '删除',
    save: '保存',
    cancel: '取消',
    cups: '杯数',
    time: '时间',
    note: '备注',
    totalToday: '今日: {cups} 杯 ({amount}{unit})',
    empty: '暂无记录',
    notePlaceholder: '可选备注',
    sheetTitleAdd: '新增记录',
    sheetTitleEdit: '编辑记录',
    cupsLabel: '杯数',
    cupsStep: '0.5',
  },
  // 关闭 ValoSheet/ValoDialog 时 aria-label="关闭"，无 i18n key 依赖
  common: {
    close: '关闭',
  },
} as const;

export function LifeLogIntlProvider({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="zh" messages={ZH_MESSAGES}>
      {children}
    </NextIntlClientProvider>
  );
}

export const LIFE_LOG_TEST_MESSAGES = ZH_MESSAGES;
