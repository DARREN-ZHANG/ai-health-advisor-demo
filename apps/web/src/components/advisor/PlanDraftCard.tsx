'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  CheckCircleIcon,
  ClipboardDocumentCheckIcon,
  ArrowRightCircleIcon,
} from '@heroicons/react/24/outline';
import type { MessagePlanDraft } from '@/stores/ai-advisor.store';
import { useAIAdvisorStore } from '@/stores/ai-advisor.store';
import { useExecutePlanDraft } from '@/hooks/use-plan-query';
import { useProfileStore } from '@/stores/profile.store';
import { useUIStore } from '@/stores/ui.store';

interface PlanDraftCardProps {
  planDraft: MessagePlanDraft;
}

/**
 * 计划草稿预览卡片。
 *
 * - 展示标题、摘要与三层结构（分组→任务）。
 * - executable 状态下显示「执行」按钮；执行成功后跳转 /plan。
 * - revoked 状态下不可点击（旧 draftId 失效）。
 * - executed 状态下提示「已执行」，可点击「查看计划」跳转 /plan。
 *
 * 卡片不持有计划状态本身，所有持久化通过 plan-store；UI 只反映本次消息里
 * draftId 的可执行性。
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
  const totalTasks = draft.groups.reduce((sum, g) => sum + g.tasks.length, 0);
  const isExecutable = status === 'executable';
  const isExecuted = status === 'executed';
  const isRevoked = status === 'revoked';

  async function handleExecute() {
    if (!isExecutable) return;
    setError(null);
    try {
      await executeMutation.mutateAsync({ draftId: draft.draftId });
      markPlanDraftExecuted(draft.draftId);
      // 执行成功后必须先关掉 advisor drawer，否则抽屉遮罩会拦截 /plan 页面的点击事件。
      closeAdvisor(false);
      router.push('/plan');
    } catch (err) {
      const message = err instanceof Error ? err.message : t('executeFailed');
      setError(message);
    }
  }

  return (
    <div
      data-valo-plan-draft={status}
      data-valo-plan-draft-id={draft.draftId}
      className="mt-2 w-full rounded-2xl border border-[var(--valo-border)] bg-[var(--valo-surface)] p-4 text-left"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wider text-[var(--valo-text-secondary)]">
            {t('badge')}
          </p>
          <p className="mt-1 text-sm font-semibold text-[var(--valo-text-primary)]">
            {draft.title}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-[var(--valo-border)] px-2 py-0.5 text-[10px] text-[var(--valo-text-secondary)]">
          {t('taskCount', { count: totalTasks })}
        </span>
      </div>

      <p className="mt-2 text-xs leading-relaxed text-[var(--valo-text-secondary)]">
        {draft.summary}
      </p>

      <ol
        data-valo-plan-draft-groups="true"
        className="mt-3 space-y-2 text-xs text-[var(--valo-text-primary)]"
      >
        {draft.groups.map((group, idx) => (
          <li key={`${group.title}-${idx}`} className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--valo-text-secondary)]">
              {group.title}
            </p>
            <ul className="space-y-1 pl-3">
              {group.tasks.map((task, tIdx) => (
                <li
                  key={`${task.title}-${tIdx}`}
                  className="flex items-start gap-2 leading-relaxed"
                >
                  <CheckCircleIcon className="mt-0.5 h-3 w-3 shrink-0 text-[var(--valo-active)]" />
                  <span>
                    {task.title}
                    {task.estimatedMinutes
                      ? ` · ${task.estimatedMinutes} ${t('minutes')}`
                      : null}
                    {task.suggestedTimeOfDay ? ` · ${task.suggestedTimeOfDay}` : null}
                  </span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>

      <div className="mt-3 flex items-center justify-end gap-2">
        {isRevoked && (
          <span
            data-valo-plan-draft-revoked="true"
            className="text-[11px] text-[var(--valo-text-secondary)]"
          >
            {t('revoked')}
          </span>
        )}
        {isExecuted && (
          <button
            type="button"
            onClick={() => router.push('/plan')}
            className="inline-flex items-center gap-1 rounded-full bg-[var(--valo-active)] px-3 py-1.5 text-[11px] font-semibold text-[var(--valo-canvas)]"
          >
            <ClipboardDocumentCheckIcon className="h-3 w-3" />
            {t('viewPlan')}
          </button>
        )}
        {isExecutable && (
          <button
            type="button"
            onClick={handleExecute}
            disabled={executeMutation.isPending}
            data-valo-plan-draft-execute="true"
            className="inline-flex items-center gap-1 rounded-full bg-[var(--valo-prime)] px-3 py-1.5 text-[11px] font-semibold text-[var(--valo-canvas)] transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            <ArrowRightCircleIcon className="h-3 w-3" />
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
