'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ValoSheet } from '@/components/valo/ValoSheet';
import { ValoDialog } from '@/components/valo/ValoDialog';

/**
 * ActionTimerSheet —— 微行动计时浮层。
 *
 * 行为契约（来自 I3.2）：
 * - 同一时间只渲染一个 timer；调用方负责开关。
 * - 自然完成（倒计时到 0）或“立即完成” → 调用 `onComplete` 一次后关闭。
 * - Stop → 调用 `onStop`（**不**调用 `onComplete`），关闭。
 * - Pause/Resume 仅冻结/恢复倒计时，不影响回调。
 * - 通过 `useRef` 单次提交标志确保 `onComplete` 至多被调用一次，
 *   避免自然完成动画期间用户连点“立即完成”触发双提交。
 *
 * 双渲染：移动端 ValoSheet（block lg:hidden）+ 桌面端 ValoDialog（hidden lg:block）。
 *
 * 关于遮罩关闭：默认 **不**触发任何回调（视作暂停），用户必须显式点击
 * Stop 或 Complete Now。这是更安全的语义：避免误触取消导致行动丢失，
 * 也避免误触完成导致事件被错误提交。
 */
export interface ActionTimerSheetProps {
  open: boolean;
  /** 总时长（秒） */
  durationSeconds: number;
  /** 自然完成或立即完成时调用；保证只调用一次 */
  onComplete: () => void;
  /** Stop 取消计时；不调用 onComplete */
  onStop: () => void;
  /** 用于 a11y 命名 */
  title: string;
}

function formatMmSs(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function ActionTimerSheet({
  open,
  durationSeconds,
  onComplete,
  onStop,
  title,
}: ActionTimerSheetProps) {
  const t = useTranslations('homepage.timer');
  const titleId = useId();

  const [remaining, setRemaining] = useState(durationSeconds);
  const [paused, setPaused] = useState(false);

  // 单次提交标志：ref 保证跨渲染稳定
  const completedRef = useRef(false);
  // 关闭中标志：自然完成后通知父组件，父组件会把 open 切到 false，
  // 期间不再触发任何回调
  const closingRef = useRef(false);

  // 每次 open 打开时重置状态
  useEffect(() => {
    if (open) {
      setRemaining(durationSeconds);
      setPaused(false);
      completedRef.current = false;
      closingRef.current = false;
    }
  }, [open, durationSeconds]);

  // 倒计时主循环：paused 或 open=false 时不运行
  useEffect(() => {
    if (!open || paused) return;
    const handle = window.setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          window.clearInterval(handle);
          // 自然完成：交给独立 effect 处理（避免 setState 中触发回调）
          naturalCompletedRef.current = true;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(handle);
  }, [open, paused]);

  // 自然完成的独立标记
  const naturalCompletedRef = useRef(false);
  useEffect(() => {
    if (!open) return;
    if (naturalCompletedRef.current && !completedRef.current) {
      naturalCompletedRef.current = false;
      fireComplete();
    }
  });

  const fireComplete = useCallback(() => {
    if (completedRef.current || closingRef.current) return;
    completedRef.current = true;
    closingRef.current = true;
    onComplete();
  }, [onComplete]);

  const handleCompleteNow = useCallback(() => {
    fireComplete();
  }, [fireComplete]);

  const handleStop = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    onStop();
  }, [onStop]);

  const togglePause = useCallback(() => {
    setPaused((p) => !p);
  }, []);

  const progress =
    durationSeconds > 0
      ? Math.min(1, Math.max(0, 1 - remaining / durationSeconds))
      : 0;

  const body = (
    <TimerBody
      remainingLabel={formatMmSs(remaining)}
      progress={progress}
      paused={paused}
      pendingComplete={closingRef.current}
      onPauseToggle={togglePause}
      onStop={handleStop}
      onCompleteNow={handleCompleteNow}
      pauseLabel={t('pause')}
      resumeLabel={t('resume')}
      stopLabel={t('stop')}
      completeNowLabel={t('completeNow')}
    />
  );

  return (
    <>
      {/* 移动端：底部 Sheet */}
      <div className="block lg:hidden">
        <ValoSheet
          open={open}
          onClose={handleStop}
          title={title}
          ariaLabelledBy={titleId}
          closeOnScrimClick={false}
          closeOnEscape={false}
        >
          <div id={titleId} className="sr-only">
            {title}
          </div>
          {body}
        </ValoSheet>
      </div>

      {/* 桌面端：居中 Dialog */}
      <div className="hidden lg:block">
        <ValoDialog
          open={open}
          onClose={handleStop}
          title={title}
          ariaLabelledBy={titleId}
          width={400}
          closeOnScrimClick={false}
          closeOnEscape={false}
        >
          <div id={titleId} className="sr-only">
            {title}
          </div>
          {body}
        </ValoDialog>
      </div>
    </>
  );
}

