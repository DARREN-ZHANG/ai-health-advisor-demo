'use client';

import type { MemoryCandidateConfirmation } from '@health-advisor/shared';
import { useProfileStore } from '@/stores/profile.store';
import { useConfirmMemoryCandidate, useRejectMemoryCandidate } from '@/hooks/use-memory-query';

interface MemoryCandidateCardProps {
  candidate: MemoryCandidateConfirmation;
}

export function MemoryCandidateCard({ candidate }: MemoryCandidateCardProps) {
  const { currentProfileId } = useProfileStore();
  const confirm = useConfirmMemoryCandidate(currentProfileId);
  const reject = useRejectMemoryCandidate(currentProfileId);

  const disabled = confirm.isPending || reject.isPending || confirm.isSuccess || reject.isSuccess;
  const status = confirm.isSuccess ? '已记住' : reject.isSuccess ? '已忽略' : null;

  return (
    <div className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200">
      <p className="font-medium">{candidate.proposedConfirmationText}</p>
      <p className="mt-1 text-slate-500">来源：{candidate.evidenceQuote}</p>
      {status ? (
        <p className="mt-2 text-emerald-400">{status}</p>
      ) : (
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={() => confirm.mutate(candidate.id)}
            className="rounded bg-blue-600 px-3 py-1 font-medium text-white disabled:opacity-50"
          >
            记住
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => reject.mutate(candidate.id)}
            className="rounded bg-slate-800 px-3 py-1 font-medium text-slate-300 disabled:opacity-50"
          >
            忽略
          </button>
        </div>
      )}
    </div>
  );
}
