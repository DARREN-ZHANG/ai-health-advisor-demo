'use client';

import { PlanScreen } from '@/components/plan/PlanScreen';

/**
 * /plan 路由页面。
 *
 * 仅挂载 PlanScreen；移动底部导航与桌面导航都暴露 /plan 入口，
 * AI Advisor 仍是独立的全局浮动入口。
 */
export default function PlanPage() {
  return <PlanScreen />;
}
