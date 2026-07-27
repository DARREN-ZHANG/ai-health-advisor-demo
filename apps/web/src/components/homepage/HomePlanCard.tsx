'use client';

import { CheckIcon } from '@heroicons/react/20/solid';
import { ArrowPathIcon } from '@heroicons/react/24/outline';
import { useTranslations } from 'next-intl';
import type { Plan } from '@health-advisor/shared';
import { useTogglePlanTask } from '@/hooks/use-plan-query';
import { useGodModeStore } from '@/stores/god-mode.store';
import { useProfileStore } from '@/stores/profile.store';
import { useUIStore } from '@/stores/ui.store';

interface HomePlanCardProps {
  plan: Plan;
}

/**
 * 首页计划管理卡片。
 *
 * Figma: Training Progression - Day1 / Day2
 * - 外层 20px 水平间距，标题与卡片间距 16px；
 * - 卡片使用 #1C1924、8px 圆角、16px 内边距；
 * - 首页一次只展示一个 PlanGroup，God Mode 负责切换 selectedPlanDayIndex；
 * - 叶子任务沿用既有 plan mutation，不新增计划业务逻辑。
 */
export function HomePlanCard({ plan }: HomePlanCardProps) {
  const t = useTranslations('homepage.planCard');
  const currentProfileId = useProfileStore((state) => state.currentProfileId);
  const toggleAdvisorDrawer = useUIStore((state) => state.toggleAdvisorDrawer);
  const selectedPlanDayIndex = useGodModeStore((state) => state.selectedPlanDayIndex);
  const toggleTask = useTogglePlanTask(currentProfileId);

  const dayIndex = Math.min(selectedPlanDayIndex, plan.groups.length - 1);
  const group = plan.groups[dayIndex];

  if (!group) return null;

  const groupId = group.id;
  const estimatedMinutes = group.tasks.reduce(
    (total, task) => total + (task.estimatedMinutes ?? 0),
    0,
  );

  async function handleToggleTask(taskId: string, completed: boolean) {
    try {
      await toggleTask.mutateAsync({
        planId: plan.id,
        groupId,
        taskId,
        expectedVersion: plan.version,
        completed: !completed,
      });
    } catch {
      // 与独立 Plan 页面保持一致：保留当前视觉状态，允许用户再次点击重试。
    }
  }

  return (
    <section
      data-valo-home-plan="true"
      data-valo-home-plan-day={dayIndex + 1}
      aria-labelledby="home-plan-title"
      className="mx-[-16px] space-y-4 px-5 py-5"
    >
      <h2
        id="home-plan-title"
        data-valo-serif="true"
        className="text-[20px] leading-[25px] text-white"
      >
        {plan.title}
      </h2>

      <article className="space-y-3 rounded-lg bg-[#1c1924] p-4 text-white">
        <div className="space-y-5">
          <div className="space-y-3">
            <div className="flex h-4 items-center gap-2">
              <h3 className="text-[12px] font-semibold leading-4">
                {t('day', { day: dayIndex + 1 })}
              </h3>
              <span className="h-1 w-1 rounded-full bg-[#81798d]" aria-hidden="true" />
              <span className="text-[11px] leading-4 text-[#aaa5b1]">
                {t('progress', {
                  done: group.tasks.filter((task) => task.completed).length,
                  total: group.tasks.length,
                })}
              </span>
            </div>

            <p className="whitespace-pre-line text-[12px] leading-5 text-[#c7c2cd]">
              {plan.summary}
            </p>
          </div>

          <div>
            <p className="text-[12px] font-semibold leading-4">{t('focus')}</p>
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
              <p className="text-[12px] font-semibold leading-4">{group.title}</p>
              {estimatedMinutes > 0 ? (
                <span className="text-[11px] leading-4 text-[#aaa5b1]">
                  · {t('minutes', { count: estimatedMinutes })}
                </span>
              ) : null}
            </div>

            <ul className="mt-3 space-y-2">
              {group.tasks.map((task) => (
                <li
                  key={task.id}
                  data-valo-home-plan-task={task.id}
                  data-valo-home-plan-task-completed={task.completed ? 'true' : 'false'}
                  className="flex items-start gap-2"
                >
                  <button
                    type="button"
                    aria-label={t(task.completed ? 'markIncomplete' : 'markComplete', {
                      task: task.title,
                    })}
                    aria-pressed={task.completed}
                    disabled={toggleTask.isPending}
                    onClick={() => handleToggleTask(task.id, task.completed)}
                    className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border border-white transition-colors"
                    style={{
                      backgroundColor: task.completed ? '#ffffff' : 'transparent',
                      color: task.completed ? '#1c1924' : 'transparent',
                    }}
                  >
                    {task.completed ? <CheckIcon className="h-3 w-3" strokeWidth={2.5} /> : null}
                  </button>

                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-[12px] leading-4 transition-opacity ${
                        task.completed ? 'line-through opacity-50' : ''
                      }`}
                    >
                      {task.title}
                    </p>
                    {task.description ? (
                      <p className="mt-1 text-[11px] leading-4 text-[#aaa5b1]">
                        {task.description}
                      </p>
                    ) : null}
                    {task.suggestedTimeOfDay || task.estimatedMinutes ? (
                      <p className="mt-1 text-[10px] leading-4 text-[#81798d]">
                        {[
                          task.suggestedTimeOfDay,
                          task.estimatedMinutes
                            ? t('minutes', { count: task.estimatedMinutes })
                            : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => toggleAdvisorDrawer(true)}
            className="inline-flex h-4 items-center gap-1 text-[11px] leading-4 text-[#aaa5b1] transition-colors hover:text-white"
          >
            <ArrowPathIcon className="h-3 w-3" strokeWidth={2} />
            {t('adjust')}
          </button>
        </div>
      </article>
    </section>
  );
}
