'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { CheckIcon } from '@heroicons/react/20/solid';
import {
  ChevronDownIcon,
  ChevronUpIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import { m, AnimatePresence } from 'framer-motion';
import type { Plan, PlanGroup } from '@health-advisor/shared';
import { useProfileStore } from '@/stores/profile.store';
import { useUIStore } from '@/stores/ui.store';
import {
  useCurrentPlan,
  useEndPlan,
  useTogglePlanTask,
} from '@/hooks/use-plan-query';

/**
 * /plan 屏幕。
 *
 * - 服务端 plan-store 是唯一事实源；本组件不持有计划副本，仅展示查询结果。
 * - 三层结构：Plan → Group（第 N 天） → Task。
 * - 父级 group 不可勾选，只能折叠/展开；进度由叶子任务自动推导。
 * - 替换未完成计划由 chat 响应路径处理（route 层 confirmReplace），
 *   本组件只提供「结束当前计划」入口。
 */
export function PlanScreen() {
  const t = useTranslations('plan');
  const { currentProfileId } = useProfileStore();
  const { toggleAdvisorDrawer } = useUIStore();
  const { data: plan, isLoading } = useCurrentPlan(currentProfileId ?? undefined);
  const endPlan = useEndPlan(currentProfileId ?? undefined);

  if (!currentProfileId) {
    return (
      <section className="px-5 py-10 text-center text-sm text-[var(--valo-text-secondary)]">
        {t('empty')}
      </section>
    );
  }

  if (isLoading) {
    return (
      <section className="px-5 py-10 text-center text-sm text-[var(--valo-text-secondary)]">
        …
      </section>
    );
  }

  if (!plan) {
    return (
      <section className="px-5 py-10 text-center">
        <p className="text-sm text-[var(--valo-text-secondary)]">{t('empty')}</p>
        <button
          type="button"
          onClick={() => toggleAdvisorDrawer(true)}
          className="mt-4 inline-flex items-center rounded-full bg-[var(--valo-prime)] px-4 py-2 text-xs font-semibold text-[var(--valo-canvas)]"
        >
          {t('openAdvisor')}
        </button>
      </section>
    );
  }

  function handleEnd() {
    if (window.confirm(t('endConfirm'))) {
      endPlan.mutate();
    }
  }

  return (
    <section
      data-valo-plan-screen="true"
      data-valo-plan-id={plan.id}
      className="mx-auto w-full max-w-3xl px-5 py-6"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p
            className={`text-[11px] uppercase tracking-wider transition-colors ${
              plan.status === 'completed'
                ? 'text-[var(--valo-active)]'
                : 'text-[var(--valo-text-secondary)]'
            }`}
          >
            {plan.status === 'completed' ? t('completedBadge') : t('activeBadge')}
          </p>
          <h1
            data-valo-serif="true"
            className="mt-1 text-[28px] leading-tight text-[var(--valo-text-primary)]"
          >
            {plan.title}
          </h1>
          <p className="mt-2 text-xs text-[var(--valo-text-secondary)]">{plan.summary}</p>
          <p className="mt-2 text-[11px] text-[var(--valo-text-secondary)]">
            {t('progressLabel', {
              done: plan.progress.completedTasks,
              total: plan.progress.totalTasks,
            })}
          </p>
        </div>
        <button
          type="button"
          onClick={handleEnd}
          aria-label={t('endPlan')}
          title={t('endPlan')}
          data-valo-plan-end="true"
          className="inline-flex shrink-0 items-center justify-center rounded-full border border-[var(--valo-border)] p-2 text-[var(--valo-depleted)] transition-colors hover:border-[var(--valo-depleted)]"
        >
          <TrashIcon className="h-4 w-4" />
        </button>
      </header>

      <div className="mt-6 space-y-4">
        {plan.groups.map((group, idx) => (
          <GroupCard
            key={group.id}
            plan={plan}
            group={group}
            index={idx + 1}
            profileId={plan.profileId}
          />
        ))}
      </div>
    </section>
  );
}

interface GroupCardProps {
  plan: Plan;
  group: PlanGroup;
  index: number;
  profileId: string;
}

function GroupCard({ plan, group, index }: GroupCardProps) {
  const t = useTranslations('plan');
  const { currentProfileId } = useProfileStore();
  const toggleTask = useTogglePlanTask(currentProfileId ?? undefined);
  const [collapsed, setCollapsed] = useState(false);

  const completedInGroup = group.tasks.filter((task) => task.completed).length;
  const totalInGroup = group.tasks.length;
  const groupDone = completedInGroup === totalInGroup;

  async function handleToggle(taskId: string, completed: boolean, version: number) {
    try {
      await toggleTask.mutateAsync({
        planId: plan.id,
        groupId: group.id,
        taskId,
        expectedVersion: version,
        completed: !completed,
      });
    } catch {
      // 错误信息可由调用层处理；这里 swallow 让用户多次点击重试。
    }
  }

  return (
    <article
      data-valo-plan-group-id={group.id}
      className="rounded-2xl border border-[var(--valo-border)] bg-[var(--valo-surface)] p-4"
    >
      <header className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span
            className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border border-white text-[11px] font-semibold transition-colors ${
              groupDone ? 'bg-[#ffffff] text-[#1c1924]' : 'bg-transparent text-white'
            }`}
          >
            {groupDone ? <CheckIcon className="h-3 w-3" strokeWidth={2.5} /> : index}
          </span>
          <span className="truncate text-sm font-semibold text-[var(--valo-text-primary)]">
            {group.title}
          </span>
        </button>
        <span className="shrink-0 whitespace-nowrap text-[11px] text-[var(--valo-text-secondary)]">
          {completedInGroup} / {totalInGroup}
        </span>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-label="toggle group"
          className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[var(--valo-text-secondary)]"
        >
          {collapsed ? (
            <ChevronDownIcon className="h-3 w-3" />
          ) : (
            <ChevronUpIcon className="h-3 w-3" />
          )}
        </button>
      </header>

      <AnimatePresence initial={false}>
        {!collapsed && (
          <m.ul
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="mt-3 space-y-2 overflow-hidden"
            data-valo-plan-tasks="true"
          >
            {group.tasks.map((task) => (
              <li
                key={task.id}
                data-valo-plan-task-id={task.id}
                data-valo-plan-task-completed={task.completed ? 'true' : 'false'}
                className="flex items-start gap-2 text-sm text-[var(--valo-text-primary)]"
              >
                <button
                  type="button"
                  data-valo-plan-task-toggle={task.id}
                  aria-label={t(task.completed ? 'markIncomplete' : 'markComplete', {
                    task: task.title,
                  })}
                  aria-pressed={task.completed}
                  disabled={toggleTask.isPending}
                  onClick={() => handleToggle(task.id, task.completed, plan.version)}
                  className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border border-white transition-colors"
                  style={{
                    backgroundColor: task.completed ? '#ffffff' : 'transparent',
                    color: task.completed ? '#1c1924' : 'transparent',
                  }}
                >
                  {task.completed ? (
                    <CheckIcon className="h-3 w-3" strokeWidth={2.5} />
                  ) : null}
                </button>
                <div className="min-w-0 flex-1">
                  <p
                    className={`leading-relaxed ${
                      task.completed ? 'line-through opacity-60' : ''
                    }`}
                  >
                    {task.title}
                  </p>
                  {task.description && (
                    <p className="mt-1 text-[11px] text-[var(--valo-text-secondary)]">
                      {task.description}
                    </p>
                  )}
                  {(task.suggestedTimeOfDay || task.estimatedMinutes) && (
                    <p className="mt-1 text-[10px] text-[var(--valo-text-secondary)]">
                      {[
                        task.suggestedTimeOfDay,
                        task.estimatedMinutes
                          ? `${task.estimatedMinutes} ${t('minutes')}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </m.ul>
        )}
      </AnimatePresence>
    </article>
  );
}
