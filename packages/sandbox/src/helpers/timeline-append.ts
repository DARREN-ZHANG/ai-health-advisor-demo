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

/** 各片段类型的默认持续时长（分钟），与文档 §8.3 对齐 */
const DEFAULT_DURATION: Record<ActivitySegmentType, number> = {
  meal_intake: 20,
  steady_cardio: 15,
  prolonged_sedentary: 240,
  intermittent_exercise: 30,
  walk: 30,
  sleep: 480,
  deep_focus: 120,
  anxiety_episode: 30,
  breathing_pause: 15,
  alcohol_intake: 120,
  nightmare: 30,
  relaxation: 30,
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
 * @param options - 可选配置：durationMinutes 覆盖默认时长，advanceClock 控制是否推进时钟
 */
export function appendSegment(
  currentSegments: ActivitySegment[],
  currentTime: string,
  segmentType: ActivitySegmentType,
  profileId: string,
  params?: Record<string, number | string | boolean>,
  offsetMinutes: number = 0,
  options?: { durationMinutes?: number; advanceClock?: boolean },
): TimelineAppendResult {
  // 校验偏移量
  if (offsetMinutes < 0) {
    throw new Error(`offsetMinutes 不能为负数: ${offsetMinutes}`);
  }

  // 计算新片段的起始时间
  const start = addMinutes(currentTime, offsetMinutes);

  // 确定持续时长：优先使用 options.durationMinutes，其次使用默认值
  const duration = options?.durationMinutes ?? DEFAULT_DURATION[segmentType];
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

  // advanceClock 默认为 true；为 false 时不推进时钟
  const advanceClock = options?.advanceClock !== false;
  const newCurrentTime = advanceClock ? end : currentTime;

  return {
    segments: updatedSegments,
    events,
    newCurrentTime,
  };
}
