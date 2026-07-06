'use client';

import type { MemoryCandidateConfirmation } from '@health-advisor/shared';
import { useProfileStore } from '@/stores/profile.store';
import { useConfirmMemoryCandidate, useRejectMemoryCandidate } from '@/hooks/use-memory-query';

interface MemoryCandidateCardProps {
  candidate: MemoryCandidateConfirmation;
}

/**
 * 记忆候选卡 —— Valo 视觉统一（I5.2）。
 *
 * 仅做"颜色字面量"层面的最小修复：把旧的 slate-/blue-/emerald- 类名替换为
 * `var(--valo-*)` token；不改动 confirm/reject 行为。
 */
export function MemoryCandidateCard({ candidate }: MemoryCandidateCardProps) {
  const { currentProfileId } = useProfileStore();
  const confirm = useConfirmMemoryCandidate(currentProfileId);
  const reject = useRejectMemoryCandidate(currentProfileId);

  const disabled = confirm.isPending || reject.isPending || confirm.isSuccess || reject.isSuccess;
  const status = confirm.isSuccess ? '已记住' : reject.isSuccess ? '已忽略' : null;

  return (
    <div
      className={
        'w-full rounded-lg border px-3 py-2 text-xs ' +
        'border-[var(--valo-border)] bg-[var(--valo-surface)] ' +
        'text-[var(--valo-text-primary)]'
      }
    >
      <p className="font-medium">{candidate.proposedConfirmationText}</p>
      <p className="mt-1 text-[var(--valo-text-secondary)]">
        来源：{candidate.evidenceQuote}
      </p>
      {status ? (
        <p className="mt-2 text-[var(--valo-active)]">{status}</p>
      ) : (
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={() => confirm.mutate(candidate.id)}
            className="rounded px-3 py-1 font-medium disabled:opacity-50 text-[var(--valo-canvas)]"
            style={{ backgroundColor: 'var(--valo-prime)' }}
          >
            记住
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => reject.mutate(candidate.id)}
            className="rounded px-3 py-1 font-medium border disabled:opacity-50 text-[var(--valo-text-primary)] border-[var(--valo-border)] bg-[var(--valo-canvas)]"
          >
            忽略
          </button>
        </div>
      )}
    </div>
  );
}
