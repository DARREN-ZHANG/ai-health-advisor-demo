'use client';

import { useId, type RefObject } from 'react';
import { useTranslations } from 'next-intl';
import { ValoSheet } from '@/components/valo/ValoSheet';
import { ValoDialog } from '@/components/valo/ValoDialog';
import { useProfilesQuery } from '@/hooks/use-profiles-query';
import { useProfileStore } from '@/stores/profile.store';
import { useUIStore } from '@/stores/ui.store';
import { useGodModeActions } from '@/hooks/use-god-mode-actions';
import type { ProfileSummary } from '@/hooks/use-profiles-query';

/**
 * AccountSwitcherSheet —— 账户切换弹窗。
 *
 * 设计要点（参见 docs/ui/valo/design-manifest.md "Switch Account"）：
 * - 同时挂载移动端 `<ValoSheet>` 与桌面端 `<ValoDialog>`（centered, width=sm=420px），
 *   靠 Tailwind `block lg:hidden` / `hidden lg:block` 切换可见性。与 SwitchStatusDialog 同构。
 * - 列表用语义化 `<form>` + `<fieldset>` + `<legend>`（sr-only） + 原生 radio，
 *   键盘交互完全交给浏览器。
 * - 选择任意 radio 立即调用 `switchProfile(id)`；成功则关闭弹窗，失败弹 toast。
 *   不放 Timeline / Status 切换条目 —— 那些有自己的入口。
 * - 头像和姓名来自 Profile 基础信息。
 *
 * 焦点管理 / 焦点返回 / Escape / scrim 关闭由 ValoSheet/ValoDialog 内部的
 * `useOverlayBehavior` 处理，`triggerRef` 仅作契约保留。
 */
export interface AccountSwitcherSheetProps {
  /** 是否打开 */
  open: boolean;
  /** 关闭回调 */
  onClose: () => void;
  /** 触发器 ref，用于关闭后焦点返回（当前由 overlay hook 自动处理） */
  triggerRef?: RefObject<HTMLButtonElement | null>;
}

export function AccountSwitcherSheet({
  open,
  onClose,
}: AccountSwitcherSheetProps) {
  const t = useTranslations('accountSwitcher');
  const reactId = useId();
  const legendId = `${reactId}-legend`;

  const title = t('title');

  return (
    <>
      {/* 移动端：bottom-sheet */}
      <div className="block lg:hidden" data-valo-viewport="mobile">
        <ValoSheet
          open={open}
          onClose={onClose}
          title={title}
          ariaLabel={title}
        >
          <div className="px-5 pb-6 pt-3" data-valo-account-switcher="mobile">
            <AccountSwitcherForm legendId={legendId} onClose={onClose} />
          </div>
        </ValoSheet>
      </div>
      {/* 桌面端：centered dialog 420px */}
      <div className="hidden lg:block" data-valo-viewport="desktop">
        <ValoDialog
          open={open}
          onClose={onClose}
          title={title}
          width="sm"
          ariaLabel={title}
        >
          <div className="px-6 pb-6 pt-3" data-valo-account-switcher="desktop">
            <AccountSwitcherForm legendId={legendId} onClose={onClose} />
          </div>
        </ValoDialog>
      </div>
    </>
  );
}

interface AccountSwitcherFormProps {
  legendId: string;
  onClose: () => void;
}

function AccountSwitcherForm({ legendId, onClose }: AccountSwitcherFormProps) {
  const t = useTranslations('accountSwitcher');
  const { showToast } = useUIStore();
  const { currentProfileId } = useProfileStore();
  const { switchProfile, isSwitchingProfile } = useGodModeActions();
  const { data, isLoading, isError } = useProfilesQuery();

  const legend = t('legend');

  async function handleSelect(profile: ProfileSummary) {
    if (profile.profileId === currentProfileId || isSwitchingProfile) {
      return;
    }
    try {
      await switchProfile(profile.profileId);
      onClose();
    } catch {
      showToast(t('switchFailed'), 'error');
    }
  }

  return (
    <form
      onSubmit={(e) => e.preventDefault()}
      aria-labelledby={legendId}
      data-valo-form="account-switcher"
    >
      <fieldset className="border-0 p-0 m-0" disabled={isSwitchingProfile}>
        <legend id={legendId} className="sr-only">
          {legend}
        </legend>

        {isLoading ? (
          <p
            className="text-sm text-[var(--valo-text-secondary)] py-4 text-center"
            data-valo-state="loading"
          >
            {t('loading')}
          </p>
        ) : isError ? (
          <p
            className="text-sm text-[var(--valo-text-secondary)] py-4 text-center"
            data-valo-state="error"
          >
            {t('error')}
          </p>
        ) : !data || data.length === 0 ? (
          <p
            className="text-sm text-[var(--valo-text-secondary)] py-4 text-center"
            data-valo-state="empty"
          >
            {t('empty')}
          </p>
        ) : (
          <div className="flex flex-col gap-0.5">
            {data.map((profile) => (
              <ProfileRadioOption
                key={profile.profileId}
                profile={profile}
                checked={profile.profileId === currentProfileId}
                onSelect={handleSelect}
              />
            ))}
          </div>
        )}
      </fieldset>
    </form>
  );
}

interface ProfileRadioOptionProps {
  profile: ProfileSummary;
  checked: boolean;
  onSelect: (profile: ProfileSummary) => void;
}

function ProfileRadioOption({
  profile,
  checked,
  onSelect,
}: ProfileRadioOptionProps) {
  const reactId = useId();
  const inputId = `${reactId}-${profile.profileId}`;
  return (
    <label
      htmlFor={inputId}
      data-valo-option={profile.profileId}
      data-valo-checked={checked ? 'true' : 'false'}
      className={
        'flex min-h-10 items-center gap-2.5 rounded-lg px-1.5 py-1.5 cursor-pointer ' +
        'transition-colors select-none hover:bg-white/[0.04]'
      }
    >
      <input
        id={inputId}
        type="radio"
        name="profile"
        value={profile.profileId}
        checked={checked}
        onChange={() => onSelect(profile)}
        aria-label={profile.name}
        data-valo-touch="true"
        className="sr-only"
      />
      <img
        src={`/valo/images/${profile.avatar}`}
        alt=""
        data-valo-avatar-mini={profile.profileId}
        className="h-6 w-6 shrink-0 rounded-full object-cover"
      />
      <span className="min-w-0 flex-1 truncate text-xs font-normal text-[var(--valo-text-primary)]">
        {profile.name}
      </span>
      <span
        aria-hidden="true"
        className={
          'grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full border ' +
          (checked
            ? 'border-[var(--valo-active)] bg-[var(--valo-active)] shadow-[0_0_10px_color-mix(in_srgb,var(--valo-active)_60%,transparent)]'
            : 'border-white/35')
        }
      >
        {checked && (
          <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 text-black" fill="none">
            <path
              d="m3 6.1 1.8 1.8L9 3.8"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>
    </label>
  );
}
