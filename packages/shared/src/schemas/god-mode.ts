import { z } from 'zod';

export const ProfileSwitchPayloadSchema = z.object({ profileId: z.string().min(1) });

export const EventInjectPayloadSchema = z.object({
  eventType: z.string().min(1),
  data: z.record(z.unknown()),
  timestamp: z.string().optional(),
});

export const MetricOverridePayloadSchema = z.object({
  metric: z.string().min(1),
  value: z.unknown(),
  dateRange: z.object({
    start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }).optional(),
});

export const ResetPayloadSchema = z.object({ scope: z.enum(['profile', 'events', 'overrides', 'all']) });

export const ScenarioPayloadSchema = z.object({
  scenarioId: z.string().min(1),
  params: z.record(z.unknown()).optional(),
});
