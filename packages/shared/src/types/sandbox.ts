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

export interface DailyRecord {
  date: string;
  hr?: number[];
  sleep?: SleepData;
  activity?: ActivityData;
  spo2?: number;
  stress?: StressData;
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
