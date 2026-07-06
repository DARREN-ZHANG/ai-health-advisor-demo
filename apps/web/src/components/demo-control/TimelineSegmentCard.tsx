'use client';

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ArrowPathIcon, QuestionMarkCircleIcon } from '@heroicons/react/24/outline';
import { useTranslations } from 'next-intl';
import type { TimelineSegmentConfig } from './types';

/**
 * 单个时间轴片段卡片。
 *
 * 设计要点（I2.2）：
 * - 卡片主体渲染为 `<button>`，最小 40px 触达区（`data-valo-touch`）。
 * - 左侧：emoji 图标 + 文案；右侧预留帮助按钮位。
 * - 帮助按钮是一个独立的 `<button>` 兄弟节点，点击/聚焦时展开 tooltip。
 *   卡片容器使用 flex 布局，帮助按钮覆盖在卡片右侧的留白上，
 *   因此视觉上仍属于卡片；两个按钮互不嵌套，避免无效 HTML。
 * - `loading` 时图标位置替换为旋转的 ArrowPathIcon。
 * - `disabled` 时降低不透明度，两个按钮均被禁用；
 *   globals.css 的 `[disabled]` 规则保证点击无响应。
 * - 仅引用 `--valo-*` token，禁止散落硬编码颜色字面量。
 *
 * 注意：本组件不调用任何 mutation，onClick 由调用方（I2.3）传入。
 */
export interface TimelineSegmentCardProps {
  /** 片段配置 */
  segment: TimelineSegmentConfig;
  /** 卡片点击回调（帮助按钮点击不会触发） */
  onClick?: () => void;
  /** 禁用整张卡片（包含帮助按钮） */
  disabled?: boolean;
  /** 当前片段是否处于变更中；显示旋转图标 */
  loading?: boolean;
}

export function TimelineSegmentCard({
  segment,
  onClick,
  disabled = false,
  loading = false,
}: TimelineSegmentCardProps) {
  const t = useTranslations('godMode.segments');
  const tHelp = useTranslations('godMode.segmentsHelp');
  const tDemo = useTranslations('demoControl');
  const helpId = useId();
  const [helpOpen, setHelpOpen] = useState(false);
  // 容器 ref：用于判定点击是否发生在卡片外部（包含帮助按钮 + tooltip）。
  const containerRef = useRef<HTMLDivElement | null>(null);

  const helpText = safeTranslate(tHelp, segment.helpKey);
  const label = safeTranslate(t, segment.labelKey) ?? segment.labelKey;
  const isHelpDisabled = disabled || loading;

  const openHelp = () => {
    if (isHelpDisabled) return;
    setHelpOpen(true);
  };
  const closeHelp = () => setHelpOpen(false);
  const toggleHelp = () => {
    if (isHelpDisabled) return;
    setHelpOpen((prev) => !prev);
  };

  // 点击/聚焦打开后，监听 Escape 与外部点击自动关闭。
  // 触屏是该组件的主要场景，否则点击打开后会永久停留。
  useEffect(() => {
    if (!helpOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setHelpOpen(false);
    };
    const onPointerDown = (e: PointerEvent) => {
      const root = containerRef.current;
      if (root && !root.contains(e.target as Node)) {
        setHelpOpen(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [helpOpen]);

  return (
    <div ref={containerRef} className="relative flex items-stretch gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || loading}
        data-valo-touch="true"
        aria-describedby={helpText && helpOpen ? helpId : undefined}
        className={
          'flex flex-1 items-center gap-2 rounded-xl border border-[var(--valo-border)] ' +
          'bg-[var(--valo-surface)] px-3 py-2 text-left text-sm font-medium ' +
          'text-[var(--valo-text-primary)] transition-colors hover:bg-[var(--valo-border)] ' +
          'disabled:opacity-50'
        }
      >
        <span
          className="inline-flex w-6 shrink-0 items-center justify-center text-base"
          aria-hidden="true"
        >
          {loading ? (
            <ArrowPathIcon className="h-4 w-4 animate-spin text-[var(--valo-prime)]" />
          ) : (
            <span>{segment.icon}</span>
          )}
        </span>
        <span className="flex-1 truncate">{label}</span>
      </button>
      {helpText ? (
        <button
          type="button"
          onClick={toggleHelp}
          onFocus={openHelp}
          onBlur={closeHelp}
          onMouseEnter={openHelp}
          onMouseLeave={closeHelp}
          disabled={isHelpDisabled}
          aria-label={tDemo('help')}
          aria-expanded={helpOpen}
          aria-controls={helpId}
          data-valo-touch="true"
          className={
            'inline-flex h-auto w-9 shrink-0 items-center justify-center rounded-xl ' +
            'border border-[var(--valo-border)] bg-[var(--valo-surface)] ' +
            'text-[var(--valo-text-secondary)] transition-colors ' +
            'hover:text-[var(--valo-text-primary)] hover:bg-[var(--valo-border)] ' +
            'disabled:opacity-50'
          }
        >
          <QuestionMarkCircleIcon className="h-4 w-4" />
        </button>
      ) : null}
      {helpText ? (
        <HelpBubble id={helpId} open={helpOpen}>
          {helpText}
        </HelpBubble>
      ) : null}
    </div>
  );
}

interface HelpBubbleProps {
  id: string;
  open: boolean;
  children: ReactNode;
}

function HelpBubble({ id, open, children }: HelpBubbleProps) {
  if (!open) return null;
  return (
    <p
      id={id}
      role="tooltip"
      className="pointer-events-none absolute left-0 right-0 top-full z-10 mt-1 rounded-lg border border-[var(--valo-border)] bg-[var(--valo-canvas)] px-3 py-2 text-xs leading-relaxed text-[var(--valo-text-secondary)] shadow-[var(--valo-shadow-elevated)]"
    >
      {children}
    </p>
  );
}

/**
 * 安全翻译：next-intl 在缺失 key 时会抛错。这里兜底返回 null，
 * 让调用方决定是否渲染帮助按钮；测试场景下也允许使用占位 labelKey。
 */
function safeTranslate(
  t: (key: string) => string,
  key: string,
): string | null {
  try {
    const text = t(key);
    return text === key ? null : text;
  } catch {
    return null;
  }
}
