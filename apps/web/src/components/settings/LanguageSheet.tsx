'use client';

import { useId } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ValoSheet } from '@/components/valo/ValoSheet';
import { ValoDialog } from '@/components/valo/ValoDialog';
import { LANG_OPTIONS, LOCALE_STORAGE_KEY } from '@/i18n/constants';
import type { Locale } from '@health-advisor/shared';

/**
 * LanguageSheet —— 语言切换弹窗。
 *
 * 设计要点（对照 AccountSwitcherSheet / SwitchStatusDialog）：
 * - 同时挂载移动端 `<ValoSheet>` 与桌面端 `<ValoDialog>`（width=sm=420px），
 *   靠 Tailwind `block lg:hidden` / `hidden lg:block` 切换可见性。
 * - 列表用语义化 `<form>` + `<fieldset>` + `<legend>`（sr-only） + 原生 radio，
 *   键盘交互完全交给浏览器。
 * - 选择任意 radio 立即应用：非当前 locale 触发 `localStorage + reload`，
 *   当前 locale 仅关闭弹窗（与 LanguageSwitcher 行为一致）。
 *
 * 焦点管理 / 焦点返回 / Escape / scrim 关闭由 ValoSheet/ValoDialog 内部的
 * `useOverlayBehavior` 处理。
 */
export interface LanguageSheetProps {
  /** 是否打开 */
  open: boolean;
  /** 关闭回调 */
  onClose: () => void;
}

export function LanguageSheet({ open, onClose }: LanguageSheetProps) {
  const t = useTranslations('my.languageSheet');
  const reactId = useId();
  const legendId = `${reactId}-legend`;
  const title = t('title');

  return (
    <>
      {/* 移动端：bottom-sheet */}
      <div className="block lg:hidden" data-valo-viewport="mobile">
        <ValoSheet open={open} onClose={onClose} title={title} ariaLabel={title}>
          <div className="px-5 pb-6 pt-3" data-valo-language-switcher="mobile">
            <LanguageSwitcherForm legendId={legendId} onClose={onClose} />
          </div>
        </ValoSheet>
      </div>
      {/* 桌面端：centered dialog 420px */}
      <div className="hidden lg:block" data-valo-viewport="desktop">
        <ValoDialog open={open} onClose={onClose} title={title} width="sm" ariaLabel={title}>
          <div className="px-6 pb-6 pt-3" data-valo-language-switcher="desktop">
            <LanguageSwitcherForm legendId={legendId} onClose={onClose} />
          </div>
        </ValoDialog>
      </div>
    </>
  );
}

interface LanguageSwitcherFormProps {
  legendId: string;
  onClose: () => void;
}

function LanguageSwitcherForm({ legendId, onClose }: LanguageSwitcherFormProps) {
  const t = useTranslations('my.languageSheet');
  const currentLocale = useLocale();
  const legend = t('legend');

  function handleSelect(locale: Locale) {
    if (locale === currentLocale) {
      onClose();
      return;
    }
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    window.location.reload();
  }

  return (
    <form
      onSubmit={(e) => e.preventDefault()}
      aria-labelledby={legendId}
      data-valo-form="language-switcher"
    >
      <fieldset className="border-0 p-0 m-0">
        <legend id={legendId} className="sr-only">
          {legend}
        </legend>
        <div className="flex flex-col gap-0.5">
          {LANG_OPTIONS.map((opt) => (
            <LanguageRadioOption
              key={opt.value}
              option={opt}
              checked={opt.value === currentLocale}
              onSelect={handleSelect}
            />
          ))}
        </div>
      </fieldset>
    </form>
  );
}

interface LanguageRadioOptionProps {
  option: { value: Locale; label: string };
  checked: boolean;
  onSelect: (locale: Locale) => void;
}

function LanguageRadioOption({ option, checked, onSelect }: LanguageRadioOptionProps) {
  const reactId = useId();
  const inputId = `${reactId}-${option.value}`;
  return (
    <label
      htmlFor={inputId}
      data-valo-option={option.value}
      data-valo-checked={checked ? 'true' : 'false'}
      // 已选中的 radio 不触发 onChange，这里用 onClick 兜底：点击当前项也走 onSelect
      // （handleSelect 内部会判断当前 locale 仅关闭弹窗）。
      onClick={() => onSelect(option.value)}
      className={
        'flex min-h-10 items-center gap-2.5 rounded-lg px-1.5 py-1.5 cursor-pointer ' +
        'transition-colors select-none hover:bg-white/[0.04]'
      }
    >
      <input
        id={inputId}
        type="radio"
        name="locale"
        value={option.value}
        checked={checked}
        readOnly
        aria-label={option.label}
        data-valo-touch="true"
        className="sr-only"
      />
      <span className="min-w-0 flex-1 truncate text-xs font-normal text-[var(--valo-text-primary)]">
        {option.label}
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
