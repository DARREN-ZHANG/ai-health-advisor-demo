import { z } from 'zod';

// 时间戳格式：YYYY-MM-DDTHH:mm
const timestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

// ============================================================
// 时间轴与原始流相关 Schema
// ============================================================

export const ActivitySegmentTypeSchema = z.enum([
  'meal_intake',
  'steady_cardio',
  'prolonged_sedentary',
  'intermittent_exercise',
  'walk',
  'sleep',
]);

export const DemoClockSchema = z.object({
  profileId: z.string().min(1),
  timezone: z.string().min(1),
  currentTime: z.string().regex(timestampPattern),
});

export const ActivitySegmentSchema = z.object({
  segmentId: z.string().min(1),
  profileId: z.string().min(1),
  type: ActivitySegmentTypeSchema,
  start: z.string().regex(timestampPattern),
  end: z.string().regex(timestampPattern),
  params: z.record(z.union([z.number(), z.string(), z.boolean()])).optional(),
  source: z.enum(['baseline_script', 'god_mode']),
  scenarioId: z.string().min(1).optional(),
});

export const DeviceMetricSchema = z.enum([
  'heartRate',
  'steps',
  'spo2',
  'motion',
  'sleepStage',
  'wearState',
]);

export const DeviceEventSchema = z.object({
  eventId: z.string().min(1),
  profileId: z.string().min(1),
  measuredAt: z.string().regex(timestampPattern),
  metric: DeviceMetricSchema,
  value: z.union([z.number(), z.string(), z.boolean()]),
  source: z.literal('sensor'),
  segmentId: z.string().min(1).optional(),
});

export const DeviceBufferStateSchema = z.object({
  profileId: z.string().min(1),
  lastSyncedMeasuredAt: z.string().regex(timestampPattern).nullable(),
});

export const SyncSessionSchema = z.object({
  syncId: z.string().min(1),
  profileId: z.string().min(1),
  trigger: z.enum(['app_open', 'manual_refresh']),
  startedAt: z.string().regex(timestampPattern),
  finishedAt: z.string().regex(timestampPattern),
  uploadedMeasuredRange: z
    .object({
      start: z.string().regex(timestampPattern),
      end: z.string().regex(timestampPattern),
    })
    .nullable(),
  uploadedEventCount: z.number().int().min(0),
});

export const RecognizedEventTypeSchema = ActivitySegmentTypeSchema;

export const RecognizedEventSchema = z.object({
  recognizedEventId: z.string().min(1),
  profileId: z.string().min(1),
  type: RecognizedEventTypeSchema,
  start: z.string().regex(timestampPattern),
  end: z.string().regex(timestampPattern),
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string().min(1)),
  sourceSegmentId: z.string().min(1).optional(),
});

export const DerivedTemporalStateTypeSchema = z.literal('recent_meal_30m');

export const DerivedTemporalStateSchema = z.object({
  type: DerivedTemporalStateTypeSchema,
  profileId: z.string().min(1),
  sourceRecognizedEventId: z.string().min(1),
  activeAt: z.string().regex(timestampPattern),
  metadata: z.record(z.unknown()).optional(),
});

// ============================================================
// 沙箱基础 Schema（已有）
// ============================================================

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

export const IntradaySnapshotSchema = z.object({
  hour: z.number().int().min(0).max(23),
  hr: z.number().min(30).max(220).optional(),
  spo2: z.number().min(80).max(100).optional(),
  steps: z.number().min(0).optional(),
  sleepMinutes: z.number().min(0).max(120).optional(),
  stressLoad: z.number().min(0).max(100).optional(),
});

export const DailyRecordSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hr: z.array(z.number().min(30).max(220)).optional(),
  sleep: SleepDataSchema.optional(),
  activity: ActivityDataSchema.optional(),
  spo2: z.number().min(80).max(100).optional(),
  stress: StressDataSchema.optional(),
  intraday: z.array(IntradaySnapshotSchema).optional(),
});

export const ProfileDataSchema = z.object({
  profile: SandboxProfileSchema,
  records: z.array(DailyRecordSchema),
  device: DeviceConnectionSchema.optional(),
});
