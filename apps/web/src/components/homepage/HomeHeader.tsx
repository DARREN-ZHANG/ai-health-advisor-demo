'use client';

import { forwardRef, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { UserCircleIcon } from '@heroicons/react/24/outline';
import { DemoControlTrigger } from '@/components/demo-control/DemoControlTrigger';
import { AccountSwitcherSheet } from '@/components/settings/AccountSwitcherSheet';

/**
 * HomeHeader —— 首页顶部栏。
 *
 * 布局（参见 docs/ui/valo/design-manifest.md）：
 * - 左：Avatar（profile switcher 入口）。点击打开 `<AccountSwitcherSheet>`。
 * - 紧邻 Avatar：Demo Control 触发器（仅 God Mode 启用时渲染）。
 *
 * Hero（HealthHero）由父页面渲染，放在 HomeHeader 下方；本组件不直接
 * 持有 Hero，便于 I3.2 在 Hero 与下方内容之间插入更多模块。
 *
 * I6.1 之前 Avatar 是占位 toast；本任务接入真正的 Profile Switch Sheet。
 */
export interface HomeHeaderProps {
  /**
   * Avatar 点击的扩展点。
   *
   * 默认行为是打开 AccountSwitcherSheet；如果父组件需要自定义
   * （例如 demo / 测试），传入此 prop 会跳过默认 Sheet。
   */
  onAvatarClick?: () => void;
}

export function HomeHeader({ onAvatarClick }: HomeHeaderProps) {
  const t = useTranslations('homepage');
  const [isAccountSheetOpen, setIsAccountSheetOpen] = useState(false);
  const avatarRef = useRef<HTMLButtonElement>(null);

  const handleAvatarClick = () => {
    if (onAvatarClick) {
      onAvatarClick();
      return;
    }
    setIsAccountSheetOpen(true);
  };

  const avatarLabel = t('avatarPlaceholder');

  return (
    <>
      <header
        className="flex items-center gap-2 px-4 pt-4"
        data-valo-header="home"
      >
        <AvatarButton
          ref={avatarRef}
          onClick={handleAvatarClick}
          label={avatarLabel}
          expanded={isAccountSheetOpen}
        />
        {/* Demo Control 触发器自管可见性（God Mode 关时返回 null） */}
        <DemoControlTrigger />
      </header>

      <AccountSwitcherSheet
        open={isAccountSheetOpen}
        onClose={() => setIsAccountSheetOpen(false)}
        triggerRef={avatarRef}
      />
    </>
  );
}

interface AvatarButtonProps {
  onClick: () => void;
  label: string;
  expanded: boolean;
}

const AvatarButton = forwardRef<HTMLButtonElement, AvatarButtonProps>(
  function AvatarButton({ onClick, label, expanded }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        onClick={onClick}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={expanded}
        data-valo-touch="true"
        data-valo-avatar="true"
        className={
          'inline-flex h-10 w-10 items-center justify-center rounded-full ' +
          'border border-[var(--valo-border)] bg-[var(--valo-surface)] ' +
          'text-[var(--valo-text-secondary)] transition-colors ' +
          'hover:text-[var(--valo-text-primary)] hover:bg-[var(--valo-border)]'
        }
      >
        <UserCircleIcon className="h-6 w-6" />
      </button>
    );
  },
);
