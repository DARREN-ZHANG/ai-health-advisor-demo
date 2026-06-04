export const MICRO_EVENT_TYPES = [
  'micro_deep_breathing',
  'micro_short_walk',
  'micro_post_meal_walk',
  'micro_post_workout_slow_walk',
  'micro_standing_stretch',
  'micro_desk_mobility',
  'micro_offscreen_eye_rest',
  'micro_window_gaze_walk',
  'micro_pre_workout_snack',
  'micro_post_workout_snack',
  'micro_easy_cardio',
  'micro_restorative_stretch',
  'micro_low_stimulus_work',
  'micro_sleep_wind_down',
  // === R1: 呼吸、补水、体温、体态 ===
  'micro_box_breathing',
  'micro_calming_breathing',
  'micro_hydration_walk',
  'micro_warm_shower',
  'micro_posture_correction',
  'micro_neuro_warmup',
  // === R2: 营养、淋浴、休息、移动 ===
  'micro_recovery_meal',
  'micro_power_nap',
  'micro_screen_dimming',
  'micro_cool_shower',
  'micro_outdoor_breather',
  'micro_stair_climb',
  // === R3: 冥想、站姿、筋膜、迷走神经 ===
  'micro_standing_work',
  'micro_foam_rolling',
  'micro_cold_face_dip',
  'micro_mindfulness_meditation',
  'micro_muscle_relaxation',
  'micro_light_meal',
] as const;

export type MicroEventType = (typeof MICRO_EVENT_TYPES)[number];
export type MicroEventParamValue = number | string | boolean;
export type MicroEventParams = Record<string, MicroEventParamValue>;
