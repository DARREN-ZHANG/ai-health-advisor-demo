'use client';

import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useGodModeActions } from './use-god-mode-actions';
import { useRefetchBrief } from './use-ai-query';
import { useGodModeStore } from '@/stores/god-mode.store';
import { useProfileStore } from '@/stores/profile.store';
import {
  useActiveSensingStore,
  type PendingProbabilisticAction,
} from '@/stores/active-sensing.store';
import { useUIStore } from '@/stores/ui.store';
import {
  PROBABILISTIC_EVENT_TYPE_MAP,
  PROBABILISTIC_SEGMENT_TYPES,
} from '@/components/demo-control/timeline-segments';
import type { TimelineSegmentConfig } from '@/components/demo-control/types';

/**
 * Add Event 面板的事件注入回调。
 *
 * 交互设计（乐观 UI）：
 * - 点击任意添加按钮后，抽屉**立即关闭**（toggleOpen(false)），不等 mutation
 *   完成。让用户马上看到首页的加载反馈，而非卡在抽屉里。
 * - 普通片段（walk/meal 等）：写时间轴 → 强制刷新简报（bustCache 绕过
 *   Supabase 2h TTL）。期间 isBriefRefreshing=true 驱动首页 skeleton
 *   （与首次进入页面一致），pendingSegmentType 驱动抽屉按钮 loading。
 * - 概率片段（caffeine/alcohol）：injectEvent + active-sensing banner
 *   二次确认。**不刷新简报也不显示 skeleton**：用户在 Banner 确认前
 *   简报内容不应改变（后端 routes.ts 的设计意图）。
 *
 * pending 状态生命周期：
 * - setPendingSegmentType 在点击时设置，finally 中清空。
 * - 在 LLM 未返回前重开抽屉，pendingSegmentType 仍在 → 被点击的按钮
 *   保持 loading，其他按钮 disabled（DemoControlDrawer 内置该逻辑）。
 *
 * isBriefRefreshing 跨组件桥接：
 * - useDemoControlActions 和 page.tsx 各自调用 useRefetchBrief 得到的是
 *   独立的 mutation 实例，isPending 不互通。用 store flag 让 page.tsx
 *   能感知 demo-control 发起的刷新，从而显示 skeleton。
 *
 * 失败处理：抽屉已关闭（乐观），通过 toast 提示；isBriefRefreshing 和
 * pendingSegmentType 在 finally 中始终清空，确保 UI 不卡死。
 */
export function useDemoControlActions() {
  const { appendTimeline, injectEvent, resetTimeline, isResettingTimeline } = useGodModeActions();
  const { currentProfileId } = useProfileStore();
  const refetchBrief = useRefetchBrief(currentProfileId);
  const setPendingSegmentType = useGodModeStore((s) => s.setPendingSegmentType);
  const toggleOpen = useGodModeStore((s) => s.toggleOpen);
  const setIsBriefRefreshing = useGodModeStore((s) => s.setIsBriefRefreshing);
  const setPendingProbabilisticAction = useActiveSensingStore(
    (s) => s.setPendingProbabilisticAction,
  );
  const showToast = useUIStore((s) => s.showToast);
  const t = useTranslations('demoControl');

  /**
   * 处理片段点击：乐观关抽屉 → 写操作 → 刷新简报（普通事件）。
   */
  const handleSegmentClick = useCallback(
    async (segment: TimelineSegmentConfig) => {
      setPendingSegmentType(segment.type);
      // 乐观关闭：点击即刻收起抽屉，露出首页加载反馈
      toggleOpen(false);

      const isProbabilistic = PROBABILISTIC_SEGMENT_TYPES.has(segment.type);
      try {
        if (isProbabilistic) {
          const eventType = PROBABILISTIC_EVENT_TYPE_MAP[segment.type];
          if (!eventType) {
            throw new Error(`No event type mapping for segment ${segment.type}`);
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
          // 概率事件不刷新简报：用户在 Banner 二次确认前不应更新简报内容
        } else {
          // isBriefRefreshing 驱动首页 skeleton（与首次进入页面一致）
          setIsBriefRefreshing(true);
          await appendTimeline({
            segmentType: segment.type,
            params: segment.params ? { ...segment.params } : undefined,
          });
          // 强制刷新简报（bustCache）：useMorningBrief 的 invalidateQueries
          // 路径不带 bustCache，会命中后端 Supabase 2h TTL 缓存返回旧 LLM 输出。
          // useRefetchBrief.onSuccess 会 setQueryData 把新鲜结果写回 query cache。
          await refetchBrief.mutateAsync();
        }
      } catch (error) {
        showToast(t('operationFailed'), 'error');
        console.error('Failed to apply timeline segment:', error);
      } finally {
        setPendingSegmentType(null);
        setIsBriefRefreshing(false);
      }
    },
    [
      appendTimeline,
      injectEvent,
      refetchBrief,
      setPendingSegmentType,
      setPendingProbabilisticAction,
      setIsBriefRefreshing,
      showToast,
      t,
      toggleOpen,
    ],
  );

  const handleResetTimeline = useCallback(async () => {
    // reset 与添加普通事件一样会改变简报上下文；在后端重置和 LLM 刷新期间
    // 维持全局标志，使首页隐藏旧简报并展示 skeleton。
    setIsBriefRefreshing(true);
    try {
      await resetTimeline({ profileId: currentProfileId });
      toggleOpen(false);
      showToast(t('resetSucceeded'), 'success');
      await refetchBrief.mutateAsync();
    } catch (error) {
      showToast(t('resetFailed'), 'error');
      console.error('Failed to reset profile timeline:', error);
    } finally {
      setIsBriefRefreshing(false);
    }
  }, [
    currentProfileId,
    refetchBrief,
    resetTimeline,
    setIsBriefRefreshing,
    showToast,
    t,
    toggleOpen,
  ]);

  return {
    onSegmentClick: handleSegmentClick,
    onResetTimeline: handleResetTimeline,
    isResettingTimeline,
  };
}
