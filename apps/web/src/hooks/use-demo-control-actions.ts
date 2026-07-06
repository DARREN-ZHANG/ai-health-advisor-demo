'use client';

import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useGodModeActions } from './use-god-mode-actions';
import { useGodModeStore } from '@/stores/god-mode.store';
import {
  useActiveSensingStore,
  type PendingProbabilisticAction,
} from '@/stores/active-sensing.store';
import { useUIStore } from '@/stores/ui.store';
import { useProfileStore } from '@/stores/profile.store';
import {
  PROBABILISTIC_EVENT_TYPE_MAP,
  PROBABILISTIC_SEGMENT_TYPES,
} from '@/components/demo-control/timeline-segments';
import type { TimelineSegmentConfig } from '@/components/demo-control/types';

/**
 * Demo Control 抽屉的三个动作回调（I2.3 接通层）。
 *
 * 设计：选择 Option A（新建独立 hook），保持 `useGodModeActions` 作为
 * 纯粹的 mutation 层。本 hook 仅做“抽屉动作 → mutation + pending +
 * toast”的胶水逻辑：
 *
 * - `onSegmentClick`：
 *   - 普通片段 → `appendTimeline`。
 *   - 概率片段（caffeine/alcohol）→ `injectEvent` + 在 active-sensing
 *     store 上记录 pendingProbabilisticAction，等待用户在 Banner 中
 *     二次确认。
 * - `onAdvanceHour`：调用 `advanceClock(60)`。
 * - `onReset`：调用 `resetTimeline({ profileId })`。
 *
 * pending 状态写入 `useGodModeStore`：
 * - segmentType 走 `setPendingSegmentType`，抽屉据此给当前卡片显示 spinner。
 * - advance/reset 走 `setPendingAction`，抽屉据此给底部按钮显示 spinner。
 * - finally 中始终清空，确保异常路径下 UI 不会卡死。
 *
 * 失败统一通过 `useUIStore().showToast` 上报，文案使用通用错误信息
 * （不耦合具体片段翻译键，避免本 hook 依赖 segment label 翻译）。
 */
export function useDemoControlActions() {
  const {
    appendTimeline,
    injectEvent,
    advanceClock,
    resetTimeline,
  } = useGodModeActions();
  const setPendingSegmentType = useGodModeStore((s) => s.setPendingSegmentType);
  const setPendingAction = useGodModeStore((s) => s.setPendingAction);
  const setPendingProbabilisticAction = useActiveSensingStore(
    (s) => s.setPendingProbabilisticAction,
  );
  const showToast = useUIStore((s) => s.showToast);
  const currentProfileId = useProfileStore((s) => s.currentProfileId);
  const t = useTranslations('demoControl');

  /**
   * 处理片段点击。
 *
   * @param segment 被点击的片段配置（由抽屉透传）
   */
  const handleSegmentClick = useCallback(
    async (segment: TimelineSegmentConfig) => {
      setPendingSegmentType(segment.type);
      try {
        if (PROBABILISTIC_SEGMENT_TYPES.has(segment.type)) {
          const eventType = PROBABILISTIC_EVENT_TYPE_MAP[segment.type];
          if (!eventType) {
            throw new Error(
              `No event type mapping for segment ${segment.type}`,
            );
          }
          await injectEvent({
            eventType,
            data: {
              source: segment.type,
              confidence: 0.75,
            },
          });
          // 类型收窄：PROBABILISTIC_SEGMENT_TYPES 仅含 alcohol/caffeine
          const pending: PendingProbabilisticAction = {
            segmentType: segment.type as PendingProbabilisticAction['segmentType'],
            params: { ...(segment.params ?? {}) },
          };
          setPendingProbabilisticAction(pending);
        } else {
          await appendTimeline({
            segmentType: segment.type,
            params: segment.params
              ? { ...(segment.params) }
              : undefined,
          });
        }
      } catch (error) {
        showToast(t('operationFailed'), 'error');
        console.error('Failed to apply timeline segment:', error);
      } finally {
        setPendingSegmentType(null);
      }
    },
    [
      appendTimeline,
      injectEvent,
      setPendingSegmentType,
      setPendingProbabilisticAction,
      showToast,
      t,
    ],
  );

  /** 处理 +1h（推进时钟 60 分钟）。 */
  const handleAdvanceHour = useCallback(async () => {
    setPendingAction('advance');
    try {
      await advanceClock(60);
    } catch (error) {
      showToast(t('advanceFailed'), 'error');
      console.error('Failed to advance clock:', error);
    } finally {
      setPendingAction(null);
    }
  }, [advanceClock, setPendingAction, showToast, t]);

  /** 处理重置（调用方应来自 TimelineResetDialog 的确认按钮）。 */
  const handleReset = useCallback(async () => {
    setPendingAction('reset');
    try {
      await resetTimeline({ profileId: currentProfileId });
      showToast(t('resetSucceeded'), 'success');
    } catch (error) {
      showToast(t('resetFailed'), 'error');
      console.error('Failed to reset timeline:', error);
    } finally {
      setPendingAction(null);
    }
  }, [
    currentProfileId,
    resetTimeline,
    setPendingAction,
    showToast,
    t,
  ]);

  return {
    onSegmentClick: handleSegmentClick,
    onAdvanceHour: handleAdvanceHour,
    onReset: handleReset,
  };
}
