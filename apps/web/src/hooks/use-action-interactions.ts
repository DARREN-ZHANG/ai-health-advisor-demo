'use client';

import { useState } from 'react';
import type { ActionOption } from '@health-advisor/shared';
import { useRefetchBrief } from '@/hooks/use-ai-query';
import { useGodModeActions } from '@/hooks/use-god-mode-actions';
import { useUIStore } from '@/stores/ui.store';

export function useActionInteractions(profileId: string | undefined) {
  const { showToast } = useUIStore();
  const refetchBrief = useRefetchBrief(profileId);
  const { appendMicroEvent, isAppendingMicroEvent } = useGodModeActions();
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [selectedActionIds, setSelectedActionIds] = useState<Set<string>>(() => new Set());
  const [calendarActionIds, setCalendarActionIds] = useState<Set<string>>(() => new Set());

  async function selectAction(action: ActionOption) {
    if (action.interaction?.kind !== 'micro_event') {
      setSelectedActionIds((prev) => new Set(prev).add(action.id));
      showToast(`${action.title}：已记录`, 'success');
      return;
    }

    setPendingActionId(action.id);
    try {
      await appendMicroEvent({
        microEventType: action.interaction.microEvent.type,
        durationMinutes: action.interaction.microEvent.durationMinutes,
        params: action.interaction.microEvent.params,
        advanceClock: true,
      });
      setSelectedActionIds((prev) => new Set(prev).add(action.id));
      showToast('已记录，正在更新实时简报', 'success');
      await refetchBrief.mutateAsync();
    } catch (error) {
      const message = error instanceof Error ? error.message : '微行动记录失败';
      showToast(message, 'error');
    } finally {
      setPendingActionId(null);
    }
  }

  function addCalendarAction(action: ActionOption) {
    setCalendarActionIds((prev) => new Set(prev).add(action.id));
    showToast('已添加进日程', 'success');
  }

  return {
    selectAction,
    addCalendarAction,
    pendingActionId,
    selectedActionIds,
    calendarActionIds,
    isBusy: isAppendingMicroEvent || refetchBrief.isPending,
  };
}
