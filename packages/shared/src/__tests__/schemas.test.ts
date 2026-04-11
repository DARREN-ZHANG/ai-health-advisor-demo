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
  ScenarioPayloadSchema,
} from '../schemas/god-mode';
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

  it('ScenarioPayloadSchema accepts valid payload', () => {
    const payload = { scenarioId: 'stress-test' };
    expect(ScenarioPayloadSchema.parse(payload)).toEqual(payload);
  });

  it('ScenarioPayloadSchema accepts optional params', () => {
    const payload = { scenarioId: 'stress-test', params: { intensity: 'high' } };
    expect(ScenarioPayloadSchema.parse(payload)).toEqual(payload);
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
