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
] as const;

export type MicroEventType = (typeof MICRO_EVENT_TYPES)[number];
export type MicroEventParamValue = number | string | boolean;
export type MicroEventParams = Record<string, MicroEventParamValue>;
