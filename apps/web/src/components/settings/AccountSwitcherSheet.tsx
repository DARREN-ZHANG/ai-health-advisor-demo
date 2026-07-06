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
 * - 头像用首字母圆圈占位（演示版本，无远程 avatar URL）。
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
          <div className="px-4 py-4" data-valo-account-switcher="mobile">
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
          <div className="px-5 py-4" data-valo-account-switcher="desktop">
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
          <div className="flex flex-col gap-1">
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
  const initials = getInitials(profile.name);

  return (
    <label
      htmlFor={inputId}
      data-valo-option={profile.profileId}
      data-valo-checked={checked ? 'true' : 'false'}
      className={
        'flex items-center gap-3 rounded-xl border px-3 py-3 cursor-pointer ' +
        'transition-colors select-none ' +
        (checked
          ? 'border-[var(--valo-border)] bg-[var(--valo-border)] '
          : 'border-[var(--valo-border)] bg-transparent hover:bg-[var(--valo-border)]')
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
        className="h-5 w-5 cursor-pointer accent-[var(--valo-prime)]"
      />
      {/* 头像占位：首字母圆圈 */}
      <span
        aria-hidden="true"
        data-valo-avatar-mini={profile.profileId}
        className={
          'inline-flex h-8 w-8 items-center justify-center rounded-full shrink-0 ' +
          'bg-[var(--valo-border)] text-[var(--valo-text-primary)] ' +
          'text-xs font-semibold uppercase'
        }
      >
        {initials}
      </span>
      <span className="text-sm font-medium text-[var(--valo-text-primary)]">
        {profile.name}
      </span>
    </label>
  );
}

/**
 * 从 profile 名称提取最多 2 个字符作为头像占位首字母。
 * 中文取首字；英文取首字母（大写）。
 */
function getInitials(name: string): string {
  if (!name) return '?';
  const trimmed = name.trim();
  // 英文：按空格切分取各词首字母
  if (/^[A-Za-z]/.test(trimmed)) {
    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0]!.charAt(0).toUpperCase();
    return (parts[0]!.charAt(0) + parts[1]!.charAt(0)).toUpperCase();
  }
  // 中文 / 其他：取前 1 个字符
  return trimmed.charAt(0);
}
