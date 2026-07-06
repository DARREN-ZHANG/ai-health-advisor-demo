'use client';

import { useState, useRef, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { useLocale } from 'next-intl';
import {
  UserCircleIcon,
  LanguageIcon,
  Cog6ToothIcon,
  BellAlertIcon,
  QuestionMarkCircleIcon,
  InformationCircleIcon,
  ArrowRightStartOnRectangleIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline';
import { ValoCard } from '@/components/valo/ValoCard';
import { AccountSwitcherSheet } from './AccountSwitcherSheet';
import { useProfilesQuery } from '@/hooks/use-profiles-query';
import { useProfileStore } from '@/stores/profile.store';
import type { Locale } from '@health-advisor/shared';

/**
 * MyScreen —— "我的" 页面内容。
 *
 * 设计意图（参见 docs/ui/valo/design-manifest.md "My" frame）：
 * - 顶部：当前 Profile 头部（avatar + 名称）。
 * - 列表：Account（可点） + Language（可点，内联切换）+ 多个 visibly disabled 项。
 * - Account 行点击打开 `<AccountSwitcherSheet>`（复用 HomeHeader 的同一组件）。
 * - Language 行点击直接在 zh / en 之间切换（与 LanguageSwitcher 同样的 reload-based 模式）。
 *   本页面不引入 `<LanguageSwitcher>` 的浮层，刻意保持极简。
 * - 其它菜单项（Settings / Notifications / Help / About / Logout）在演示版本
 *   visibly disabled：`aria-disabled="true"` + `disabled` + opacity-50 + cursor-not-allowed。
 *
 * 颜色全部走 CSS 变量；不出现硬编码色值。
 */
const LOCALE_STORAGE_KEY = 'lang';

export function MyScreen() {
  const t = useTranslations('my');
  const locale = useLocale();
  const { currentProfileId } = useProfileStore();
  const { data } = useProfilesQuery();
  const [isAccountSheetOpen, setIsAccountSheetOpen] = useState(false);
  const accountTriggerRef = useRef<HTMLButtonElement>(null);

  const currentProfile = data?.find((p) => p.profileId === currentProfileId);
  const currentProfileName = currentProfile?.name ?? currentProfileId;
  const currentInitials = getInitials(currentProfileName);

  function handleLanguageClick() {
    const next: Locale = locale === 'zh' ? 'en' : 'zh';
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
    // 与 LanguageSwitcher 一致：reload 重新走 i18n 路由
    window.location.reload();
  }

  return (
    <section
      className="flex flex-col gap-4 px-4 pt-6 pb-8 max-w-xl mx-auto"
      data-valo-my="root"
    >
      <h1 className="text-2xl font-semibold text-[var(--valo-text-primary)]">
        {t('title')}
      </h1>

      {/* 当前 Profile 头部 */}
      <ValoCard>
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            data-valo-avatar-current="true"
            className={
              'inline-flex h-12 w-12 items-center justify-center rounded-full ' +
              'bg-[var(--valo-border)] text-[var(--valo-text-primary)] ' +
              'text-base font-semibold uppercase shrink-0'
            }
          >
            {currentInitials}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-[var(--valo-text-secondary)]">
              {t('currentProfileLabel')}
            </p>
            <p
              className="text-base font-medium text-[var(--valo-text-primary)] truncate"
              data-valo-my="current-profile-name"
            >
              {currentProfileName}
            </p>
          </div>
        </div>
      </ValoCard>

      {/* 列表 */}
      <ValoCard as="ul" className="p-0 overflow-hidden">
        {/* Account —— 唯一入口 */}
        <li className="border-b border-[var(--valo-border)] last:border-b-0">
          <EnabledRow
            label={t('section.account')}
            icon={<UserCircleIcon className="h-5 w-5" />}
            onClick={() => setIsAccountSheetOpen(true)}
            ariaLabel={t('openAccountSwitcher')}
            buttonRef={accountTriggerRef}
            dataValoMy="account"
          />
        </li>

        {/* Language —— 内联切换 */}
        <li className="border-b border-[var(--valo-border)] last:border-b-0">
          <EnabledRow
            label={t('section.language')}
            icon={<LanguageIcon className="h-5 w-5" />}
            onClick={handleLanguageClick}
            ariaLabel={t('openLanguageSwitcher')}
            trailing={
              <span
                className="text-xs uppercase text-[var(--valo-text-secondary)]"
                data-valo-my="current-locale"
              >
                {locale}
              </span>
            }
            dataValoMy="language"
          />
        </li>

        {/* 以下 disabled */}
        <DisabledRow
          label={t('section.settings')}
          icon={<Cog6ToothIcon className="h-5 w-5" />}
          dataValoMy="settings"
        />
        <DisabledRow
          label={t('section.notifications')}
          icon={<BellAlertIcon className="h-5 w-5" />}
          dataValoMy="notifications"
        />
        <DisabledRow
          label={t('section.help')}
          icon={<QuestionMarkCircleIcon className="h-5 w-5" />}
          dataValoMy="help"
        />
        <DisabledRow
          label={t('section.about')}
          icon={<InformationCircleIcon className="h-5 w-5" />}
          dataValoMy="about"
        />
        <DisabledRow
          label={t('section.logout')}
          icon={<ArrowRightStartOnRectangleIcon className="h-5 w-5" />}
          dataValoMy="logout"
        />
      </ValoCard>

      <p
        className="text-xs text-[var(--valo-text-secondary)] text-center"
        data-valo-my="disabled-hint"
      >
        {t('disabledHint')}
      </p>

      {/* Account 行触发的账户切换弹窗（与 HomeHeader 同一个组件） */}
      <AccountSwitcherSheet
        open={isAccountSheetOpen}
        onClose={() => setIsAccountSheetOpen(false)}
        triggerRef={accountTriggerRef}
      />
    </section>
  );
}

interface EnabledRowProps {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  ariaLabel: string;
  buttonRef?: React.RefObject<HTMLButtonElement | null>;
  trailing?: ReactNode;
  dataValoMy?: string;
}

function EnabledRow({
  label,
  icon,
  onClick,
  ariaLabel,
  buttonRef,
  trailing,
  dataValoMy,
}: EnabledRowProps) {
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      data-valo-touch="true"
      data-valo-my={dataValoMy}
      data-valo-disabled="false"
      className={
        'w-full flex items-center gap-3 px-4 py-3 text-left ' +
        'transition-colors hover:bg-[var(--valo-border)] ' +
        'text-[var(--valo-text-primary)]'
      }
    >
      <span className="text-[var(--valo-text-secondary)] shrink-0" aria-hidden="true">
        {icon}
      </span>
      <span className="flex-1 text-sm font-medium">{label}</span>
      {trailing}
      <ChevronRightIcon
        className="h-4 w-4 text-[var(--valo-text-secondary)] shrink-0"
        aria-hidden="true"
      />
    </button>
  );
}

interface DisabledRowProps {
  label: string;
  icon: ReactNode;
  dataValoMy?: string;
}

function DisabledRow({ label, icon, dataValoMy }: DisabledRowProps) {
  return (
    <li className="border-b border-[var(--valo-border)] last:border-b-0">
      <button
        type="button"
        disabled
        aria-disabled="true"
        tabIndex={-1}
        data-valo-my={dataValoMy}
        data-valo-disabled="true"
        className={
          'w-full flex items-center gap-3 px-4 py-3 text-left ' +
          'opacity-50 cursor-not-allowed ' +
          'text-[var(--valo-text-primary)]'
        }
      >
        <span className="text-[var(--valo-text-secondary)] shrink-0" aria-hidden="true">
          {icon}
        </span>
        <span className="flex-1 text-sm font-medium">{label}</span>
      </button>
    </li>
  );
}

/**
 * 从 profile 名称提取首字母作为 avatar 占位。
 * 与 AccountSwitcherSheet 中的逻辑保持一致。
 */
function getInitials(name: string): string {
  if (!name) return '?';
  const trimmed = name.trim();
  if (/^[A-Za-z]/.test(trimmed)) {
    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0]!.charAt(0).toUpperCase();
    return (parts[0]!.charAt(0) + parts[1]!.charAt(0)).toUpperCase();
  }
  return trimmed.charAt(0);
}
