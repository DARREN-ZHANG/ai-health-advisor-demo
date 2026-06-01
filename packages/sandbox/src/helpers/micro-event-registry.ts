import type { MicroEventType } from '@health-advisor/shared';

export interface MicroEventDefinition {
  type: MicroEventType;
  defaultDurationMinutes: number;
  titleZh: string;
  evidenceLabelZh: string;
  profile:
    | 'deep_breathing'
    | 'short_walk'
    | 'post_meal_walk'
    | 'post_workout_slow_walk'
    | 'standing_stretch'
    | 'desk_mobility'
    | 'offscreen_rest'
    | 'window_gaze_walk'
    | 'snack'
    | 'easy_cardio'
    | 'restorative_stretch'
    | 'low_stimulus'
    | 'sleep_wind_down';
}

export const MICRO_EVENT_REGISTRY: Record<MicroEventType, MicroEventDefinition> = {
  micro_deep_breathing: {
    type: 'micro_deep_breathing',
    defaultDurationMinutes: 3,
    titleZh: '做几次深呼吸',
    evidenceLabelZh: '检测到短暂静止与呼吸节律变化',
    profile: 'deep_breathing',
  },
  micro_short_walk: {
    type: 'micro_short_walk',
    defaultDurationMinutes: 5,
    titleZh: '起身走几分钟',
    evidenceLabelZh: '检测到短时步行与活动量上升',
    profile: 'short_walk',
  },
  micro_post_meal_walk: {
    type: 'micro_post_meal_walk',
    defaultDurationMinutes: 5,
    titleZh: '饭后走一小会儿',
    evidenceLabelZh: '检测到餐后轻度步行',
    profile: 'post_meal_walk',
  },
  micro_post_workout_slow_walk: {
    type: 'micro_post_workout_slow_walk',
    defaultDurationMinutes: 8,
    titleZh: '运动后慢走几分钟',
    evidenceLabelZh: '检测到运动后心率逐步回落的慢走',
    profile: 'post_workout_slow_walk',
  },
  micro_standing_stretch: {
    type: 'micro_standing_stretch',
    defaultDurationMinutes: 5,
    titleZh: '站起来活动肩颈',
    evidenceLabelZh: '检测到站立位轻量活动',
    profile: 'standing_stretch',
  },
  micro_desk_mobility: {
    type: 'micro_desk_mobility',
    defaultDurationMinutes: 4,
    titleZh: '在桌边活动关节',
    evidenceLabelZh: '检测到坐位附近微活动',
    profile: 'desk_mobility',
  },
  micro_offscreen_eye_rest: {
    type: 'micro_offscreen_eye_rest',
    defaultDurationMinutes: 10,
    titleZh: '闭眼离屏休息',
    evidenceLabelZh: '检测到低刺激静止与心率下降',
    profile: 'offscreen_rest',
  },
  micro_window_gaze_walk: {
    type: 'micro_window_gaze_walk',
    defaultDurationMinutes: 4,
    titleZh: '到窗边看远处',
    evidenceLabelZh: '检测到短距离移动后静止观望',
    profile: 'window_gaze_walk',
  },
  micro_pre_workout_snack: {
    type: 'micro_pre_workout_snack',
    defaultDurationMinutes: 10,
    titleZh: '训练前吃一份小点',
    evidenceLabelZh: '检测到短暂静止后轻度活动',
    profile: 'snack',
  },
  micro_post_workout_snack: {
    type: 'micro_post_workout_snack',
    defaultDurationMinutes: 10,
    titleZh: '运动后补一份恢复小点',
    evidenceLabelZh: '检测到运动后静止与轻度消化活动',
    profile: 'snack',
  },
  micro_easy_cardio: {
    type: 'micro_easy_cardio',
    defaultDurationMinutes: 20,
    titleZh: '做一段轻松有氧',
    evidenceLabelZh: '检测到持续低强度有氧运动',
    profile: 'easy_cardio',
  },
  micro_restorative_stretch: {
    type: 'micro_restorative_stretch',
    defaultDurationMinutes: 12,
    titleZh: '做一段拉伸恢复',
    evidenceLabelZh: '检测到恢复性拉伸活动',
    profile: 'restorative_stretch',
  },
  micro_low_stimulus_work: {
    type: 'micro_low_stimulus_work',
    defaultDurationMinutes: 30,
    titleZh: '做一段低刺激收尾工作',
    evidenceLabelZh: '检测到低认知负荷静止工作',
    profile: 'low_stimulus',
  },
  micro_sleep_wind_down: {
    type: 'micro_sleep_wind_down',
    defaultDurationMinutes: 20,
    titleZh: '睡前放松一会儿',
    evidenceLabelZh: '检测到睡前心率与压力逐步下降',
    profile: 'sleep_wind_down',
  },
};