interface TimerBodyProps {
  remainingLabel: string;
  progress: number;
  paused: boolean;
  pendingComplete: boolean;
  onPauseToggle: () => void;
  onStop: () => void;
  onCompleteNow: () => void;
  pauseLabel: string;
  resumeLabel: string;
  stopLabel: string;
  completeNowLabel: string;
}

function TimerBody({
  remainingLabel,
  progress,
  paused,
  pendingComplete,
  onPauseToggle,
  onStop,
  onCompleteNow,
  pauseLabel,
  resumeLabel,
  stopLabel,
  completeNowLabel,
}: TimerBodyProps) {
  return (
    <div className="px-5 py-6 space-y-6">
      {/* 倒计时大号显示 */}
      <div className="flex flex-col items-center gap-2">
        <div
          className="text-5xl font-bold tabular-nums text-[var(--valo-text-primary)]"
          aria-live="polite"
        >
          {remainingLabel}
        </div>
        {paused ? (
          <span className="text-xs uppercase tracking-widest text-[var(--valo-text-secondary)]">
            paused
          </span>
        ) : null}
      </div>

      {/* 进度条 */}
      <div
        className="h-1.5 rounded-full bg-[var(--valo-border)] overflow-hidden"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={1}
        aria-valuenow={Math.round(progress * 100) / 100}
      >
        <div
          className="h-full bg-[var(--valo-prime)] transition-[width] duration-200 ease-linear"
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>

      {/* 按钮区 */}
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={onCompleteNow}
          disabled={pendingComplete}
          data-valo-touch="true"
          className="w-full rounded-full px-4 py-3 text-sm font-semibold
                     bg-[var(--valo-prime)] text-[var(--valo-canvas)]
                     hover:opacity-90 transition-opacity
                     focus-visible:outline-none focus-visible:[box-shadow:var(--valo-focus-ring)]
                     disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {completeNowLabel}
        </button>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onPauseToggle}
            disabled={pendingComplete}
            data-valo-touch="true"
            className="rounded-full px-4 py-2 text-sm font-semibold
                       border border-[var(--valo-border)]
                       text-[var(--valo-text-primary)]
                       hover:border-[var(--valo-text-secondary)] transition-colors
                       focus-visible:outline-none focus-visible:[box-shadow:var(--valo-focus-ring)]
                       disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {paused ? resumeLabel : pauseLabel}
          </button>
          <button
            type="button"
            onClick={onStop}
            disabled={pendingComplete}
            data-valo-touch="true"
            className="rounded-full px-4 py-2 text-sm font-semibold
                       border border-[var(--valo-depleted)]
                       text-[var(--valo-depleted)]
                       hover:bg-[var(--valo-depleted)] hover:text-[var(--valo-canvas)] transition-colors
                       focus-visible:outline-none focus-visible:[box-shadow:var(--valo-focus-ring)]
                       disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {stopLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
