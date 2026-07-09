'use client';

import { useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { ActionOption } from '@health-advisor/shared';
import { useRefetchBrief } from '@/hooks/use-ai-query';
import { useGodModeActions } from '@/hooks/use-god-mode-actions';
import { useGodModeStore } from '@/stores/god-mode.store';
import { useUIStore } from '@/stores/ui.store';

/**
 * useActionInteractions —— 把 ActionCard / Timer / Appointment 的交互
 * 桥接到 micro event 写入 + 实时简报刷新 + 会话内记录。
 *
 * 行为契约（来自 I3.2）：
 * - Yes 按钮：根据 `action.interaction.kind` 决定
 *   - `micro_event` 且 `durationMinutes > 0` → 打开 Timer
 *   - `micro_event` 且无 duration → 立即提交（appendMicroEvent + refetchBrief）
 *   - 其他（calendar / 无 interaction） → 仅记录选择，不刷新简报
 * - Timer 完成（自然或立即）：appendMicroEvent + refetchBrief（仅一次）
 * - 需要刷新简报的操作从提交开始到 LLM 返回期间设置 isBriefRefreshing，
 *   统一驱动首页 Hero 思考态和简报 skeleton。
 * - Timer Stop：关闭，不提交
 * - Not Now：仅收起，不记录
 * - Calendar action：打开 Appointment sheet，确认后仅记录（不调用外部日历）
 *
 * 单个 Timer / Appointment 同时至多一个，避免同时追踪多个浮层。
 */
export function useActionInteractions(profileId: string | undefined) {
  const { showToast } = useUIStore();
  const refetchBrief = useRefetchBrief(profileId);
  const { appendMicroEvent, isAppendingMicroEvent } = useGodModeActions();
  const setIsBriefRefreshing = useGodModeStore(
    (state) => state.setIsBriefRefreshing,
  );
  const t = useTranslations('homepage.action');

  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [selectedActionIds, setSelectedActionIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [calendarActionIds, setCalendarActionIds] = useState<Set<string>>(
    () => new Set(),
  );

  /** 当前打开 Timer 的 action（同一时间最多一个） */
  const [timerAction, setTimerAction] = useState<ActionOption | null>(null);
  /** 当前打开 Appointment 的 action */
  const [appointmentAction, setAppointmentAction] =
    useState<ActionOption | null>(null);

  /** 立即提交：appendMicroEvent + refetchBrief（用于无 duration 的 micro_event） */
  const submitMicroEventNow = useCallback(
    async (action: ActionOption) => {
      if (action.interaction?.kind !== 'micro_event') return;
      setPendingActionId(action.id);
      setIsBriefRefreshing(true);
      try {
        await appendMicroEvent({
          microEventType: action.interaction.microEvent.type,
          durationMinutes: action.interaction.microEvent.durationMinutes,
          params: action.interaction.microEvent.params,
          advanceClock: true,
        });
        setSelectedActionIds((prev) => new Set(prev).add(action.id));
        showToast(t('toastRecorded'), 'success');
        await refetchBrief.mutateAsync();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : t('toastFailed');
        showToast(message, 'error');
      } finally {
        setPendingActionId(null);
        setIsBriefRefreshing(false);
      }
    },
    [
      appendMicroEvent,
      refetchBrief,
      setIsBriefRefreshing,
      showToast,
      t,
    ],
  );

  /** Yes 按钮：根据 action.interaction 决定立即提交或打开 Timer */
  const handleYes = useCallback(
    async (action: ActionOption) => {
      const interaction = action.interaction;
      if (interaction?.kind === 'micro_event') {
        const duration = interaction.microEvent.durationMinutes;
        if (typeof duration === 'number' && duration > 0) {
          // 有 duration → 打开 Timer
          setTimerAction(action);
          return;
        }
        // 无 duration → 沿用现有立即提交
        await submitMicroEventNow(action);
        return;
      }

      if (interaction?.kind === 'calendar') {
        // 日历行动 → 打开 Appointment sheet
        setAppointmentAction(action);
        return;
      }

      // 非 micro_event / 非 calendar（传感器不可识别的动作）→ 仅记录选择
      setSelectedActionIds((prev) => new Set(prev).add(action.id));
      showToast(
        t('toastUnverifiable', { title: action.title }),
        'success',
      );
    },
    [submitMicroEventNow, showToast, t],
  );

  /** Not Now 按钮：仅收起，不记录 */
  const handleNotNow = useCallback((action: ActionOption) => {
    // 仅由 ActionCard 内部 collapse 处理；这里保留接口对称。
    // 引用 action 避免 unused-vars，便于未来按需埋点。
    void action;
  }, []);

  /** Timer 自然/立即完成：appendMicroEvent + refetchBrief（仅一次） */
  const handleTimerComplete = useCallback(async () => {
    const action = timerAction;
    setTimerAction(null);
    if (!action) return;
    await submitMicroEventNow(action);
  }, [timerAction, submitMicroEventNow]);

  /** Timer Stop：关闭，不提交 */
  const handleTimerStop = useCallback(() => {
    setTimerAction(null);
  }, []);

  /** Appointment 确认：仅记录会话内状态 */
  const handleAppointmentConfirm = useCallback(() => {
    if (!appointmentAction) return;
    const action = appointmentAction;
    setCalendarActionIds((prev) => new Set(prev).add(action.id));
    setAppointmentAction(null);
    showToast(t('toastCalendarAdded'), 'success');
  }, [appointmentAction, showToast, t]);

  /** 关闭 Appointment sheet */
  const handleAppointmentClose = useCallback(() => {
    setAppointmentAction(null);
  }, []);

  return {
    // 状态
    pendingActionId,
    selectedActionIds,
    calendarActionIds,
    isBusy: isAppendingMicroEvent || refetchBrief.isPending,
    // Timer
    timerAction,
    handleTimerComplete,
    handleTimerStop,
    // Appointment
    appointmentAction,
    handleAppointmentConfirm,
    handleAppointmentClose,
    // ActionCard
    handleYes,
    handleNotNow,
  };
}
