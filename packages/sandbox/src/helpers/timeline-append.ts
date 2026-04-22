import type {
  ActivitySegment,
  ActivitySegmentType,
} from '@health-advisor/shared';
import { generateEventsForSegment } from './activity-generators';

// ============================================================
// Timeline Append 逻辑：在时间轴末尾追加新活动片段
// ============================================================

/** appendSegment 的返回结果 */
export interface TimelineAppendResult {
  /** 更新后的完整片段列表（不可变） */
  segments: ActivitySegment[];
  /** 新生成的设备事件 */
  events: DeviceEvent[];
  /** 更新后的当前时间 */
  newCurrentTime: string;
}

// 需要在此处导入 DeviceEvent（用于类型标注）
import type { DeviceEvent } from '@health-advisor/shared';

/** 各片段类型的默认持续时长（分钟） */
const DEFAULT_DURATION: Record<ActivitySegmentType, number> = {
  meal_intake: 25,
  steady_cardio: 30,
  prolonged_sedentary: 90,
  intermittent_exercise: 25,
  walk: 20,
  sleep: 480,
};

/** 给 YYYY-MM-DDTHH:mm 格式的时间戳加 N 分钟（使用本地时间解析） */
function addMinutes(timestamp: string, minutes: number): string {
  const date = new Date(`${timestamp}:00`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`无效的时间戳格式: ${timestamp}`);
  }
  date.setMinutes(date.getMinutes() + minutes);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d}T${h}:${min}`;
}

/**
 * 在时间轴末尾追加新的活动片段
 *
 * 规则：
 * - 新片段从 currentTime + offsetMinutes 开始
 * - offset 必须 >= 0
 * - 新片段不能与已有片段重叠
 * - 返回不可变结果（不修改输入数组）
 *
 * @param currentSegments - 当前的片段列表
 * @param currentTime - 当前时间（YYYY-MM-DDTHH:mm）
 * @param segmentType - 新片段类型
 * @param profileId - profile 标识
 * @param params - 片段参数
 * @param offsetMinutes - 起始偏移分钟数（默认 0）
 */
export function appendSegment(
  currentSegments: ActivitySegment[],
  currentTime: string,
  segmentType: ActivitySegmentType,
  profileId: string,
  params?: Record<string, number | string | boolean>,
  offsetMinutes: number = 0,
): TimelineAppendResult {
  // 校验偏移量
  if (offsetMinutes < 0) {
    throw new Error(`offsetMinutes 不能为负数: ${offsetMinutes}`);
  }

  // 计算新片段的起始时间
  const start = addMinutes(currentTime, offsetMinutes);

  // 从 params 中提取持续时间（如果有）
  const duration = getDuration(segmentType, params);
  const end = addMinutes(start, duration);

  // 生成片段 ID（使用起始时间的时间戳使其唯一）
  const segmentId = `seg-gm-${segmentType}-${start.replace(/[-T:]/g, '')}`;

  // 检查是否与已有片段重叠
  for (const existing of currentSegments) {
    if (start < existing.end && end > existing.start) {
      throw new Error(
        `新片段 (${start}~${end}) 与已有片段 "${existing.segmentId}" (${existing.start}~${existing.end}) 重叠`,
      );
    }
  }

  // 创建新的活动片段
  const newSegment: ActivitySegment = {
    segmentId,
    profileId,
    type: segmentType,
    start,
    end,
    params,
    source: 'god_mode',
  };

  // 生成设备事件
  const events = generateEventsForSegment(newSegment);

  // 构建新的片段列表（不可变追加）
  const updatedSegments = [...currentSegments, newSegment];

  return {
    segments: updatedSegments,
    events,
    newCurrentTime: end,
  };
}

/**
 * 根据片段类型和参数获取持续时长
 * 优先使用 params.durationMinutes，否则使用默认值
 */
function getDuration(
  segmentType: ActivitySegmentType,
  params?: Record<string, number | string | boolean>,
): number {
  if (params?.durationMinutes && typeof params.durationMinutes === 'number') {
    return params.durationMinutes;
  }
  return DEFAULT_DURATION[segmentType];
}
