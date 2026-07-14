import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { FutureSuggestion } from '@health-advisor/shared';

/** 打字机逐字 reveal 的单字间隔（ms）——提速到 15ms */
const TYPING_INTERVAL_MS = 15;

/**
 * FutureTimelineBlock —— 未来时间点建议（Valo 时间轴风格）。
 *
 * 预测状态、推断依据和建议合并为一个自然段；未来预测仅作信息展示，
 * 不提供确认或稍后处理的 Action。
 *
 * 打字机模式（animate=true 且 done=false）下，predictionBody 整段逐字 reveal；
 * timePoint/daypart 等结构化部分立即显示，不参与打字机。
 *
 * 串行渲染：打字机完成时触发 onComplete，父组件据此展开下一个 Block。
 * 用 ref 保存回调避免其进入 effect 依赖项（防止父组件每次渲染重置打字机）。
 */
export interface FutureTimelineBlockProps {
  suggestion: FutureSuggestion;
  /** 启用打字机逐字 reveal（predictionBody 整段） */
  animate?: boolean;
  /** 流已结束或非流式：true 时立即显示全文 */
  done?: boolean;
  /** 打字机完成时触发（仅 animate=true 且 done=false 模式下触发一次） */
  onComplete?: () => void;
}

export function FutureTimelineBlock({ suggestion, animate, done, onComplete }: FutureTimelineBlockProps) {
  const t = useTranslations('homepage');
  const { timePoint, predictedState, rationale, action } = suggestion;
  const hour = Number(timePoint.split(':')[0]);
  const period = hour >= 12 ? 'PM' : 'AM';
  const daypart =
    hour < 12 ? t('morning.title') : hour < 18 ? t('afternoon.title') : t('night.title');

  // 非流式或流结束：立即显示全文
  const showFull = !animate || done;
  // 合成完整段（与原 i18n 模板调用一致）
  const fullText = t('predictionBody', {
    predictedState,
    rationale,
    actionTitle: action.title,
    actionDescription: action.description,
  });
  const [revealed, setRevealed] = useState<string>(showFull ? fullText : '');

  // 用 ref 保存 onComplete，避免其进入下方 effect 依赖项
  // （父组件每次渲染传入新内联函数会触发打字机重置）
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (showFull) {
      setRevealed(fullText);
      return;
    }
    setRevealed('');
    let idx = 0;
    let completed = false;
    const timer = setInterval(() => {
      if (idx < fullText.length) {
        idx += 1;
        setRevealed(fullText.slice(0, idx));
      } else if (!completed) {
        // 防御重复触发：clearInterval 后仍可能因闭包引用被调多次
        completed = true;
        clearInterval(timer);
        onCompleteRef.current?.();
      }
    }, TYPING_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [fullText, showFull]);

  return (
    <section className="relative pl-8" data-valo-future-tip="">
      <span
        aria-hidden="true"
        className="absolute left-0 top-1 h-4 w-4 rounded-full bg-[var(--valo-prime)] shadow-[0_0_10px_var(--valo-prime)]"
      />
      <h2
        className="text-sm font-medium leading-5 text-[var(--valo-text-primary)]"
        data-valo-serif="true"
      >
        {daypart} - {timePoint} {period}
      </h2>

      <p className="mt-3 text-sm leading-5 text-[color-mix(in_srgb,var(--valo-text-primary)_82%,transparent)]">
        {revealed}
      </p>
    </section>
  );
}
