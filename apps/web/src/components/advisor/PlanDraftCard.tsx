'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
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
 * AI Chat 计划草稿。
 *
 * Figma: Valo App Demo / Activity - AI Plan / Frame 1948760695。
 * - 直接展示 planDraft 的标题、摘要、分组与任务，避免把结构化计划藏在操作按钮后；
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

  return (
    <div
      data-valo-plan-draft={status}
      data-valo-plan-draft-id={draft.draftId}
      className="mt-3 w-full text-left"
    >
      <article
        data-valo-plan-draft-content="true"
        aria-labelledby={`plan-draft-title-${draft.draftId}`}
        className="rounded-xl border border-[var(--valo-border)] bg-[var(--valo-surface)] px-4 py-3.5"
      >
        <h3
          id={`plan-draft-title-${draft.draftId}`}
          className="text-[14px] font-semibold leading-5 text-[var(--valo-text-primary)]"
        >
          {draft.title}
        </h3>
        <p className="mt-1 text-[12px] leading-[18px] text-[var(--valo-text-secondary)]">
          {draft.summary}
        </p>

        <div className="mt-4 space-y-4">
          {draft.groups.map((group, groupIndex) => (
            <section
              key={`${group.title}-${groupIndex}`}
              data-valo-plan-draft-group={groupIndex}
              aria-labelledby={`plan-draft-group-${draft.draftId}-${groupIndex}`}
            >
              <h4
                id={`plan-draft-group-${draft.draftId}-${groupIndex}`}
                className="text-[12px] font-semibold leading-4 text-[var(--valo-text-primary)]"
              >
                {group.title}
              </h4>
              <ul className="mt-2 space-y-2">
                {group.tasks.map((task, taskIndex) => (
                  <li
                    key={`${task.title}-${taskIndex}`}
                    data-valo-plan-draft-task={taskIndex}
                    className="flex items-start gap-2.5"
                  >
                    <span
                      aria-hidden="true"
                      className="mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--valo-prime)]"
                    />
                    <div className="min-w-0">
                      <p className="text-[12px] leading-[18px] text-[var(--valo-text-primary)]">
                        {task.title}
                      </p>
                      {task.description && (
                        <p className="mt-0.5 text-[11px] leading-4 text-[var(--valo-text-secondary)]">
                          {task.description}
                        </p>
                      )}
                      {(task.suggestedTimeOfDay || task.estimatedMinutes) && (
                        <p className="mt-0.5 text-[10px] leading-4 text-[var(--valo-text-secondary)]">
                          {[
                            task.suggestedTimeOfDay,
                            task.estimatedMinutes ? `${task.estimatedMinutes} min` : undefined,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </article>

      <div className="mt-3 flex h-7 items-center gap-3">
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
