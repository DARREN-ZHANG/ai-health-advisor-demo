'use client';

import { m } from 'framer-motion';
import { useUIStore } from '@/stores/ui.store';
import { useTranslations } from 'next-intl';

/**
 * AI Advisor Trigger —— Valo 视觉的悬浮入口按钮。
 *
 * 设计要点（I5.1）：
 * - 仅使用 `var(--valo-*)` token，无散落的硬编码颜色字面量。
 * - 入口固定在 Valo 430px app 画布右侧，而不是整个 viewport 右下角。
 * - 视觉使用本地 SVG 复刻 Figma 的紫色聊天球体与双光点素材。
 * - 64px 触摸目标，`data-valo-touch="true"` 触发 40px 最小保证。
 * - Drawer 打开时整体隐藏（保留旧契约）。
 */
export function AIAdvisorTrigger() {
  const { toggleAdvisorDrawer, isAdvisorDrawerOpen } = useUIStore();
  const t = useTranslations('common');

  // Drawer 打开时隐藏 Trigger，避免遮罩与按钮叠加。
  if (isAdvisorDrawerOpen) return null;

  return (
    <div
      className="fixed bottom-[25px] z-40"
      style={{
        right: 'max(16px, calc((100vw - 430px) / 2 + 36px))',
      }}
      data-valo-advisor-trigger="true"
    >
      <m.button
        type="button"
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.94 }}
        onClick={() => toggleAdvisorDrawer(true)}
        aria-label={t('openAIAdvisor')}
        data-valo-touch="true"
        className="relative flex h-16 w-16 items-center justify-center rounded-full
                   transition-opacity hover:opacity-95 focus:outline-none
                   focus-visible:shadow-[var(--valo-focus-ring)]"
        style={{
          background:
            'radial-gradient(circle at 36% 28%, rgba(255,255,255,0.28), transparent 24%), radial-gradient(circle at 61% 64%, var(--valo-prime) 0%, #7c3aed 44%, #43208f 78%, #271248 100%)',
          color: 'var(--valo-canvas)',
          boxShadow:
            '0 0 26px rgba(167, 139, 250, 0.52), 0 12px 34px rgba(0, 0, 0, 0.5)',
        }}
      >
        <ChatModeGlyph />
      </m.button>
    </div>
  );
}

function ChatModeGlyph() {
  return (
    <svg
      width="44"
      height="44"
      viewBox="0 0 44 44"
      fill="none"
      aria-hidden="true"
      data-valo-chat-mode-glyph="true"
    >
      <filter id="valo-chat-glow" x="3" y="4" width="38" height="36" colorInterpolationFilters="sRGB">
        <feGaussianBlur stdDeviation="3.5" />
      </filter>
      <g filter="url(#valo-chat-glow)" opacity="0.85">
        <ellipse cx="15" cy="21" rx="7" ry="11" fill="var(--valo-accent-cool)" />
        <ellipse cx="29" cy="21" rx="7" ry="11" fill="var(--valo-prime)" />
      </g>
      <ellipse cx="15" cy="21" rx="5.6" ry="9.2" fill="rgba(210, 234, 255, 0.92)" />
      <ellipse cx="29" cy="21" rx="5.6" ry="9.2" fill="rgba(226, 214, 255, 0.88)" />
      <path
        d="M22 28.5C24.9 28.5 27.2 27.7 29.1 26.3"
        stroke="rgba(255, 255, 255, 0.42)"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
