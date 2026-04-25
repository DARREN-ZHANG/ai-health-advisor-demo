// ============================================================
// 时间轴与原始流相关类型
// ============================================================

/** 活动片段类型 */
export type ActivitySegmentType =
  | 'meal_intake'
  | 'steady_cardio'
  | 'prolonged_sedentary'
  | 'intermittent_exercise'
  | 'walk'
  | 'sleep'
  | 'deep_focus'
  | 'anxiety_episode'
  | 'breathing_pause'
  | 'alcohol_intake'
  | 'nightmare'
  | 'relaxation';

/** profile 当前演示时刻 */
export interface DemoClock {
  profileId: string;
  timezone: string;
  /** YYYY-MM-DDTHH:mm */
  currentTime: string;
}

/** 可识别活动片段 */
export interface ActivitySegment {
  segmentId: string;
  profileId: string;
  type: ActivitySegmentType;
  /** YYYY-MM-DDTHH:mm */
  start: string;
  /** YYYY-MM-DDTHH:mm */
  end: string;
  params?: Record<string, number | string | boolean>;
  source: 'baseline_script' | 'god_mode';
  scenarioId?: string;
}

/** 设备指标类型 */
export type DeviceMetric =
  | 'heartRate'
  | 'steps'
  | 'spo2'
  | 'motion'
  | 'sleepStage'
  | 'wearState';

/** 设备原始事件 */
export interface DeviceEvent {
  eventId: string;
  profileId: string;
  /** YYYY-MM-DDTHH:mm */
  measuredAt: string;
  metric: DeviceMetric;
  value: number | string | boolean;
  source: 'sensor';
  segmentId?: string;
}

/** 设备缓存边界 */
export interface DeviceBufferState {
  profileId: string;
  lastSyncedMeasuredAt: string | null;
}

/** 同步会话 */
export interface SyncSession {
  syncId: string;
  profileId: string;
  trigger: 'app_open' | 'manual_refresh';
  /** YYYY-MM-DDTHH:mm */
  startedAt: string;
  /** YYYY-MM-DDTHH:mm */
  finishedAt: string;
  uploadedMeasuredRange: { start: string; end: string } | null;
  uploadedEventCount: number;
}

/** 已识别事件类型 — 与 ActivitySegmentType 值相同 */
export type RecognizedEventType = ActivitySegmentType;

/** 已识别事件 */
export interface RecognizedEvent {
  recognizedEventId: string;
  profileId: string;
  type: RecognizedEventType;
  /** YYYY-MM-DDTHH:mm */
  start: string;
  /** YYYY-MM-DDTHH:mm */
  end: string;
  confidence: number;
  evidence: string[];
  sourceSegmentId?: string;
}

/** 派生状态类型 */
export type DerivedTemporalStateType = 'recent_meal_30m';

/** 派生状态 */
export interface DerivedTemporalState {
  type: DerivedTemporalStateType;
  profileId: string;
  sourceRecognizedEventId: string;
  /** YYYY-MM-DDTHH:mm */
  activeAt: string;
  metadata?: Record<string, unknown>;
}

// ============================================================
// 沙箱基础类型（已有）
// ============================================================

export interface BaselineMetrics {
  restingHr: number;
  hrv: number;
  spo2: number;
  avgSleepMinutes: number;
  avgSteps: number;
}

export interface SandboxProfile {
  profileId: string;
  name: string;
  age: number;
  gender: 'male' | 'female';
  avatar: string;
  tags: string[];
  baseline: BaselineMetrics;
  weeklyBaseline?: Partial<BaselineMetrics>;
  dailyBaseline?: Partial<BaselineMetrics>;
}

export interface SleepStages {
  deep: number;
  light: number;
  rem: number;
  awake: number;
}

export interface SleepData {
  totalMinutes: number;
  startTime: string;
  endTime: string;
  stages: SleepStages;
  score: number;
}

export interface ActivityData {
  steps: number;
  calories: number;
  activeMinutes: number;
  distanceKm: number;
}

export interface StressData {
  load: number;
}

export type SleepStageType = 'awake' | 'light' | 'deep' | 'rem';

/** 纯物理运动模式，与场景推断解耦 */
export type MotionPattern =
  // ── 静止 ──
  | 'still_supine'
  | 'still_upright'
  | 'still_with_micro'
  // ── 周期性 ──
  | 'periodic_stroll'
  | 'periodic_walk'
  | 'periodic_brisk'
  | 'periodic_run'
  | 'periodic_arm_repeat'
  // ── 间歇性 ──
  | 'intermittent_reach'
  | 'intermittent_gesture'
  | 'intermittent_burst'
  // ── 不规则 ──
  | 'irregular_fidget'
  | 'irregular_restless'
  | 'irregular_sudden';

/** 单次 IMU 采样点（每分钟 5 个，每 12s 一个） */
export interface ImuSample {
  /** 相对分钟起始的偏移毫秒数：0, 12000, 24000, 36000, 48000 */
  offsetMs: number;
  /** 加速度 X 轴（g），设备坐标系 */
  accX: number;
  /** 加速度 Y 轴（g），设备坐标系 */
  accY: number;
  /** 加速度 Z 轴（g），设备坐标系，包含重力 ~1g */
  accZ: number;
  /** 陀螺仪 X 轴（rad/s） */
  gyroX: number;
  /** 陀螺仪 Y 轴（rad/s） */
  gyroY: number;
  /** 陀螺仪 Z 轴（rad/s） */
  gyroZ: number;
}

export interface SensorSample {
  timestamp: string;
  heartRate?: number;
  spo2?: number;
  stressLoad?: number;
  stepsDelta?: number;
  caloriesDelta?: number;
  activeMinutesDelta?: number;
  distanceKmDelta?: number;
  sleepStage?: SleepStageType;
  imuSamples?: ImuSample[];
}

export interface DeviceSyncSession {
  syncId: string;
  connectedAt: string;
  disconnectedAt: string;
  uploadedRange: {
    start: string;
    end: string;
  };
}

export interface DeviceConnection {
  samplingIntervalMinutes: number;
  syncSessions: DeviceSyncSession[];
}

export interface IntradaySnapshot {
  hour: number;
  hr?: number;
  spo2?: number;
  steps?: number;
  sleepMinutes?: number;
  stressLoad?: number;
}

export interface DailyRecord {
  date: string;
  hr?: number[];
  hrv?: number;
  sleep?: SleepData;
  activity?: ActivityData;
  spo2?: number;
  stress?: StressData;
  intraday?: IntradaySnapshot[];
}

export interface VitalSignsData {
  restingHr: number;
  hrv: number;
  spo2: number;
  stressLoad: number;
}

export interface ProfileData {
  profile: SandboxProfile;
  records: DailyRecord[];
  device?: DeviceConnection;
}
