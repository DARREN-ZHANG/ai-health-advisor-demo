import type { TimelineAppendPayload } from '@health-advisor/shared';

/**
 * 时间轴片段的 segmentType 联合类型
 *
 * 与后端 ActivitySegmentType 保持一致（13 个固定值）。
 */
export type TimelineSegmentType = TimelineAppendPayload['segmentType'];

/**
 * 时间轴片段分组标识
 *
 * 三组固定顺序：日常节律 → 运动训练 → 状态与摄入。
 */
export type TimelineSegmentGroup = 'daily-rhythm' | 'sport-training' | 'state-intake';

/**
 * 单个时间轴片段配置（只读）
 *
 * 描述一个可被注入到时间轴中的活动片段，
 * 包含图标、翻译键、帮助文案键以及默认参数。
 */
export interface TimelineSegmentConfig {
  readonly type: TimelineSegmentType;
  readonly labelKey: string;
  readonly helpKey: string;
  readonly icon: string;
  readonly params?: Readonly<Record<string, number | string | boolean>>;
  readonly group: TimelineSegmentGroup;
}

/**
 * 已识别事件的展示元数据（只读）
 *
 * 用于在时间轴 hover 等场景下渲染事件图标与翻译键。
 */
export interface EventDisplayConfig {
  readonly icon: string;
  readonly labelKey: string;
}
