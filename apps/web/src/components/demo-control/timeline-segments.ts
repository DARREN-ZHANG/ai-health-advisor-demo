import type {
  EventDisplayConfig,
  TimelineSegmentConfig,
  TimelineSegmentGroup,
} from './types';

/**
 * 三组的固定顺序与命名。
 *
 * 顺序：日常节律 → 运动训练 → 状态与摄入。
 * 该顺序是 timeline control UI 渲染分组的契约。
 */
export const TIMELINE_SEGMENT_GROUPS: readonly TimelineSegmentGroup[] = [
  'daily-rhythm',
  'sport-training',
  'state-intake',
] as const;

/**
 * 完整的 13 个时间轴片段配置。
 *
 * 按组顺序排列，每组内按既定顺序：
 * - daily-rhythm (6): meal_intake, walk, sleep, nap, deep_focus, relaxation
 * - sport-training (3): steady_cardio, intermittent_exercise, strength_training
 * - state-intake (4): prolonged_sedentary, anxiety_episode, caffeine_intake, alcohol_intake
 *
 * 每个片段在数组中只出现一次。
 */
export const TIMELINE_SEGMENTS: readonly TimelineSegmentConfig[] = [
  // === 日常节律 (daily-rhythm) ===
  {
    type: 'meal_intake',
    labelKey: 'mealIntake',
    helpKey: 'mealIntake',
    icon: '🍽️',
    params: { mealContext: 'breakfast' },
    group: 'daily-rhythm',
  },
  {
    type: 'walk',
    labelKey: 'walk',
    helpKey: 'walk',
    icon: '🚶',
    group: 'daily-rhythm',
  },
  {
    type: 'sleep',
    labelKey: 'sleep',
    helpKey: 'sleep',
    icon: '😴',
    params: { durationMinutes: 480 },
    group: 'daily-rhythm',
  },
  {
    type: 'nap',
    labelKey: 'nap',
    helpKey: 'nap',
    icon: '💤',
    params: { durationMinutes: 60 },
    group: 'daily-rhythm',
  },
  {
    type: 'deep_focus',
    labelKey: 'deepFocus',
    helpKey: 'deepFocus',
    icon: '🧠',
    params: { intensity: 'high' },
    group: 'daily-rhythm',
  },
  {
    type: 'relaxation',
    labelKey: 'relaxation',
    helpKey: 'relaxation',
    icon: '📖',
    params: { activity: 'reading' },
    group: 'daily-rhythm',
  },
  // === 运动训练 (sport-training) ===
  {
    type: 'steady_cardio',
    labelKey: 'steadyCardio',
    helpKey: 'steadyCardio',
    icon: '🏃',
    params: { durationMinutes: 30 },
    group: 'sport-training',
  },
  {
    type: 'intermittent_exercise',
    labelKey: 'intermittentExercise',
    helpKey: 'intermittentExercise',
    icon: '🏋️',
    params: { rounds: 5 },
    group: 'sport-training',
  },
  {
    type: 'strength_training',
    labelKey: 'strengthTraining',
    helpKey: 'strengthTraining',
    icon: '💪',
    params: { setMinutes: 1, restMinutes: 2 },
    group: 'sport-training',
  },
  // === 状态与摄入 (state-intake) ===
  {
    type: 'prolonged_sedentary',
    labelKey: 'prolongedSedentary',
    helpKey: 'prolongedSedentary',
    icon: '🪑',
    params: { durationMinutes: 120 },
    group: 'state-intake',
  },
  {
    type: 'anxiety_episode',
    labelKey: 'anxietyEpisode',
    helpKey: 'anxietyEpisode',
    icon: '😰',
    params: { trigger: 'work' },
    group: 'state-intake',
  },
  {
    type: 'caffeine_intake',
    labelKey: 'caffeineIntake',
    helpKey: 'caffeineIntake',
    icon: '☕',
    params: { dose: 'moderate', context: 'unknown' },
    group: 'state-intake',
  },
  {
    type: 'alcohol_intake',
    labelKey: 'alcoholIntake',
    helpKey: 'alcoholIntake',
    icon: '🍺',
    params: { amount: 'moderate' },
    group: 'state-intake',
  },
];

/**
 * 按组分类的片段配置（基于 TIMELINE_SEGMENTS 派生，不重复数据）。
 *
 * 每个组的片段列表与 TIMELINE_SEGMENTS 中相应组的顺序一致。
 */
export const TIMELINE_SEGMENTS_BY_GROUP: Readonly<
  Record<TimelineSegmentGroup, readonly TimelineSegmentConfig[]>
> = TIMELINE_SEGMENT_GROUPS.reduce(
  (acc, group) => {
    acc[group] = TIMELINE_SEGMENTS.filter((s) => s.group === group);
    return acc;
  },
  {} as Record<TimelineSegmentGroup, readonly TimelineSegmentConfig[]>,
);

/**
 * 已识别事件的展示映射（包括 micro_* 与 possible_*）。
 *
 * 用于时间轴 hover 等场景下渲染事件图标和翻译键。
 */
