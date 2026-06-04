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
    | 'sleep_wind_down'
    // === R1 ===
    | 'box_breathing'
    | 'calming_breathing'
    | 'hydration_walk'
    | 'warm_shower'
    | 'posture_correction'
    | 'neuro_warmup'
    // === R2 ===
    | 'recovery_meal'
    | 'power_nap'
    | 'screen_dimming'
    | 'cool_shower'
    | 'outdoor_breather'
    | 'stair_climb'
    // === R3 ===
    | 'standing_work'
    | 'foam_rolling'
    | 'cold_face_dip'
    | 'mindfulness_meditation'
    | 'muscle_relaxation'
    | 'light_meal';
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
  // === R1: 呼吸、补水、体温、体态 ===
  micro_box_breathing: {
    type: 'micro_box_breathing',
    defaultDurationMinutes: 3,
    titleZh: '做一组箱式呼吸',
    evidenceLabelZh: '检测到结构化呼吸节律与心率快速下降',
    profile: 'box_breathing',
  },
  micro_calming_breathing: {
    type: 'micro_calming_breathing',
    defaultDurationMinutes: 5,
    titleZh: '做一组舒缓调息',
    evidenceLabelZh: '检测到延长呼气节律与心率温和下降',
    profile: 'calming_breathing',
  },
  micro_hydration_walk: {
    type: 'micro_hydration_walk',
    defaultDurationMinutes: 5,
    titleZh: '去接杯水走一走',
    evidenceLabelZh: '检测到短时轻度步行与短暂静止交替',
    profile: 'hydration_walk',
  },
  micro_warm_shower: {
    type: 'micro_warm_shower',
    defaultDurationMinutes: 10,
    titleZh: '洗个温水澡',
    evidenceLabelZh: '检测到沐浴活动与心率变化',
    profile: 'warm_shower',
  },
  micro_posture_correction: {
    type: 'micro_posture_correction',
    defaultDurationMinutes: 15,
    titleZh: '纠正一下坐姿',
    evidenceLabelZh: '检测到坐姿微调整与低活动量',
    profile: 'posture_correction',
  },
  micro_neuro_warmup: {
    type: 'micro_neuro_warmup',
    defaultDurationMinutes: 5,
    titleZh: '做一组热身唤醒',
    evidenceLabelZh: '检测到原地轻度活动与心率微升',
    profile: 'neuro_warmup',
  },
  // === R2: 营养、淋浴、休息、移动 ===
  micro_recovery_meal: {
    type: 'micro_recovery_meal',
    defaultDurationMinutes: 15,
    titleZh: '吃一份练后恢复餐',
    evidenceLabelZh: '检测到餐后静止与轻度消化活动',
    profile: 'recovery_meal',
  },
  micro_power_nap: {
    type: 'micro_power_nap',
    defaultDurationMinutes: 20,
    titleZh: '闭眼小憩一会儿',
    evidenceLabelZh: '检测到平躺静止与心率降至静息以下',
    profile: 'power_nap',
  },
  micro_screen_dimming: {
    type: 'micro_screen_dimming',
    defaultDurationMinutes: 15,
    titleZh: '关屏调暗灯光',
    evidenceLabelZh: '检测到低刺激静止与心率缓慢下降',
    profile: 'screen_dimming',
  },
  micro_cool_shower: {
    type: 'micro_cool_shower',
    defaultDurationMinutes: 8,
    titleZh: '冲个微凉淋浴',
    evidenceLabelZh: '检测到淋浴活动与心率快速回落',
    profile: 'cool_shower',
  },
  micro_outdoor_breather: {
    type: 'micro_outdoor_breather',
    defaultDurationMinutes: 10,
    titleZh: '去户外透透气',
    evidenceLabelZh: '检测到户外级步数与血氧回升',
    profile: 'outdoor_breather',
  },
  micro_stair_climb: {
    type: 'micro_stair_climb',
    defaultDurationMinutes: 5,
    titleZh: '爬几层楼梯',
    evidenceLabelZh: '检测到短时高强度步频与心率快速上升',
    profile: 'stair_climb',
  },
  // === R3: 冥想、站姿、筋膜、迷走神经 ===
  micro_standing_work: {
    type: 'micro_standing_work',
    defaultDurationMinutes: 20,
    titleZh: '站起来办公一会儿',
    evidenceLabelZh: '检测到站立位低活动量工作',
    profile: 'standing_work',
  },
  micro_foam_rolling: {
    type: 'micro_foam_rolling',
    defaultDurationMinutes: 10,
    titleZh: '用泡沫轴放松一下',
    evidenceLabelZh: '检测到地面级低强度活动',
    profile: 'foam_rolling',
  },
  micro_cold_face_dip: {
    type: 'micro_cold_face_dip',
    defaultDurationMinutes: 3,
    titleZh: '用冷水敷一下脸',
    evidenceLabelZh: '检测到极短期心率骤降',
    profile: 'cold_face_dip',
  },
  micro_mindfulness_meditation: {
    type: 'micro_mindfulness_meditation',
    defaultDurationMinutes: 15,
    titleZh: '做一段正念冥想',
    evidenceLabelZh: '检测到持续静止与心率平稳下降',
    profile: 'mindfulness_meditation',
  },
  micro_muscle_relaxation: {
    type: 'micro_muscle_relaxation',
    defaultDurationMinutes: 10,
    titleZh: '做一组渐进式肌肉放松',
    evidenceLabelZh: '检测到规律性微张力与心率锯齿形下降',
    profile: 'muscle_relaxation',
  },
  micro_light_meal: {
    type: 'micro_light_meal',
    defaultDurationMinutes: 15,
    titleZh: '吃一份清淡轻食',
    evidenceLabelZh: '检测到轻度消化活动与低代谢负担',
    profile: 'light_meal',
  },
};
