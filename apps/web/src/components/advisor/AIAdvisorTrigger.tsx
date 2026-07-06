'use client';

import { m } from 'framer-motion';
import { useUIStore } from '@/stores/ui.store';
import { ChatBubbleOvalLeftEllipsisIcon } from '@heroicons/react/24/outline';
import { useTranslations } from 'next-intl';

/**
 * AI Advisor Trigger —— Valo 视觉的悬浮入口按钮。
 *
 * 设计要点（I5.1）：
 * - 仅使用 `var(--valo-*)` token，无散落的硬编码颜色字面量。
 * - 主操作背景 `--valo-prime`；通知小点使用 `--valo-active`（绿色光谱，
 *   暗示"AI 在线/可对话"，与 BottomNav 当前的 blue-500 区分开）。
 * - 移动端 `bottom-24 right-4`：BottomNav 高 64px（`bottom-0` + `h-16`），
 *   Trigger 距底 96px，安全避开导航栏。桌面端 `md:bottom-8`，不影响布局。
 * - 56px 触摸目标（`w-14 h-14`），`data-valo-touch="true"` 触发 40px 最小保证。
 * - Drawer 打开时整体隐藏（保留旧契约）。
 */
export function AIAdvisorTrigger() {
  const { toggleAdvisorDrawer, isAdvisorDrawerOpen } = useUIStore();
  const t = useTranslations('common');

  // Drawer 打开时隐藏 Trigger，避免遮罩与按钮叠加。
  if (isAdvisorDrawerOpen) return null;

  return (
    <div
      className="fixed bottom-24 right-4 z-40 md:bottom-8"
      data-valo-advisor-trigger="true"
    >
      <m.button
        type="button"
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => toggleAdvisorDrawer(true)}
        aria-label={t('openAIAdvisor')}
        data-valo-touch="true"
        className="relative w-14 h-14 rounded-full flex items-center justify-center transition-opacity hover:opacity-90 focus:outline-none focus-visible:shadow-[var(--valo-focus-ring)]"
        style={{
          backgroundColor: 'var(--valo-prime)',
          color: 'var(--valo-canvas)',
          boxShadow: 'var(--valo-shadow-elevated)',
        }}
      >
        <ChatBubbleOvalLeftEllipsisIcon className="w-7 h-7" />
        {/*
          通知小点：暗示 AI 在线、可对话。绿色 `--valo-active` 与
          prime 紫色按钮形成强对比，避免再使用旧的红色（被解读为"错误"）。
        */}
        <m.span
          className="absolute -top-1 -right-1 w-4 h-4 rounded-full border-2"
          style={{
            backgroundColor: 'var(--valo-active)',
            borderColor: 'var(--valo-canvas)',
          }}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 1, type: 'spring' }}
          aria-hidden="true"
        />
      </m.button>
    </div>
  );
}
