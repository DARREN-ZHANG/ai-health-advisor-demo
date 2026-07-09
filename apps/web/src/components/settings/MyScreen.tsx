'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronRightIcon } from '@heroicons/react/24/outline';
import { LanguageSheet } from './LanguageSheet';

/**
 * MyScreen —— "My" 页面设置列表。
 * Source of truth: Figma Valo-App-Demo node 55-270, frame "My", 402 x 1064.
 *
 * 仅 `language` 行可点击，挂载 `<LanguageSheet>` 切换 locale；
 * 其他菜单项保持静态不可点击（设计稿为未来功能预留位）。
 */
const GROUP_KEYS = ['general', 'app', 'resources', 'legal'] as const;

const ROW_KEYS = {
  general: ['valoRing', 'account', 'goals', 'subscription'],
  app: ['language', 'notifications', 'appearance', 'unit'],
  resources: ['gettingStarted', 'faq'],
  legal: ['termsOfService', 'privacyPolicy'],
} as const;

export function MyScreen() {
  const t = useTranslations('my');
  const [languageOpen, setLanguageOpen] = useState(false);

  return (
    <section
      className="relative isolate h-[calc(100svh-118px)] overflow-y-auto overflow-x-hidden px-5 pb-2 pt-[54px]"
      data-valo-my="root"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-1/2 -z-10 w-full max-w-[402px] -translate-x-1/2"
        style={{
          background:
            'radial-gradient(ellipse 150px 230px at 360px 265px, rgba(86, 80, 171, 0.44) 0, rgba(86, 80, 171, 0.22) 32%, rgba(86, 80, 171, 0.08) 52%, transparent 72%), radial-gradient(ellipse 230px 190px at 150px 810px, rgba(104, 56, 174, 0.44) 0, rgba(104, 56, 174, 0.18) 42%, transparent 74%), var(--valo-canvas)',
        }}
      />

      <h1 className="mb-[38px] text-center text-[15px] font-semibold leading-none text-[var(--valo-text-primary)]">
        {t('title')}
      </h1>

      <div className="mx-auto flex w-full max-w-[358px] flex-col gap-[26px]">
        {GROUP_KEYS.map((groupKey) => (
          <section key={groupKey} aria-labelledby={`my-${groupKey}-heading`}>
            <h2
              id={`my-${groupKey}-heading`}
              className="mb-[13px] text-[15px] font-semibold leading-none text-[rgba(153,153,153,0.42)]"
            >
              {t(`groups.${groupKey}`)}
            </h2>
            <ul>
              {ROW_KEYS[groupKey].map((rowKey) =>
                rowKey === 'language' ? (
                  <MenuButton
                    key={rowKey}
                    label={t(`items.${rowKey}`)}
                    dataValoMy={rowKey}
                    onClick={() => setLanguageOpen(true)}
                  />
                ) : (
                  <MenuRow
                    key={rowKey}
                    label={t(`items.${rowKey}`)}
                    dataValoMy={rowKey}
                  />
                ),
              )}
            </ul>
          </section>
        ))}
      </div>

      <LanguageSheet open={languageOpen} onClose={() => setLanguageOpen(false)} />
    </section>
  );
}

interface MenuRowProps {
  label: string;
  dataValoMy?: string;
}

function MenuRow({ label, dataValoMy }: MenuRowProps) {
  return (
    <li
      data-valo-my={dataValoMy}
      className="flex h-[52px] items-center border-b border-white/[0.06] text-[15px] font-normal leading-none text-[var(--valo-text-primary)] last:border-b-0"
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <ChevronRightIcon
        className="h-[18px] w-[18px] shrink-0 text-[var(--valo-text-primary)]"
        strokeWidth={2}
        aria-hidden="true"
      />
    </li>
  );
}

interface MenuButtonProps {
  label: string;
  dataValoMy?: string;
  onClick: () => void;
}

function MenuButton({ label, dataValoMy, onClick }: MenuButtonProps) {
  return (
    <li
      data-valo-my={dataValoMy}
      className="border-b border-white/[0.06] last:border-b-0"
    >
      <button
        type="button"
        onClick={onClick}
        className="flex h-[52px] w-full items-center text-left text-[15px] font-normal leading-none text-[var(--valo-text-primary)]"
      >
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <ChevronRightIcon
          className="h-[18px] w-[18px] shrink-0 text-[var(--valo-text-primary)]"
          strokeWidth={2}
          aria-hidden="true"
        />
      </button>
    </li>
  );
}