export const EVENT_TYPE_DISPLAY: Readonly<Record<string, EventDisplayConfig>> = {
  // 基础 13 个 segment 类型
  meal_intake: { icon: '🍽️', labelKey: 'mealIntake' },
  steady_cardio: { icon: '🏃', labelKey: 'steadyCardio' },
  prolonged_sedentary: { icon: '🪑', labelKey: 'prolongedSedentary' },
  intermittent_exercise: { icon: '🏋️', labelKey: 'intermittentExercise' },
  walk: { icon: '🚶', labelKey: 'walk' },
  sleep: { icon: '😴', labelKey: 'sleep' },
  nap: { icon: '💤', labelKey: 'nap' },
  deep_focus: { icon: '🧠', labelKey: 'deepFocus' },
  anxiety_episode: { icon: '😰', labelKey: 'anxietyEpisode' },
  alcohol_intake: { icon: '🍺', labelKey: 'alcoholIntake' },
  caffeine_intake: { icon: '☕', labelKey: 'caffeineIntake' },
  relaxation: { icon: '📖', labelKey: 'relaxation' },
  strength_training: { icon: '💪', labelKey: 'strengthTraining' },
  // 概率事件变体
  possible_alcohol_intake: { icon: '🍺', labelKey: 'alcoholIntake' },
  possible_caffeine_intake: { icon: '☕', labelKey: 'caffeineIntake' },
  // Micro events
  micro_deep_breathing: { icon: '🫁', labelKey: 'microDeepBreathing' },
  micro_short_walk: { icon: '🚶', labelKey: 'microShortWalk' },
  micro_post_meal_walk: { icon: '🍽️', labelKey: 'microPostMealWalk' },
  micro_post_workout_slow_walk: { icon: '🏃', labelKey: 'microPostWorkoutSlowWalk' },
  micro_standing_stretch: { icon: '🧘', labelKey: 'microStandingStretch' },
  micro_desk_mobility: { icon: '🪑', labelKey: 'microDeskMobility' },
  micro_offscreen_eye_rest: { icon: '👁️', labelKey: 'microOffscreenEyeRest' },
  micro_window_gaze_walk: { icon: '🪟', labelKey: 'microWindowGazeWalk' },
  micro_pre_workout_snack: { icon: '🍌', labelKey: 'microPreWorkoutSnack' },
  micro_post_workout_snack: { icon: '🥜', labelKey: 'microPostWorkoutSnack' },
  micro_easy_cardio: { icon: '❤️', labelKey: 'microEasyCardio' },
  micro_restorative_stretch: { icon: '🧘', labelKey: 'microRestorativeStretch' },
  micro_low_stimulus_work: { icon: '🧠', labelKey: 'microLowStimulusWork' },
  micro_sleep_wind_down: { icon: '😴', labelKey: 'microSleepWindDown' },
  // === R1 ===
  micro_box_breathing: { icon: '🫁', labelKey: 'microBoxBreathing' },
  micro_calming_breathing: { icon: '💨', labelKey: 'microCalmingBreathing' },
  micro_hydration_walk: { icon: '💧', labelKey: 'microHydrationWalk' },
  micro_warm_shower: { icon: '🚿', labelKey: 'microWarmShower' },
  micro_posture_correction: { icon: '🪑', labelKey: 'microPostureCorrection' },
  micro_neuro_warmup: { icon: '⚡', labelKey: 'microNeuroWarmup' },
  // === R2 ===
  micro_recovery_meal: { icon: '🍲', labelKey: 'microRecoveryMeal' },
  micro_power_nap: { icon: '💤', labelKey: 'microPowerNap' },
  micro_screen_dimming: { icon: '🌙', labelKey: 'microScreenDimming' },
  micro_cool_shower: { icon: '🚿', labelKey: 'microCoolShower' },
  micro_outdoor_breather: { icon: '🌲', labelKey: 'microOutdoorBreather' },
  micro_stair_climb: { icon: '🪜', labelKey: 'microStairClimb' },
  // === R3 ===
  micro_standing_work: { icon: '🧍', labelKey: 'microStandingWork' },
  micro_foam_rolling: { icon: '🧹', labelKey: 'microFoamRolling' },
  micro_cold_face_dip: { icon: '🧊', labelKey: 'microColdFaceDip' },
  micro_mindfulness_meditation: { icon: '🧘', labelKey: 'microMindfulnessMeditation' },
  micro_muscle_relaxation: { icon: '💆', labelKey: 'microMuscleRelaxation' },
  micro_light_meal: { icon: '🥗', labelKey: 'microLightMeal' },
};

/**
 * 概率事件 segmentType 集合。
 *
 * 这些片段在注入时间轴时不会直接产生对应 segment，
 * 而是先注入一个 possible_* 事件，再由 active sensing 流程处理。
 */
export const PROBABILISTIC_SEGMENT_TYPES: ReadonlySet<string> = new Set([
  'alcohol_intake',
  'caffeine_intake',
]);

/**
 * segmentType → eventType 映射（用于概率事件注入）。
 *
 * 仅对 PROBABILISTIC_SEGMENT_TYPES 中的 segmentType 有定义。
 */
export const PROBABILISTIC_EVENT_TYPE_MAP: Readonly<Record<string, string>> = {
  alcohol_intake: 'possible_alcohol_intake',
  caffeine_intake: 'possible_caffeine_intake',
};
