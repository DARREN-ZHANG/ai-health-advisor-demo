import type { PlanDraftInput, PlanGroupDraft, PlanTaskDraft } from '@health-advisor/shared';
import { cleanSafetyIssues } from './safety-cleaner';

/**
 * 计划草稿安全清洗：复用 cleanSafetyIssues 的诊断 / 用药 / 缺失数据幻觉规则，
 * 把同样的清洗逻辑应用到 planDraft 的所有客户可见文本字段上。
 *
 * 不允许启发式补字段；只做"危险词替换"。任何字段清洗失败仍然返回原始字段，
 * 但会出现在 flags 里，便于审核链路拒绝整条 envelope。
 */
export interface PlanDraftCleanResult {
  cleaned: PlanDraftInput;
  /** 是否发生任何替换；若发生则审核链路可据此升级拒绝。 */
  touched: boolean;
}

export function cleanPlanDraftSafety(
  draft: PlanDraftInput,
  missingMetrics: string[],
): PlanDraftCleanResult {
  let touched = false;

  const titleClean = cleanSafetyIssues(draft.title, missingMetrics);
  const summaryClean = cleanSafetyIssues(draft.summary, missingMetrics);
  if (titleClean.cleaned !== draft.title || summaryClean.cleaned !== draft.summary) {
    touched = true;
  }

  const groups: PlanGroupDraft[] = draft.groups.map((group) => {
    const groupTitleClean = cleanSafetyIssues(group.title, missingMetrics);
    if (groupTitleClean.cleaned !== group.title) touched = true;
    const tasks: PlanTaskDraft[] = group.tasks.map((task) => {
      const taskFields: Array<keyof PlanTaskDraft> = ['title', 'description', 'suggestedTimeOfDay'];
      const next: PlanTaskDraft = { ...task };
      for (const key of taskFields) {
        const value = task[key];
        if (typeof value === 'string') {
          const cleaned = cleanSafetyIssues(value, missingMetrics);
          if (cleaned.cleaned !== value) {
            touched = true;
            (next[key] as string | undefined) = cleaned.cleaned;
          }
        }
      }
      return next;
    });
    return { title: groupTitleClean.cleaned, tasks };
  });

  return {
    cleaned: {
      title: titleClean.cleaned,
      summary: summaryClean.cleaned,
      groups,
    },
    touched,
  };
}
