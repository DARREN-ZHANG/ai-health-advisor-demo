'use client';

import { useTranslations } from 'next-intl';
import { AdjustmentsHorizontalIcon } from '@heroicons/react/24/outline';
import { useGodModeStore } from '@/stores/god-mode.store';

/**
 * Demo Control 的浮动入口按钮。
 *
 * - 仅在 `useGodModeStore.isEnabled === true` 时渲染。
 * - 紫色（--valo-prime）脉冲点提示当前可被点击。
 * - 双语 tooltip 通过原生 `title` 属性提供；i18n 文案随 locale 切换。
 * - 点击调用 `toggleOpen()` 打开抽屉。
 * - 可访问性：`aria-haspopup='dialog'`、`aria-expanded`、`aria-controls`。
 *
 * 组件本身不做布局定位；调用方（I6.1）通过 wrapper 决定它在
 * HomeHeader 中的位置。本组件默认 fixed 在屏幕左上角仅用于
 * I2.2 的临时挂载验证（见 app/layout.tsx 中的 TEMP 注释）。
 */
export function DemoControlTrigger() {
  const isEnabled = useGodModeStore((s) => s.isEnabled);
  const isOpen = useGodModeStore((s) => s.isOpen);
  const toggleOpen = useGodModeStore((s) => s.toggleOpen);
  const t = useTranslations('demoControl');

  if (!isEnabled) return null;

  return (
    <button
      type="button"
      onClick={() => toggleOpen()}
      title={t('openTrigger')}
      aria-label={t('openTrigger')}
      aria-haspopup="dialog"
      aria-expanded={isOpen}
      aria-controls="demo-control-drawer"
      data-valo-touch="true"
      className={
        'relative inline-flex h-10 w-10 items-center justify-center rounded-full ' +
        'border border-[var(--valo-border)] bg-[var(--valo-surface)] ' +
        'text-[var(--valo-text-primary)] shadow-[var(--valo-shadow-card)] ' +
        'transition-colors hover:bg-[var(--valo-border)]'
      }
    >
      <AdjustmentsHorizontalIcon className="h-5 w-5" />
      {/* 紫色脉冲点：用 span + tailwind animate-ping 实现两层圆 */}
      <span className="pointer-events-none absolute right-1.5 top-1.5 flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--valo-prime)] opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--valo-prime)]" />
      </span>
    </button>
  );
}
