import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ActivitySegmentSchema, type ActivitySegment } from '@health-advisor/shared';

/** 时间轴脚本文件结构 */
export interface TimelineScriptFile {
  profileId: string;
  scriptId: string;
  initialDemoTime: string;
  segments: ActivitySegment[];
}

/** 有效的活动片段类型集合 */
const VALID_SEGMENT_TYPES = new Set<string>([
  'meal_intake',
  'steady_cardio',
  'prolonged_sedentary',
  'intermittent_exercise',
  'walk',
  'sleep',
]);

/**
 * 从时间轴脚本文件中加载并校验片段
 * @param dataDir - data/sandbox 目录的绝对路径
 * @param ref - 脚本文件引用，如 { file: "timeline-scripts/profile-a-day-1.json" }
 */
export function loadTimelineScriptFile(
  dataDir: string,
  ref: { file: string },
): TimelineScriptFile {
  const filePath = join(dataDir, ref.file);
  const raw = readFileSync(filePath, 'utf-8');
  const parsed = JSON.parse(raw);

  // 校验顶层字段
  if (!parsed.profileId || typeof parsed.profileId !== 'string') {
    throw new Error('时间轴脚本缺少有效的 profileId');
  }
  if (!parsed.scriptId || typeof parsed.scriptId !== 'string') {
    throw new Error('时间轴脚本缺少有效的 scriptId');
  }
  if (!parsed.initialDemoTime || typeof parsed.initialDemoTime !== 'string') {
    throw new Error('时间轴脚本缺少有效的 initialDemoTime');
  }

  // 逐条校验 segments（注入 profileId，因为脚本中的 segment 可能不含此字段）
  const segments = (parsed.segments ?? []).map((segment: Record<string, unknown>) => {
    const enriched = { ...segment, profileId: parsed.profileId };
    return ActivitySegmentSchema.parse(enriched) as ActivitySegment;
  });

  // 校验片段不重叠
  validateTimelineScript(segments);

  return {
    profileId: parsed.profileId,
    scriptId: parsed.scriptId,
    initialDemoTime: parsed.initialDemoTime,
    segments,
  };
}

/**
 * 校验时间轴脚本的有效性
 * - 片段类型必须合法
 * - 片段时间范围不能重叠
 */
export function validateTimelineScript(segments: ActivitySegment[]): void {
  // 校验类型合法性
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index]!;
    if (!VALID_SEGMENT_TYPES.has(segment.type)) {
      throw new Error(`片段 #${index} 的类型无效: ${segment.type}`);
    }
  }

  // 校验片段不重叠：按 start 排序后逐一检查
  const sorted = [...segments].sort((a, b) => a.start.localeCompare(b.start));

  for (let index = 1; index < sorted.length; index += 1) {
    const prev = sorted[index - 1]!;
    const current = sorted[index]!;

    if (current.start < prev.end) {
      throw new Error(
        `片段重叠: "${prev.segmentId}" (${prev.start}~${prev.end}) ` +
        `与 "${current.segmentId}" (${current.start}~${current.end})`,
      );
    }
  }
}
