import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { SandboxProfileSchema, DailyRecordSchema } from '../schemas/sandbox';
import { ChartTokenIdSchema, isValidChartTokenId } from '../schemas/chart-token';
import {
  AgentResponseEnvelopeSchema,
  AgentTaskTypeSchema,
  DataTabSchema,
  TimeframeSchema,
  PageContextSchema,
} from '../schemas/agent';
import { ErrorCodeSchema, ApiResponseSchema } from '../schemas/api';
import {
  ProfileSwitchPayloadSchema,
  EventInjectPayloadSchema,
  MetricOverridePayloadSchema,
  ResetPayloadSchema,
  TimelineAppendPayloadSchema,
  SyncTriggerPayloadSchema,
  AdvanceClockPayloadSchema,
  ResetProfileTimelinePayloadSchema,
} from '../schemas/god-mode';
import {
  ActivitySegmentTypeSchema,
  DemoClockSchema,
  ActivitySegmentSchema,
  DeviceMetricSchema,
  DeviceEventSchema,
  DeviceBufferStateSchema,
  SyncSessionSchema,
  RecognizedEventTypeSchema,
  RecognizedEventSchema,
  DerivedTemporalStateTypeSchema,
  DerivedTemporalStateSchema,
} from '../schemas/sandbox';
import {
  StressTimelinePointSchema,
  StressTrendSchema,
  StressSummaryStatsSchema,
  StressTimelineResponseSchema,
} from '../schemas/stress';
import { ErrorCode, createSuccessResponse, createErrorResponse } from '../types/api';
import { ChartTokenId } from '../types/chart-token';
import { AgentTaskType } from '../types/agent';

describe('SandboxProfileSchema', () => {
  const validProfile = {
    profileId: 'profile-a',
    name: '张健康',
    age: 32,
    gender: 'male' as const,
    avatar: '👨‍💻',
    tags: ['恢复稳定', '睡眠质量优'],
    baseline: { restingHr: 62, hrv: 58, spo2: 98, avgSleepMinutes: 420, avgSteps: 8500 },
  };

  it('accepts valid profile', () => {
    expect(SandboxProfileSchema.parse(validProfile)).toEqual(validProfile);
  });

  it('rejects missing required fields', () => {
    expect(() => SandboxProfileSchema.parse({})).toThrow();
  });

  it('rejects invalid gender', () => {
    expect(() => SandboxProfileSchema.parse({ ...validProfile, gender: 'other' })).toThrow();
  });
});

describe('DailyRecordSchema', () => {
  it('accepts record with all optional fields', () => {
    const record = {
      date: '2026-04-03',
      hr: [62, 58, 65],
      sleep: {
        totalMinutes: 420,
        startTime: '23:00',
        endTime: '06:00',
        stages: { deep: 90, light: 180, rem: 120, awake: 30 },
        score: 85,
      },
      activity: { steps: 8500, calories: 2200, activeMinutes: 45, distanceKm: 6.2 },
      spo2: 98,
      stress: { load: 35 },
    };
    expect(DailyRecordSchema.parse(record)).toEqual(record);
  });

  it('accepts record with only date', () => {
    expect(DailyRecordSchema.parse({ date: '2026-04-03' })).toEqual({ date: '2026-04-03' });
  });

  it('rejects invalid date format', () => {
    expect(() => DailyRecordSchema.parse({ date: '04-03-2026' })).toThrow();
  });
});

describe('ChartTokenIdSchema', () => {
  it('accepts valid token IDs', () => {
    Object.values(ChartTokenId).forEach((id) => {
      expect(ChartTokenIdSchema.parse(id)).toBe(id);
    });
  });

  it('rejects invalid token ID', () => {
    expect(() => ChartTokenIdSchema.parse('INVALID_TOKEN')).toThrow();
  });
});

describe('isValidChartTokenId', () => {
  it('returns true for valid tokens', () => {
    expect(isValidChartTokenId('HRV_7DAYS')).toBe(true);
  });

  it('returns false for invalid tokens', () => {
    expect(isValidChartTokenId('NOT_REAL')).toBe(false);
  });
});

