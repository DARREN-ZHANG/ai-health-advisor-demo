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
}
