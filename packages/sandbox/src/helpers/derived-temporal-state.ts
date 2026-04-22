import type {
  DerivedTemporalState,
  RecognizedEvent,
} from '@health-advisor/shared';

// ============================================================
// 派生状态计算：从已识别事件推导当前时刻的临时状态
// ============================================================

/** 30 分钟阈值（毫秒） */
const RECENT_MEAL_THRESHOLD_MIN = 30;

// ============================================================
// 公共函数
// ============================================================

/**
 * 从已识别事件计算派生临时状态
 * @param recognizedEvents - 已识别事件列表
 * @param currentTime - 当前时间（YYYY-MM-DDTHH:mm）
 * @param profileId - 当前 profile 标识
 */
export function computeDerivedTemporalStates(
  recognizedEvents: RecognizedEvent[],
  currentTime: string,
  profileId: string,
): DerivedTemporalState[] {
  const results: DerivedTemporalState[] = [];

  for (const event of recognizedEvents) {
    // 只处理当前 profile 的事件
    if (event.profileId !== profileId) continue;

    // recent_meal_30m: 进餐事件在 30 分钟内结束
    if (event.type === 'meal_intake') {
      const state = deriveRecentMeal(event, currentTime);
      if (state) {
        results.push(state);
      }
    }
  }

  return results;
}

// ============================================================
// 规则实现
// ============================================================

/**
 * 如果 meal_intake 事件在最近 30 分钟内结束，产生 recent_meal_30m 状态
 * @param meal - 进餐已识别事件
 * @param currentTime - 当前时间
 */
function deriveRecentMeal(
  meal: RecognizedEvent,
  currentTime: string,
): DerivedTemporalState | null {
  const diffMin = diffMinutes(meal.end, currentTime);

  // 事件结束时间在未来或超过 30 分钟，不产生状态
  if (diffMin < 0 || diffMin > RECENT_MEAL_THRESHOLD_MIN) {
    return null;
  }

  return {
    type: 'recent_meal_30m',
    profileId: meal.profileId,
    sourceRecognizedEventId: meal.recognizedEventId,
    activeAt: meal.end,
    metadata: { mealEnd: meal.end },
  };
}

// ============================================================
// 辅助工具
// ============================================================

/** 计算两个时间戳之间的分钟差 */
function diffMinutes(start: string, end: string): number {
  const s = new Date(`${start}:00`);
  const e = new Date(`${end}:00`);
  return Math.round((e.getTime() - s.getTime()) / 60000);
}