describe('ApiResponseSchema', () => {
  it('validates success response', () => {
    const schema = ApiResponseSchema(z.string());
    const response = {
      success: true,
      data: 'hello',
      error: null,
      meta: { timestamp: '2026-04-10T00:00:00Z', requestId: 'req-1', durationMs: 100 },
    };
    expect(schema.parse(response)).toEqual(response);
  });

  it('validates error response', () => {
    const schema = ApiResponseSchema(z.string());
    const response = {
      success: false,
      data: null,
      error: { code: ErrorCode.NOT_FOUND, message: 'Not found' },
      meta: { timestamp: '2026-04-10T00:00:00Z', requestId: 'req-2', durationMs: 50 },
    };
    expect(schema.parse(response)).toEqual(response);
  });
});

describe('createSuccessResponse', () => {
  it('creates a success response with data', () => {
    const meta = { timestamp: '2026-04-10T00:00:00Z', requestId: 'req-1', durationMs: 10 };
    const result = createSuccessResponse('hello', meta);
    expect(result).toEqual({ success: true, data: 'hello', error: null, meta });
  });
});

describe('createErrorResponse', () => {
  it('creates an error response', () => {
    const meta = { timestamp: '2026-04-10T00:00:00Z', requestId: 'req-2', durationMs: 5 };
    const result = createErrorResponse(ErrorCode.VALIDATION_ERROR, 'Invalid input', meta);
    expect(result).toEqual({
      success: false,
      data: null,
      error: { code: ErrorCode.VALIDATION_ERROR, message: 'Invalid input' },
      meta,
    });
  });
});

describe('AgentTaskTypeSchema', () => {
  it('accepts valid task types', () => {
    Object.values(AgentTaskType).forEach((t) => {
      expect(AgentTaskTypeSchema.parse(t)).toBe(t);
    });
  });

  it('rejects invalid task type', () => {
    expect(() => AgentTaskTypeSchema.parse('invalid')).toThrow();
  });
});

describe('DataTabSchema', () => {
  it('accepts valid tabs', () => {
    ['hrv', 'sleep', 'resting-hr', 'activity', 'spo2', 'stress'].forEach((tab) => {
      expect(DataTabSchema.parse(tab)).toBe(tab);
    });
  });

  it('rejects invalid tab', () => {
    expect(() => DataTabSchema.parse('invalid')).toThrow();
  });
});

describe('TimeframeSchema', () => {
  it('accepts valid timeframes including custom', () => {
    ['day', 'week', 'month', 'year', 'custom'].forEach((tf) => {
      expect(TimeframeSchema.parse(tf)).toBe(tf);
    });
  });

  it('rejects invalid timeframe', () => {
    expect(() => TimeframeSchema.parse('decade')).toThrow();
  });
});

describe('PageContextSchema', () => {
  it('accepts valid context with dataTab', () => {
    const ctx = {
      profileId: 'profile-a',
      page: 'dashboard',
      dataTab: 'hrv',
      timeframe: 'week',
    };
    expect(PageContextSchema.parse(ctx)).toEqual(ctx);
  });

  it('accepts valid context without dataTab', () => {
    const ctx = { profileId: 'profile-a', page: 'dashboard', timeframe: 'day' };
    expect(PageContextSchema.parse(ctx)).toEqual(ctx);
  });

  it('rejects missing required fields', () => {
    expect(() => PageContextSchema.parse({})).toThrow();
  });

  it('accepts custom timeframe with customDateRange', () => {
    const ctx = {
      profileId: 'profile-a',
      page: 'data-center',
      timeframe: 'custom',
      customDateRange: { start: '2026-03-01', end: '2026-03-15' },
    };
    expect(PageContextSchema.parse(ctx)).toEqual(ctx);
  });

  it('rejects invalid customDateRange format', () => {
    const ctx = {
      profileId: 'profile-a',
      page: 'data-center',
      timeframe: 'custom',
      customDateRange: { start: 'not-a-date', end: '2026-03-15' },
    };
    expect(() => PageContextSchema.parse(ctx)).toThrow();
  });

  it('rejects custom timeframe without customDateRange', () => {
    const ctx = { profileId: 'profile-a', page: 'data-center', timeframe: 'custom' };
    const result = PageContextSchema.safeParse(ctx);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('customDateRange is required');
    }
  });
});

