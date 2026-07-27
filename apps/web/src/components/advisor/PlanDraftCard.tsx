'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowPathIcon } from '@heroicons/react/24/outline';
import { PlayIcon } from '@heroicons/react/24/solid';
import type { MessagePlanDraft } from '@/stores/ai-advisor.store';
import { useAIAdvisorStore } from '@/stores/ai-advisor.store';
import { useExecutePlanDraft } from '@/hooks/use-plan-query';
import { useProfileStore } from '@/stores/profile.store';
import { useUIStore } from '@/stores/ui.store';

interface PlanDraftCardProps {
  planDraft: MessagePlanDraft;
}

/**
 * AI Chat 计划操作区。
 *
 * Figma: Valo App Demo / Activity - AI Plan / Frame 1948760695。
 * - 计划正文由上方 assistant message 展示，这里只保留紧随正文的操作按钮；
 * - executable 状态下显示 Start Plan + Modify Session；
 * - 执行成功后关闭 Chat，并回到首页展示计划管理卡片；
 * - revoked 状态下不可点击（旧 draftId 失效）。
 * - executed 状态下可回到首页查看计划。
 */
export function PlanDraftCard({ planDraft }: PlanDraftCardProps) {
  const t = useTranslations('advisor.planDraft');
  const router = useRouter();
  const { currentProfileId } = useProfileStore();
  const executeMutation = useExecutePlanDraft(currentProfileId);
  const markPlanDraftExecuted = useAIAdvisorStore((s) => s.markPlanDraftExecuted);
  const closeAdvisor = useUIStore((s) => s.toggleAdvisorDrawer);
  const [error, setError] = useState<string | null>(null);

  const { draft, status } = planDraft;
  const isExecutable = status === 'executable';
  const isExecuted = status === 'executed';
  const isRevoked = status === 'revoked';

  async function handleExecute() {
    if (!isExecutable) return;
    setError(null);
    try {
      await executeMutation.mutateAsync({ draftId: draft.draftId });
      markPlanDraftExecuted(draft.draftId);
      // 执行成功后先关闭 advisor drawer，让首页计划卡片立即可见。
      closeAdvisor(false);
      router.push('/');
    } catch (err) {
      const message = err instanceof Error ? err.message : t('executeFailed');
      setError(message);
    }
  }

  function handleModify() {
    document.querySelector<HTMLTextAreaElement>('[data-valo-advisor-composer="true"]')?.focus();
  }

  return (
    <div
      data-valo-plan-draft={status}
      data-valo-plan-draft-id={draft.draftId}
      className="mt-3 w-full text-left"
    >
      <div className="flex h-7 items-center gap-3">
        {isRevoked && (
          <span
            data-valo-plan-draft-revoked="true"
            className="text-[12px] leading-4 text-[var(--valo-text-secondary)]"
          >
            {t('revoked')}
          </span>
        )}
        {isExecuted && (
          <button
            type="button"
            onClick={() => {
              closeAdvisor(false);
              router.push('/');
            }}
            className="inline-flex h-7 items-center gap-2 rounded bg-white px-3 text-[12px] font-semibold leading-4 text-[#1c1924] transition-opacity hover:opacity-90"
          >
            <PlayIcon className="h-3.5 w-3.5" />
            {t('viewPlan')}
          </button>
        )}
        {isExecutable && (
          <>
            <button
              type="button"
              onClick={handleExecute}
              disabled={executeMutation.isPending}
              data-valo-plan-draft-execute="true"
              className="inline-flex h-7 min-w-[105px] items-center justify-center gap-2 rounded bg-white px-3 text-[12px] font-semibold leading-4 text-[#1c1924] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <PlayIcon className="h-3.5 w-3.5" />
              {executeMutation.isPending ? t('executing') : t('execute')}
            </button>
            <button
              type="button"
              onClick={handleModify}
              data-valo-plan-draft-modify="true"
              className="inline-flex h-7 min-w-[121px] items-center justify-center gap-1 rounded border border-white bg-[#322a3f] px-2 text-[12px] font-semibold leading-4 text-white transition-colors hover:bg-[#413650]"
            >
              <ArrowPathIcon className="h-3.5 w-3.5" strokeWidth={2} />
              {t('modify')}
            </button>
          </>
        )}
      </div>

      {error && (
        <p
          data-valo-plan-draft-error="true"
          className="mt-2 text-[11px] text-[var(--valo-sluggish)]"
        >
          {error}
        </p>
      )}
    </div>
  );
}
