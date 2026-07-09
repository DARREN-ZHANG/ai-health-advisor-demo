import { z } from 'zod';
import { ActivitySegmentTypeSchema } from './sandbox';
import { MicroEventParamsSchema, MicroEventTypeSchema } from './micro-event';

// ============================================================
// God Mode 时间轴动作 Schema（新增）
// ============================================================

export const TimelineAppendPayloadSchema = z.object({
  segmentType: ActivitySegmentTypeSchema,
  replaceSegmentId: z.string().min(1).optional(),
  timeOfDay: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  durationMinutes: z.number().int().positive().optional(),
  offsetMinutes: z.number().int().min(0).optional(),
  params: z.record(z.union([z.number(), z.string(), z.boolean()])).optional(),
  advanceClock: z.boolean().optional(),
});

export const SyncTriggerPayloadSchema = z.object({
  trigger: z.enum(['app_open', 'manual_refresh']),
});

export const AdvanceClockPayloadSchema = z.object({
  minutes: z.number().int().positive(),
});

export const ResetProfileTimelinePayloadSchema = z.object({
  profileId: z.string().min(1),
});

export const MicroEventAppendPayloadSchema = z.object({
  microEventType: MicroEventTypeSchema,
  timeOfDay: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  durationMinutes: z.number().int().positive().optional(),
  params: MicroEventParamsSchema.optional(),
  advanceClock: z.boolean().optional(),
});

// ============================================================
// God Mode 已有动作 Schema
// ============================================================

export const ProfileSwitchPayloadSchema = z.object({ profileId: z.string().min(1) });

export const EventInjectPayloadSchema = z.object({
  eventType: z.string().min(1),
  data: z.record(z.unknown()),
  timestamp: z.string().optional(),
});

export const MetricOverridePayloadSchema = z.object({
  metric: z.string().min(1),
  value: z.unknown(),
  dateRange: z
    .object({
      start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    })
    .optional(),
});

export const ResetPayloadSchema = z.object({
  scope: z.enum(['profile', 'events', 'overrides', 'all']),
});