describe('AgentResponseEnvelopeSchema', () => {
  it('accepts valid envelope', () => {
    const envelope = {
      summary: '健康状态良好',
      source: 'llm',
      statusColor: 'good' as const,
      chartTokens: [ChartTokenId.HRV_7DAYS],
      microTips: ['保持规律作息'],
      meta: {
        taskType: AgentTaskType.HOMEPAGE_SUMMARY,
        pageContext: { profileId: 'p1', page: 'home', timeframe: 'week' },
        finishReason: 'complete',
      },
    };
    expect(AgentResponseEnvelopeSchema.parse(envelope)).toEqual(envelope);
  });

  it('rejects missing summary', () => {
    const envelope = {
      chartTokens: [],
      microTips: [],
      meta: {
        taskType: AgentTaskType.HOMEPAGE_SUMMARY,
        pageContext: { profileId: 'p1', page: 'home', timeframe: 'week' },
        finishReason: 'complete',
      },
    };
    expect(() => AgentResponseEnvelopeSchema.parse(envelope)).toThrow();
  });
});

describe('GodMode Schemas', () => {
  it('ProfileSwitchPayloadSchema accepts valid payload', () => {
    const payload = { profileId: 'profile-a' };
    expect(ProfileSwitchPayloadSchema.parse(payload)).toEqual(payload);
  });

  it('ProfileSwitchPayloadSchema rejects empty profileId', () => {
    expect(() => ProfileSwitchPayloadSchema.parse({ profileId: '' })).toThrow();
  });

  it('EventInjectPayloadSchema accepts valid payload', () => {
    const payload = { eventType: 'alarm', data: { key: 'val' } };
    expect(EventInjectPayloadSchema.parse(payload)).toEqual(payload);
  });

  it('EventInjectPayloadSchema accepts optional timestamp', () => {
    const payload = { eventType: 'alarm', data: {}, timestamp: '2026-04-10T00:00:00Z' };
    expect(EventInjectPayloadSchema.parse(payload)).toEqual(payload);
  });

  it('MetricOverridePayloadSchema accepts valid payload', () => {
    const payload = { metric: 'hrv', value: 60 };
    expect(MetricOverridePayloadSchema.parse(payload)).toEqual(payload);
  });

  it('MetricOverridePayloadSchema accepts optional dateRange', () => {
    const payload = {
      metric: 'hrv',
      value: 60,
      dateRange: { start: '2026-04-01', end: '2026-04-10' },
    };
    expect(MetricOverridePayloadSchema.parse(payload)).toEqual(payload);
  });

  it('ResetPayloadSchema accepts valid scopes', () => {
    ['profile', 'events', 'overrides', 'all'].forEach((scope) => {
      expect(ResetPayloadSchema.parse({ scope })).toEqual({ scope });
    });
  });

  it('ResetPayloadSchema rejects invalid scope', () => {
    expect(() => ResetPayloadSchema.parse({ scope: 'invalid' })).toThrow();
  });

});

describe('Stress Schemas', () => {
  const validPoint = {
    date: '2026-04-10',
    stressLoadScore: 45,
    contributors: { hrv: 30, sleep: 40, activity: 50 },
  };

  it('StressTimelinePointSchema accepts valid point', () => {
    expect(StressTimelinePointSchema.parse(validPoint)).toEqual(validPoint);
  });

  it('StressTimelinePointSchema rejects score out of range', () => {
    expect(() =>
      StressTimelinePointSchema.parse({ ...validPoint, stressLoadScore: 150 }),
    ).toThrow();
  });

  it('StressTrendSchema accepts valid trends', () => {
    ['improving', 'stable', 'declining'].forEach((trend) => {
      expect(StressTrendSchema.parse(trend)).toBe(trend);
    });
  });

  it('StressTrendSchema rejects invalid trend', () => {
    expect(() => StressTrendSchema.parse('unknown')).toThrow();
  });

  it('StressSummaryStatsSchema accepts valid stats', () => {
    const stats = { average: 40, max: 80, min: 10, trend: 'stable' as const };
    expect(StressSummaryStatsSchema.parse(stats)).toEqual(stats);
  });

  it('StressTimelineResponseSchema accepts valid response', () => {
    const response = {
      points: [validPoint],
      summary: { average: 45, max: 45, min: 45, trend: 'stable' as const },
    };
    expect(StressTimelineResponseSchema.parse(response)).toEqual(response);
  });
});

