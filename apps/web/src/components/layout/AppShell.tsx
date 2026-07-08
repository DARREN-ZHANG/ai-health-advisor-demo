'use client';

import { type ReactNode } from 'react';

/**
 * AppShell —— Valo 设计系统的应用骨架容器。
 *
 * 职责（最小必要）：
 * - 用 `--valo-canvas` 作为页面背景容器。
 * - 提供 `relative flex flex-col min-h-screen` 骨架，让底部导航自然参与文档流。
 * - 透传 `Navbar`、`main`、`BottomNav`、悬浮触发器与 Toast 等。
 *
 * 不负责：
 * - Providers 嵌套（仍由 layout.tsx 上一层负责）。
 * - 替换现有 BottomNav / Navbar 实现。
 * - 任何业务状态。
 *
 * 设计目标：把 layout.tsx 内联的 `<div className="relative flex flex-col ...">`
 * 提取为可复用展示型组件，便于后续页面级布局统一。
 */
export interface AppShellProps {
  /** 顶部导航（Navbar） */
  navbar?: ReactNode;
  /** 底部导航（BottomNav），位于文档流的页面底部 */
  bottomNav?: ReactNode;
  /** 右下角悬浮触发器（AI 入口等） */
  floating?: ReactNode;
  /** 全局 Toast / 抽屉等 slot */
  overlay?: ReactNode;
  /** 主体内容 */
  children: ReactNode;
  /** 追加到根容器的 className */
  className?: string;
}

export function AppShell({
  navbar,
  bottomNav,
  floating,
  overlay,
  children,
  className = '',
}: AppShellProps) {
  return (
    <div
      className={`relative flex flex-col min-h-screen ${className}`.trim()}
      style={{
        backgroundColor: 'var(--valo-canvas)',
        color: 'var(--valo-text-primary)',
      }}
    >
      {navbar}
      <main className="min-h-0 flex-1">{children}</main>
      {bottomNav}
      {floating}
      {overlay}
    </div>
  );
}
