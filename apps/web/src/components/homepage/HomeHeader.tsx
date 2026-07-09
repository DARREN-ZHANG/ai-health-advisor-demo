'use client';

import { forwardRef, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { DemoControlTrigger } from '@/components/demo-control/DemoControlTrigger';
import { AccountSwitcherSheet } from '@/components/settings/AccountSwitcherSheet';
import { useProfileStore } from '@/stores/profile.store';

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
  const currentProfile = useProfileStore((state) => state.currentProfile);

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
      <div className="relative z-20 -mx-4 h-[128px]" data-valo-header-shell="home">
        <header
          className="absolute left-0 right-0 top-[68px] flex h-10 items-center justify-between bg-transparent px-[22px]"
          data-valo-header="home"
        >
          <div className="flex items-center gap-3">
            <AvatarButton
              ref={avatarRef}
              onClick={handleAvatarClick}
              label={avatarLabel}
              expanded={isAccountSheetOpen}
              avatar={currentProfile?.avatar ?? 'avatar-1.png'}
            />
            {/* Demo Control 触发器自管可见性（God Mode 关时返回 null） */}
            <DemoControlTrigger />
          </div>

          <div
            aria-label="Valo"
            className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          >
            <ValoMark />
          </div>

          <div
            aria-label={t('readinessScore', { score: 80 })}
            className="relative grid h-10 w-10 place-items-center rounded-full border-2 border-[var(--valo-text-primary)] text-sm font-semibold leading-none text-[var(--valo-text-primary)] shadow-[0_0_16px_color-mix(in_srgb,var(--valo-active)_42%,transparent)]"
            data-valo-readiness-score="true"
          >
            <span
              aria-hidden="true"
              className="absolute -top-1 left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-[var(--valo-active)]"
            />
            80
          </div>
        </header>
      </div>

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
  avatar: string;
}

const AvatarButton = forwardRef<HTMLButtonElement, AvatarButtonProps>(
  function AvatarButton({ onClick, label, expanded, avatar }, ref) {
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
          'inline-flex h-10 w-10 overflow-hidden items-center justify-center rounded-full ' +
          'border border-white/20 bg-[var(--valo-surface)] transition-colors ' +
          'hover:border-white/40'
        }
      >
        <img
          src={`/valo/images/${avatar}`}
          alt=""
          aria-hidden="true"
          className="h-full w-full object-cover"
        />
      </button>
    );
  },
);

function ValoMark() {
  return (
    <img
      src="/valo/images/valo-logo.png"
      alt=""
      aria-hidden="true"
      className="h-[10px] w-[116px] object-contain"
    />
  );
}