describe('ErrorCodeSchema', () => {
  it('accepts all valid error codes', () => {
    Object.values(ErrorCode).forEach((code) => {
      expect(ErrorCodeSchema.parse(code)).toBe(code);
    });
  });

  it('rejects invalid error code', () => {
    expect(() => ErrorCodeSchema.parse('INVALID')).toThrow();
  });
});

// ============================================================
// 时间轴与原始流 Schema 测试
// ============================================================

describe('ActivitySegmentTypeSchema', () => {
  it('accepts all valid segment types', () => {
    const types = ['meal_intake', 'steady_cardio', 'prolonged_sedentary', 'intermittent_exercise', 'walk', 'sleep'];
    types.forEach((t) => {
      expect(ActivitySegmentTypeSchema.parse(t)).toBe(t);
    });
  });

  it('rejects invalid segment type', () => {
    expect(() => ActivitySegmentTypeSchema.parse('invalid')).toThrow();
  });
});

describe('DemoClockSchema', () => {
  const validClock = {
    profileId: 'profile-a',
    timezone: 'Asia/Shanghai',
    currentTime: '2026-04-21T09:30',
  };

  it('accepts valid demo clock', () => {
    expect(DemoClockSchema.parse(validClock)).toEqual(validClock);
  });

  it('rejects invalid currentTime format', () => {
    expect(() => DemoClockSchema.parse({ ...validClock, currentTime: '2026-04-21 09:30' })).toThrow();
  });

  it('rejects missing required fields', () => {
    expect(() => DemoClockSchema.parse({})).toThrow();
  });
});

describe('ActivitySegmentSchema', () => {
  const validSegment = {
    segmentId: 'seg-1',
    profileId: 'profile-a',
    type: 'meal_intake' as const,
    start: '2026-04-21T07:00',
    end: '2026-04-21T07:30',
    source: 'baseline_script' as const,
  };

  it('accepts valid segment without optional fields', () => {
    expect(ActivitySegmentSchema.parse(validSegment)).toEqual(validSegment);
  });

  it('accepts valid segment with all optional fields', () => {
    const segment = {
      ...validSegment,
      params: { calories: 500, label: '早餐' },
      scenarioId: 'scenario-1',
    };
    expect(ActivitySegmentSchema.parse(segment)).toEqual(segment);
  });

  it('accepts god_mode source', () => {
    expect(ActivitySegmentSchema.parse({ ...validSegment, source: 'god_mode' })).toEqual({
      ...validSegment,
      source: 'god_mode',
    });
  });

  it('rejects invalid source', () => {
    expect(() => ActivitySegmentSchema.parse({ ...validSegment, source: 'invalid' })).toThrow();
  });
});

describe('DeviceMetricSchema', () => {
  it('accepts all valid metrics', () => {
    const metrics = ['heartRate', 'steps', 'spo2', 'motion', 'sleepStage', 'wearState'];
    metrics.forEach((m) => {
      expect(DeviceMetricSchema.parse(m)).toBe(m);
    });
  });

  it('rejects invalid metric', () => {
    expect(() => DeviceMetricSchema.parse('invalid')).toThrow();
  });
});

describe('DeviceEventSchema', () => {
  const validEvent = {
    eventId: 'evt-1',
    profileId: 'profile-a',
    measuredAt: '2026-04-21T09:30',
    metric: 'heartRate' as const,
    value: 72,
    source: 'sensor' as const,
  };

  it('accepts valid event with numeric value', () => {
    expect(DeviceEventSchema.parse(validEvent)).toEqual(validEvent);
  });

  it('accepts valid event with string value', () => {
    const event = { ...validEvent, metric: 'sleepStage' as const, value: 'deep' };
    expect(DeviceEventSchema.parse(event)).toEqual(event);
  });

  it('accepts valid event with boolean value', () => {
    const event = { ...validEvent, metric: 'wearState' as const, value: true };
    expect(DeviceEventSchema.parse(event)).toEqual(event);
  });

  it('accepts valid event with optional segmentId', () => {
    const event = { ...validEvent, segmentId: 'seg-1' };
    expect(DeviceEventSchema.parse(event)).toEqual(event);
  });

  it('rejects non-sensor source', () => {
    expect(() => DeviceEventSchema.parse({ ...validEvent, source: 'manual' })).toThrow();
  });
});

