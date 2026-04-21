import { z } from 'zod';

export const BaselineMetricsSchema = z.object({
  restingHr: z.number().min(30).max(200),
  hrv: z.number().min(0).max(200),
  spo2: z.number().min(80).max(100),
  avgSleepMinutes: z.number().min(0).max(1440),
  avgSteps: z.number().min(0).max(100000),
});

export const SandboxProfileSchema = z.object({
  profileId: z.string().min(1),
  name: z.string().min(1),
  age: z.number().int().min(1).max(150),
  gender: z.enum(['male', 'female']),
  avatar: z.string().min(1),
  tags: z.array(z.string().min(1)).min(1),
  baseline: BaselineMetricsSchema,
});

export const SleepStagesSchema = z.object({
  deep: z.number().min(0),
  light: z.number().min(0),
  rem: z.number().min(0),
  awake: z.number().min(0),
});

export const SleepDataSchema = z.object({
  totalMinutes: z.number().min(0).max(1440),
  startTime: z.string(),
  endTime: z.string(),
  stages: SleepStagesSchema,
  score: z.number().min(0).max(100),
});

export const ActivityDataSchema = z.object({
  steps: z.number().min(0),
  calories: z.number().min(0),
  activeMinutes: z.number().min(0),
  distanceKm: z.number().min(0),
});

export const StressDataSchema = z.object({
  load: z.number().min(0).max(100),
});

export const SleepStageTypeSchema = z.enum(['awake', 'light', 'deep', 'rem']);

export const SensorSampleSchema = z.object({
  timestamp: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
  heartRate: z.number().min(30).max(220).optional(),
  spo2: z.number().min(80).max(100).optional(),
  stressLoad: z.number().min(0).max(100).optional(),
  stepsDelta: z.number().min(0).optional(),
  caloriesDelta: z.number().min(0).optional(),
  activeMinutesDelta: z.number().min(0).optional(),
  distanceKmDelta: z.number().min(0).optional(),
  sleepStage: SleepStageTypeSchema.optional(),
});

export const DeviceSyncSessionSchema = z.object({
  syncId: z.string().min(1),
  connectedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
  disconnectedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
  uploadedRange: z.object({
    start: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
    end: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
  }),
});

export const DeviceConnectionSchema = z.object({
  samplingIntervalMinutes: z.number().int().min(1).max(60),
  syncSessions: z.array(DeviceSyncSessionSchema),
});

export const DailyRecordSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hr: z.array(z.number().min(30).max(220)).optional(),
  sleep: SleepDataSchema.optional(),
  activity: ActivityDataSchema.optional(),
  spo2: z.number().min(80).max(100).optional(),
  stress: StressDataSchema.optional(),
});

export const ProfileDataSchema = z.object({
  profile: SandboxProfileSchema,
  records: z.array(DailyRecordSchema),
  device: DeviceConnectionSchema.optional(),
});
