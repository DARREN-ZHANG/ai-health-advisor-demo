'use client';

import { ArrowPathIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { useTranslations } from 'next-intl';
import { useGodModeStore } from '@/stores/god-mode.store';
import { TIMELINE_SEGMENTS } from './timeline-segments';
import type { TimelineSegmentConfig } from './types';

export interface DemoControlDrawerProps {
  onSegmentClick?: (segment: TimelineSegmentConfig) => void;
}

/**
 * Demo 事件面板。
 *
 * Source of truth: Figma Valo-App-Demo node 243:224, frame "Add Event", 402 × 874.
 * Figma 仅作为视觉基准；事件内容继续使用完整的 TIMELINE_SEGMENTS 配置。
 * 设计稿在 71% 缩放下的事件中心距约 34.5px，反算原始行高约 49px。
 */
export function DemoControlDrawer({ onSegmentClick }: DemoControlDrawerProps) {
  const t = useTranslations('demoControl');
  const tSegments = useTranslations('godMode.segments');
  const isEnabled = useGodModeStore((state) => state.isEnabled);
  const isOpen = useGodModeStore((state) => state.isOpen);
  const toggleOpen = useGodModeStore((state) => state.toggleOpen);
  const pendingSegmentType = useGodModeStore((state) => state.pendingSegmentType);

  if (!isEnabled || !isOpen) return null;

  const close = () => toggleOpen(false);

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70" onClick={close}>
      <section
        id="demo-control-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="demo-control-title"
        className="flex h-[calc(100dvh-40px)] w-full max-w-[402px] flex-col rounded-t-[10px] bg-[#191821] px-5 pb-[max(24px,env(safe-area-inset-bottom))] pt-4 text-white shadow-2xl outline-none"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="relative flex h-9 shrink-0 items-center justify-center">
          <button
            type="button"
            onClick={close}
            aria-label={t('close')}
            className="absolute left-0 grid h-7 w-7 place-items-center rounded-full bg-[#111116] text-[#8c8b94] transition-colors hover:text-white"
          >
            <XMarkIcon className="h-[18px] w-[18px]" strokeWidth={2.25} />
          </button>
          <h2 id="demo-control-title" className="text-[14px] font-medium tracking-[-0.01em]">
            {t('title')}
          </h2>
        </header>

        <div
          data-testid="demo-event-list"
          className="mt-3 min-h-0 flex-1 overflow-y-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {TIMELINE_SEGMENTS.map((segment) => {
            const pending = pendingSegmentType === segment.type;
            const disabled = pendingSegmentType !== null;

            return (
              <div key={segment.type} className="flex h-[49px] shrink-0 items-center">
                <span className="w-7 shrink-0 text-[19px] leading-none" aria-hidden="true">
                  {segment.type === 'alcohol_intake' ? '🍷' : segment.icon}
                </span>
                <span className="min-w-0 flex-1 pl-1 text-[13px] font-normal text-[#e6e4eb]">
                  {tSegments(segment.labelKey)}
                </span>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onSegmentClick?.(segment)}
                  aria-label={`${t('add')} ${tSegments(segment.labelKey)}`}
                  className="inline-flex h-8 min-w-[58px] items-center justify-center gap-1 rounded-full bg-[#343342] px-3 text-[12px] font-medium text-[#e9e7ee] transition-colors hover:bg-[#414052] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {pending ? (
                    <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <span className="text-[15px] font-light leading-none">＋</span>
                  )}
                  {t('add')}
                </button>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