describe('DeviceBufferStateSchema', () => {
  it('accepts state with lastSyncedMeasuredAt', () => {
    const state = { profileId: 'profile-a', lastSyncedMeasuredAt: '2026-04-21T09:30' };
    expect(DeviceBufferStateSchema.parse(state)).toEqual(state);
  });

  it('accepts state with null lastSyncedMeasuredAt', () => {
    const state = { profileId: 'profile-a', lastSyncedMeasuredAt: null };
    expect(DeviceBufferStateSchema.parse(state)).toEqual(state);
  });

  it('rejects missing required fields', () => {
    expect(() => DeviceBufferStateSchema.parse({})).toThrow();
  });
});

describe('SyncSessionSchema', () => {
  const validSession = {
    syncId: 'sync-1',
    profileId: 'profile-a',
    trigger: 'app_open' as const,
    startedAt: '2026-04-21T09:00',
    finishedAt: '2026-04-21T09:01',
    uploadedMeasuredRange: { start: '2026-04-21T08:00', end: '2026-04-21T09:00' },
    uploadedEventCount: 42,
  };

  it('accepts valid session with range', () => {
    expect(SyncSessionSchema.parse(validSession)).toEqual(validSession);
  });

  it('accepts valid session with null range', () => {
    const session = { ...validSession, uploadedMeasuredRange: null };
    expect(SyncSessionSchema.parse(session)).toEqual(session);
  });

  it('accepts manual_refresh trigger', () => {
    const session = { ...validSession, trigger: 'manual_refresh' as const };
    expect(SyncSessionSchema.parse(session)).toEqual(session);
  });

  it('rejects invalid trigger', () => {
    expect(() => SyncSessionSchema.parse({ ...validSession, trigger: 'auto' })).toThrow();
  });

  it('rejects negative uploadedEventCount', () => {
    expect(() => SyncSessionSchema.parse({ ...validSession, uploadedEventCount: -1 })).toThrow();
  });

  // 注意：schema 不校验 startedAt <= finishedAt 语义约束，业务层需自行处理
  it('schema 允许 startedAt 晚于 finishedAt（语义无效但 schema 通过）', () => {
    const session = { ...validSession, startedAt: '2026-04-21T10:00', finishedAt: '2026-04-21T09:00' };
    expect(() => SyncSessionSchema.parse(session)).not.toThrow();
  });
});

describe('RecognizedEventTypeSchema', () => {
  it('accepts same values as ActivitySegmentType', () => {
    const types = ['meal_intake', 'steady_cardio', 'prolonged_sedentary', 'intermittent_exercise', 'walk', 'sleep'];
    types.forEach((t) => {
      expect(RecognizedEventTypeSchema.parse(t)).toBe(t);
    });
  });
});

describe('RecognizedEventSchema', () => {
  const validEvent = {
    recognizedEventId: 're-1',
    profileId: 'profile-a',
    type: 'meal_intake' as const,
    start: '2026-04-21T07:00',
    end: '2026-04-21T07:30',
    confidence: 0.95,
    evidence: ['heart_rate_spike', 'motion_detected'],
  };

  it('accepts valid recognized event', () => {
    expect(RecognizedEventSchema.parse(validEvent)).toEqual(validEvent);
  });

  it('accepts valid event with optional sourceSegmentId', () => {
    const event = { ...validEvent, sourceSegmentId: 'seg-1' };
    expect(RecognizedEventSchema.parse(event)).toEqual(event);
  });

  it('rejects confidence > 1', () => {
    expect(() => RecognizedEventSchema.parse({ ...validEvent, confidence: 1.5 })).toThrow();
  });

  it('rejects confidence < 0', () => {
    expect(() => RecognizedEventSchema.parse({ ...validEvent, confidence: -0.1 })).toThrow();
  });

  it('rejects empty string in evidence array', () => {
    // evidence 数组中的元素必须是非空字符串，min(1) 约束
    const event = { ...validEvent, evidence: [''] };
    expect(() => RecognizedEventSchema.parse(event)).toThrow();
  });

  it('accepts confidence boundary value 1', () => {
    expect(RecognizedEventSchema.parse({ ...validEvent, confidence: 1 })).toEqual({
      ...validEvent,
      confidence: 1,
    });
  });
});

