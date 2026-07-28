'use client';

import { AgentTaskType, UiDirectiveSchema, type AgentResponseEnvelope } from '@health-advisor/shared';
import {
  selectHomeTrendCardDisplay,
  useHomeTrendCardStore,
} from '@/stores/home-trend-card.store';

/**
 * 在网络边界再次校验 AgentResponseEnvelope.uiDirectives，并把通过校验的指令
 * 应用到首页 Trends Brief store。
 *
 * 这是"客户端不信任网络数据"原则的协议级守门——不是基于 summary / 用户关键词的
 * 启发式判断，而是用 Zod schema 复核 server 返回的 typed directive。
 *
 * 同时满足以下条件才更新 store：
 * 1. response.meta.taskType === ADVISOR_CHAT
 * 2. response.meta.finishReason === 'complete'
 * 3. response.meta.pageContext.profileId === requestProfileId（避免迟到响应污染当前 Profile）
 * 4. uiDirectives 长度恰好为 1
 * 5. 指令通过 UiDirectiveSchema.safeParse
 *
 * 任一条件不满足时静默忽略，store 保持不变，不抛异常，不显示成功 toast。
 */
export function applyAdvisorUiDirectives(
  response: AgentResponseEnvelope,
  requestProfileId: string,
): void {
  if (response.meta.taskType !== AgentTaskType.ADVISOR_CHAT) return;
  if (response.meta.finishReason !== 'complete') return;
  if (response.meta.pageContext.profileId !== requestProfileId) return;

  const directives = response.uiDirectives;
  if (!directives || directives.length !== 1) return;

  const parsed = UiDirectiveSchema.safeParse(directives[0]);
  if (!parsed.success) {
    // 网络返回的 typed directive 不符合 schema：协议违规，记 warn 但不抛。
    if (typeof console !== 'undefined' && typeof console.warn === 'function') {
      console.warn(
        '[advisor-ui-directives] 非法 uiDirective 被 Web 网络边界拒绝:',
        parsed.error.issues,
      );
    }
    return;
  }

  const store = useHomeTrendCardStore.getState();
  store.setDisplay(requestProfileId, parsed.data.display);
  if (parsed.data.display === 'sleep') {
    store.setSleepOfferState(requestProfileId, 'accepted');
  }
}

// 仅用于测试断言「未知 directive 不更新 store」时验证 selectHomeTrendCardDisplay 的输出。
// 重新导出避免在测试文件中重复 import。
export { selectHomeTrendCardDisplay };
