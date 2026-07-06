'use client';

import { useId, useState } from 'react';
import { ChevronDownIcon } from '@heroicons/react/24/outline';
import { useTranslations } from 'next-intl';
import { EVENT_TYPE_DISPLAY } from './timeline-segments';

/**
 * 事件入参的最小契约，与 shared 的 RecognizedEvent 兼容；
 * 此处只声明需要的字段，避免把整个 shared 类型拖入。
 */
export interface RecentEventEntry {
  readonly recognizedEventId: string;
  readonly type: string;
  /** ISO 字符串 YYYY-MM-DDTHH:mm */
  readonly start: string;
  readonly end: string;
}

export interface RecentEventsDisclosureProps {
  events: ReadonlyArray<RecentEventEntry>;
  /** 初始是否展开；默认 false */
  initiallyOpen?: boolean;
}

/**
 * 折叠展开的近期事件列表。
 *
 * - 头部按钮带 chevron 图标，展开时旋转 180°。
 * - 列表为 `<ul>`，每项渲染图标 + 文案 + 时间区间。
 * - 事件类型来自 EVENT_TYPE_DISPLAY，缺失时回退到 type 字面量。
 * - 空列表：头部按钮被禁用，文案替换为「暂无近期事件」。
 * - 仅引用 `--valo-*` token。
 */
export function RecentEventsDisclosure({
  events,
  initiallyOpen = false,
}: RecentEventsDisclosureProps) {
  const t = useTranslations('demoControl');
  const listId = useId();
  const [open, setOpen] = useState(initiallyOpen);
  const isEmpty = events.length === 0;

  const toggle = () => {
    if (isEmpty) return;
    setOpen((prev) => !prev);
  };

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        disabled={isEmpty}
        aria-expanded={open && !isEmpty}
        aria-controls={listId}
        data-valo-touch="true"
        className={
          'flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm ' +
          'text-[var(--valo-text-secondary)] transition-colors hover:bg-[var(--valo-border)] ' +
          'disabled:hover:bg-transparent'
        }
      >
        <span>
          {isEmpty
            ? t('noRecentEvents')
            : `${t('recentEvents')} (${events.length})`}
        </span>
        <ChevronDownIcon
          aria-hidden="true"
          className={
            'h-4 w-4 shrink-0 transition-transform ' +
            (open && !isEmpty ? 'rotate-180' : 'rotate-0')
          }
        />
      </button>
      {open && !isEmpty ? (
        <ul
          id={listId}
          className="mt-1 space-y-1 pl-2 text-xs text-[var(--valo-text-secondary)]"
        >
          {events.map((event) => (
            <EventRow key={event.recognizedEventId} event={event} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

interface EventRowProps {
  event: RecentEventEntry;
}

function EventRow({ event }: EventRowProps) {
  const display = EVENT_TYPE_DISPLAY[event.type];
  const icon = display?.icon ?? '•';
  const label = event.type;
  const timeRange = `${formatTime(event.start)}–${formatTime(event.end)}`;
  return (
    <li className="flex items-center gap-2">
      <span aria-hidden="true" className="shrink-0">
        {icon}
      </span>
      <span className="shrink-0">{label}</span>
      <span className="truncate text-[var(--valo-text-secondary)]">{timeRange}</span>
    </li>
  );
}

/** HH:MM */
function formatTime(iso: string): string {
  if (!iso) return '--:--';
  // 直接 slice，与 i18n 无关；兼容 YYYY-MM-DDTHH:mm 与带秒的 ISO 字符串。
  const timePart = iso.includes('T') ? iso.split('T')[1] : iso;
  return (timePart ?? '').slice(0, 5) || '--:--';
}