describe('DerivedTemporalStateTypeSchema', () => {
  it('accepts recent_meal_30m', () => {
    expect(DerivedTemporalStateTypeSchema.parse('recent_meal_30m')).toBe('recent_meal_30m');
  });

  it('rejects invalid type', () => {
    expect(() => DerivedTemporalStateTypeSchema.parse('invalid')).toThrow();
  });
});

describe('DerivedTemporalStateSchema', () => {
  const validState = {
    type: 'recent_meal_30m' as const,
    profileId: 'profile-a',
    sourceRecognizedEventId: 're-1',
    activeAt: '2026-04-21T07:30',
  };

  it('accepts valid state without metadata', () => {
    expect(DerivedTemporalStateSchema.parse(validState)).toEqual(validState);
  });

  it('accepts valid state with metadata', () => {
    const state = { ...validState, metadata: { mealCalories: 500 } };
    expect(DerivedTemporalStateSchema.parse(state)).toEqual(state);
  });

  it('rejects missing required fields', () => {
    expect(() => DerivedTemporalStateSchema.parse({})).toThrow();
  });
});

// ============================================================
// God Mode 时间轴动作 Schema 测试
// ============================================================

describe('TimelineAppendPayloadSchema', () => {
  it('accepts valid payload with only segmentType', () => {
    const payload = { segmentType: 'meal_intake' };
    expect(TimelineAppendPayloadSchema.parse(payload)).toEqual(payload);
  });

  it('accepts valid payload with all optional fields', () => {
    const payload = {
      segmentType: 'steady_cardio',
      offsetMinutes: 30,
      params: { duration: 45, intensity: 'medium' },
    };
    expect(TimelineAppendPayloadSchema.parse(payload)).toEqual(payload);
  });

  it('rejects invalid segmentType', () => {
    expect(() => TimelineAppendPayloadSchema.parse({ segmentType: 'invalid' })).toThrow();
  });

  it('rejects negative offsetMinutes', () => {
    expect(() =>
      TimelineAppendPayloadSchema.parse({ segmentType: 'walk', offsetMinutes: -5 }),
    ).toThrow();
  });
});

describe('SyncTriggerPayloadSchema', () => {
  it('accepts app_open trigger', () => {
    expect(SyncTriggerPayloadSchema.parse({ trigger: 'app_open' })).toEqual({ trigger: 'app_open' });
  });

  it('accepts manual_refresh trigger', () => {
    expect(SyncTriggerPayloadSchema.parse({ trigger: 'manual_refresh' })).toEqual({ trigger: 'manual_refresh' });
  });

  it('rejects invalid trigger', () => {
    expect(() => SyncTriggerPayloadSchema.parse({ trigger: 'auto' })).toThrow();
  });
});

describe('AdvanceClockPayloadSchema', () => {
  it('accepts positive minutes', () => {
    expect(AdvanceClockPayloadSchema.parse({ minutes: 30 })).toEqual({ minutes: 30 });
  });

  it('rejects zero minutes', () => {
    expect(() => AdvanceClockPayloadSchema.parse({ minutes: 0 })).toThrow();
  });

  it('rejects negative minutes', () => {
    expect(() => AdvanceClockPayloadSchema.parse({ minutes: -10 })).toThrow();
  });

  it('rejects non-integer minutes', () => {
    expect(() => AdvanceClockPayloadSchema.parse({ minutes: 1.5 })).toThrow();
  });
});

describe('ResetProfileTimelinePayloadSchema', () => {
  it('accepts valid profileId', () => {
    const payload = { profileId: 'profile-a' };
    expect(ResetProfileTimelinePayloadSchema.parse(payload)).toEqual(payload);
  });

  it('rejects empty profileId', () => {
    expect(() => ResetProfileTimelinePayloadSchema.parse({ profileId: '' })).toThrow();
  });
});
