import { describe, expect, it } from 'vitest';
import { buildHomepageEventInsights, normalizeHomepageEventType, buildHistoryBasedSuppressions, ACTION_SEMANTIC_GROUPS } from '../../context/homepage-event-insights';
import type { RecentRecommendedAction } from '../../types/memory';
import type { HomepageContextPacket } from '../../context/context-packet';

describe('homepage event insights', () => {
  it.each([
    ['sleep', 'sleep_end'],
    ['nap', 'sleep_end'],
    ['meal_intake', 'meal'],
    ['deep_focus', 'work_focus'],
    ['prolonged_sedentary', 'work_sedentary'],
    ['relaxation', 'rest_break'],
    ['walk', 'cardio_workout'],
    ['steady_cardio', 'cardio_workout'],
    ['intermittent_exercise', 'hiit_workout'],
    ['strength_training', 'hiit_workout'],
    ['anxiety_episode', 'stress_spike'],
    ['caffeine_intake', 'possible_caffeine_intake'],
    ['possible_caffeine_intake', 'possible_caffeine_intake'],
    ['alcohol_intake', 'possible_alcohol_intake'],
    ['possible_alcohol_intake', 'possible_alcohol_intake'],
    ['unknown_event', 'unknown'],
  ])('maps %s to %s', (input, expected) => {
    expect(normalizeHomepageEventType(input)).toBe(expected);
  });

  it('保留最近微事件的原始类型供 LLM context 使用', () => {
    const homepage = makeHomepage({
      recentEvents: [{
        recognizedEventId: 're-micro-breathing',
        type: 'micro_deep_breathing',
        start: '2026-04-21T12:00',
        end: '2026-04-21T12:03',
        durationMin: 3,
        confidence: 1,
        sourceSegmentId: 'seg-micro-deep-breathing',
        recognitionEvidence: ['用户选择触发微事件 micro_deep_breathing'],
        syncState: { lastSyncedMeasuredAt: '2026-04-21T12:03', pendingEventCount: 0, fromSyncedWindow: true },
        evidenceIds: ['event_micro_deep_breathing_2026-04-21T12:00'],
      }],
    });

    const [insight] = buildHomepageEventInsights({ homepage, demoNow: '2026-04-21T12:03' });

    expect(insight?.eventType).toBe('unknown');
    expect(insight?.rawEventType).toBe('micro_deep_breathing');
  });
});

function makeHomepage(overrides: Partial<HomepageContextPacket> = {}): HomepageContextPacket {
  return {
    recentEvents: [],
    latest24h: {
      date: '2026-04-21',
      metrics: [
        { metric: 'sleep_total', value: 450, unit: 'min', baseline: 420, deltaPctVsBaseline: 7, status: 'normal', evidenceId: 'latest24h_sleep_total_2026-04-21' },
        { metric: 'hrv', value: 42, unit: 'ms', baseline: 58, deltaPctVsBaseline: -28, status: 'attention', evidenceId: 'latest24h_hrv_2026-04-21' },
        { metric: 'resting_hr', value: 82, unit: 'bpm', baseline: 62, deltaPctVsBaseline: 32, status: 'attention', evidenceId: 'latest24h_resting_hr_2026-04-21' },
        { metric: 'spo2', value: 98, unit: '%', baseline: 98, deltaPctVsBaseline: 0, status: 'normal', evidenceId: 'latest24h_spo2_2026-04-21' },
        { metric: 'stress_load', value: 72, unit: 'score', status: 'attention', evidenceId: 'latest24h_stress_load_2026-04-21' },
      ],
    },
    trend7d: [],
    eventInsights: [],
    rulesInsights: [],
    suggestedChartTokens: [],
    ...overrides,
  };
}

it('builds a high-tension work focus insight from event-window HRV compressed and HR elevated', () => {
  const insights = buildHomepageEventInsights({
    homepage: makeHomepage({
      recentEvents: [{
        recognizedEventId: 're-focus-1',
        type: 'deep_focus',
        start: '2026-04-21T10:00',
        end: '2026-04-21T12:00',
        durationMin: 120,
        confidence: 0.91,
        sourceSegmentId: 'seg-focus-1',
        recognitionEvidence: ['平均心率 72, 低运动, 深度专注'],
        eventWindow: {
          source: 'synced_device_samples',
          coverage: 'complete',
          recognizedEventId: 're-focus-1',
          sourceSegmentId: 'seg-focus-1',
          start: '2026-04-21T10:00',
          end: '2026-04-21T12:00',
          durationMin: 120,
          sampleCount: 4,
          metrics: [
            { metric: 'heart_rate', unit: 'bpm', sampleCount: 2, max: 95, latest: 92, average: 93, delta: -3, qualifier: 'elevated', interpretation: 'HR elevated during focus', evidenceId: 'ew_hr' },
            { metric: 'hrv_rmssd', unit: 'ms', sampleCount: 2, latest: 35, average: 38, delta: -5, qualifier: 'compressed', interpretation: 'HRV compressed during focus', evidenceId: 'ew_hrv' },
          ],
          evidenceIds: ['ew_hr', 'ew_hrv'],
        },
        syncState: { lastSyncedMeasuredAt: '2026-04-21T12:00', pendingEventCount: 0, fromSyncedWindow: true },
        evidenceIds: ['event_deep_focus_2026-04-21T10:00'],
      }],
    }),
    demoNow: '2026-04-21T12:10',
  });

  expect(insights).toHaveLength(1);
  expect(insights[0]!.eventType).toBe('work_focus');
  expect(insights[0]!.priority).toBe('high');
  expect(insights[0]!.tension.level).toBe('high');
  expect(insights[0]!.physiology.some((p) => p.metric === 'hrv' && p.qualifier === 'compressed')).toBe(true);
  expect(insights[0]!.recommendedFocus.some((f) => f.category === 'movement_reset')).toBe(true);
  expect(insights[0]!.evidenceIds).toContain('event_deep_focus_2026-04-21T10:00');
});

it('marks SpO2 critical context as critical tension', () => {
  const insights = buildHomepageEventInsights({
    homepage: makeHomepage({
      latest24h: {
        date: '2026-04-21',
        metrics: [
          { metric: 'spo2', value: 88, unit: '%', baseline: 98, deltaPctVsBaseline: -10, status: 'critical', clinicalNote: '低氧血症，建议尽快就医', evidenceId: 'latest24h_spo2_2026-04-21' },
        ],
      },
      recentEvents: [{
        recognizedEventId: 're-sleep-1',
        type: 'sleep',
        start: '2026-04-20T23:00',
        end: '2026-04-21T07:00',
        durationMin: 480,
        confidence: 0.95,
        sourceSegmentId: 'seg-sleep-1',
        recognitionEvidence: ['低运动, 心率平稳, 睡眠模式'],
        syncState: { lastSyncedMeasuredAt: '2026-04-21T07:00', pendingEventCount: 0, fromSyncedWindow: true },
        evidenceIds: ['event_sleep_2026-04-20T23:00'],
      }],
    }),
    demoNow: '2026-04-21T07:10',
  });

  expect(insights[0]!.eventType).toBe('sleep_end');
  expect(insights[0]!.tension.level).toBe('critical');
  expect(insights[0]!.recommendedFocus.some((f) => f.category === 'medical_attention')).toBe(true);
});

it('uses only supported product capabilities in action intents', () => {
  const insights = buildHomepageEventInsights({
    homepage: makeHomepage({
      recentEvents: [{
        recognizedEventId: 're-sedentary-1',
        type: 'prolonged_sedentary',
        start: '2026-04-21T13:00',
        end: '2026-04-21T16:00',
        durationMin: 180,
        confidence: 0.88,
        sourceSegmentId: 'seg-sedentary-1',
        recognitionEvidence: ['低运动, 心率平稳, 久坐模式'],
        syncState: { lastSyncedMeasuredAt: '2026-04-21T16:00', pendingEventCount: 0, fromSyncedWindow: true },
        evidenceIds: ['event_prolonged_sedentary_2026-04-21T13:00'],
      }],
    }),
    demoNow: '2026-04-21T16:05',
  });

  const actions = insights[0]!.actionIntents;
  expect(actions.length).toBeGreaterThanOrEqual(2);
  expect(actions.every((a) => a.productCapability === 'record_choice' || a.productCapability === 'contextual_followup')).toBe(true);
  expect(actions.map((a) => a.aiPromise).join('\n')).not.toMatch(/提醒|开启.*模式|实时监控|调整监测逻辑/);
});

it('creates event-appropriate action categories for post-workout recovery', () => {
  const insights = buildHomepageEventInsights({
    homepage: makeHomepage({
      recentEvents: [{
        recognizedEventId: 're-cardio-1',
        type: 'steady_cardio',
        start: '2026-04-21T17:30',
        end: '2026-04-21T18:10',
        durationMin: 40,
        confidence: 0.92,
        sourceSegmentId: 'seg-cardio-1',
        recognitionEvidence: ['心率标准差 20, 持续有氧运动'],
        syncState: { lastSyncedMeasuredAt: '2026-04-21T18:10', pendingEventCount: 0, fromSyncedWindow: true },
        evidenceIds: ['event_steady_cardio_2026-04-21T17:30'],
      }],
    }),
    demoNow: '2026-04-21T18:20',
  });

  const focusCategories = insights[0]!.recommendedFocus.map((f) => f.category);
  expect(focusCategories).toContain('hydration');
  expect(focusCategories).toContain('nutrition');
});

it('does not attach sleep recovery context or sleep evidence to a midday walk insight', () => {
  const insights = buildHomepageEventInsights({
    demoNow: '2026-06-01T13:00',
    homepage: makeHomepage({
      latest24h: {
        date: '2026-06-01',
        metrics: [
          { metric: 'sleep_total', value: 450, unit: 'min', baseline: 600, deltaPctVsBaseline: -25, status: 'normal', evidenceId: 'latest24h_sleep_total_2026-06-01' },
          { metric: 'hrv', value: 93, unit: 'ms', baseline: 90, deltaPctVsBaseline: 3, status: 'normal', evidenceId: 'latest24h_hrv_2026-06-01' },
        ],
      },
      recentEvents: [{
        recognizedEventId: 're-walk-1',
        type: 'walk',
        start: '2026-06-01T12:30',
        end: '2026-06-01T13:00',
        durationMin: 30,
        confidence: 0.91,
        sourceSegmentId: 'seg-walk-1',
        recognitionEvidence: ['步行 30 min, 心率均值 100'],
        eventWindow: {
          source: 'synced_device_samples',
          coverage: 'complete',
          recognizedEventId: 're-walk-1',
          sourceSegmentId: 'seg-walk-1',
          start: '2026-06-01T12:30',
          end: '2026-06-01T13:00',
          durationMin: 30,
          sampleCount: 12,
          metrics: [
            { metric: 'heart_rate', unit: 'bpm', sampleCount: 6, startValue: 84, endValue: 91, latest: 91, min: 84, max: 107, average: 100, delta: 7, qualifier: 'elevated', interpretation: '事件窗口心率峰值 107bpm，均值 100bpm', evidenceId: 'event_window_re-walk-1_heart_rate' },
            { metric: 'steps', unit: 'steps', sampleCount: 6, startValue: 0, endValue: 3100, latest: 3100, min: 0, max: 3100, average: 1550, delta: 3100, qualifier: 'elevated', interpretation: '事件窗口累计步数 3100steps', evidenceId: 'event_window_re-walk-1_steps' },
          ],
          evidenceIds: ['event_window_re-walk-1_heart_rate', 'event_window_re-walk-1_steps'],
        },
        syncState: { lastSyncedMeasuredAt: '2026-06-01T13:00', pendingEventCount: 0, fromSyncedWindow: true },
        evidenceIds: ['event_walk_2026-06-01T12:30'],
      }],
      rulesInsights: [],
    }),
  });

  expect(insights).toHaveLength(1);
  expect(insights[0]!.eventType).toBe('cardio_workout');
  expect(insights[0]!.recoveryContext.map((ctx) => ctx.metric)).not.toContain('sleep_total');
  expect(insights[0]!.evidenceIds).not.toContain('latest24h_sleep_total_2026-06-01');
});

it('does not recommend sleep protection for a 13:00 walk', () => {
  const insights = buildHomepageEventInsights({
    demoNow: '2026-06-01T13:00',
    homepage: makeHomepage({
      recentEvents: [{
        recognizedEventId: 're-walk-1',
        type: 'walk',
        start: '2026-06-01T12:30',
        end: '2026-06-01T13:00',
        durationMin: 30,
        confidence: 0.91,
        sourceSegmentId: 'seg-walk-1',
        recognitionEvidence: ['步行 30 min'],
        syncState: { lastSyncedMeasuredAt: '2026-06-01T13:00', pendingEventCount: 0, fromSyncedWindow: true },
        evidenceIds: ['event_walk'],
      }],
    }),
  });

  expect(insights[0]!.recommendedFocus.map((focus) => focus.category)).not.toContain('sleep_protection');
  expect(insights[0]!.actionIntents.map((action) => action.title).join('\n')).not.toMatch(/睡眠|入睡|调暗|深睡/);
});

it('keeps sleep protection for evening high intensity workouts', () => {
  const insights = buildHomepageEventInsights({
    demoNow: '2026-06-01T19:30',
    homepage: makeHomepage({
      recentEvents: [{
        recognizedEventId: 're-hiit-1',
        type: 'intermittent_exercise',
        start: '2026-06-01T19:00',
        end: '2026-06-01T19:30',
        durationMin: 30,
        confidence: 0.92,
        sourceSegmentId: 'seg-hiit-1',
        recognitionEvidence: ['间歇训练 30 min'],
        syncState: { lastSyncedMeasuredAt: '2026-06-01T19:30', pendingEventCount: 0, fromSyncedWindow: true },
        evidenceIds: ['event_hiit'],
      }],
    }),
  });

  expect(insights[0]!.recommendedFocus.map((focus) => focus.category)).toContain('sleep_protection');
});

it('keeps sleep recovery context for an evening HIIT event when sleep is attention', () => {
  const insights = buildHomepageEventInsights({
    demoNow: '2026-06-01T19:30',
    homepage: makeHomepage({
      latest24h: {
        date: '2026-06-01',
        metrics: [
          { metric: 'sleep_total', value: 360, unit: 'min', baseline: 600, deltaPctVsBaseline: -40, status: 'attention', evidenceId: 'latest24h_sleep_total_2026-06-01' },
          { metric: 'hrv', value: 72, unit: 'ms', baseline: 90, deltaPctVsBaseline: -20, status: 'normal', evidenceId: 'latest24h_hrv_2026-06-01' },
        ],
      },
      recentEvents: [{
        recognizedEventId: 're-hiit-1',
        type: 'intermittent_exercise',
        start: '2026-06-01T19:00',
        end: '2026-06-01T19:30',
        durationMin: 30,
        confidence: 0.92,
        sourceSegmentId: 'seg-hiit-1',
        recognitionEvidence: ['间歇训练 30 min'],
        syncState: { lastSyncedMeasuredAt: '2026-06-01T19:30', pendingEventCount: 0, fromSyncedWindow: true },
        evidenceIds: ['event_hiit'],
      }],
      rulesInsights: [],
    }),
  });

  expect(insights[0]!.eventType).toBe('hiit_workout');
  expect(insights[0]!.recoveryContext).toContainEqual(expect.objectContaining({
    metric: 'sleep_total',
    visibility: 'material',
    reason: 'primary_event_has_evening_sleep_risk',
  }));
  expect(insights[0]!.evidenceIds).toContain('latest24h_sleep_total_2026-06-01');
});

it('attaches deep breathing micro event interaction for breathing reset', () => {
  const insights = buildHomepageEventInsights({
    homepage: makeHomepage({
      recentEvents: [{
        recognizedEventId: 're-sedentary-1',
        type: 'prolonged_sedentary',
        start: '2026-06-01T10:00',
        end: '2026-06-01T12:00',
        durationMin: 120,
        confidence: 0.9,
        sourceSegmentId: 'seg-sedentary-1',
        recognitionEvidence: ['久坐'],
        syncState: { lastSyncedMeasuredAt: '2026-06-01T12:00', pendingEventCount: 0, fromSyncedWindow: true },
        evidenceIds: ['event_sedentary'],
      }],
    }),
    demoNow: '2026-06-01T12:05',
  });

  const breathing = insights[0]!.actionIntents.find((action) => action.interaction?.kind === 'micro_event' && action.interaction.microEvent.type === 'micro_deep_breathing');
  expect(breathing).toBeDefined();
  expect(breathing?.title).toMatch(/呼吸/);
  expect(breathing?.title).not.toMatch(/重置/);
});

it('keeps hydration action without timeline interaction', () => {
  const insights = buildHomepageEventInsights({
    homepage: makeHomepage({
      recentEvents: [{
        recognizedEventId: 're-cardio-1',
        type: 'steady_cardio',
        start: '2026-06-01T17:30',
        end: '2026-06-01T18:10',
        durationMin: 40,
        confidence: 0.92,
        sourceSegmentId: 'seg-cardio-1',
        recognitionEvidence: ['有氧运动'],
        syncState: { lastSyncedMeasuredAt: '2026-06-01T18:10', pendingEventCount: 0, fromSyncedWindow: true },
        evidenceIds: ['event_cardio'],
      }],
    }),
    demoNow: '2026-06-01T18:20',
  });

  const hydration = insights[0]!.actionIntents.find((action) => action.title.includes('补水') || action.description.includes('补水'));
  expect(hydration).toBeDefined();
  expect(hydration?.interaction).toBeUndefined();
});

it('attaches calendar interaction for future sleep protection', () => {
  const insights = buildHomepageEventInsights({
    homepage: makeHomepage({
      recentEvents: [{
        recognizedEventId: 're-hiit-1',
        type: 'intermittent_exercise',
        start: '2026-06-01T19:00',
        end: '2026-06-01T19:30',
        durationMin: 30,
        confidence: 0.92,
        sourceSegmentId: 'seg-hiit-1',
        recognitionEvidence: ['间歇训练'],
        syncState: { lastSyncedMeasuredAt: '2026-06-01T19:30', pendingEventCount: 0, fromSyncedWindow: true },
        evidenceIds: ['event_hiit'],
      }],
    }),
    demoNow: '2026-06-01T19:30',
  });

  const sleep = insights[0]!.actionIntents.find((action) => action.interaction?.kind === 'calendar');
  expect(sleep?.interaction).toEqual({
    kind: 'calendar',
    calendar: expect.objectContaining({
      title: expect.any(String),
      timingLabel: expect.any(String),
      durationMinutes: expect.any(Number),
    }),
  });
});

it('adds a bedtime hot shower calendar action for caffeine intake after 17:00', () => {
  const insights = buildHomepageEventInsights({
    homepage: makeHomepage({
      recentEvents: [{
        recognizedEventId: 're-caffeine-1',
        type: 'caffeine_intake',
        start: '2026-06-01T17:20',
        end: '2026-06-01T17:40',
        durationMin: 20,
        confidence: 0.92,
        sourceSegmentId: 'seg-caffeine-1',
        recognitionEvidence: ['咖啡因摄入'],
        syncState: { lastSyncedMeasuredAt: '2026-06-01T17:40', pendingEventCount: 0, fromSyncedWindow: true },
        evidenceIds: ['event_caffeine'],
      }],
    }),
    demoNow: '2026-06-01T17:45',
  });

  const hotShower = insights[0]!.actionIntents.find((action) => action.title === '睡前洗个热水澡');

  expect(hotShower).toBeDefined();
  expect(hotShower?.description).toContain('今晚睡前 60 min');
  expect(hotShower?.interaction).toEqual({
    kind: 'calendar',
    calendar: {
      title: '睡前洗个热水澡',
      timingLabel: '今晚睡前 60 min',
      durationMinutes: 30,
    },
  });
});

it('marks the latest event displayable and the prior event analysis-only', () => {
  const insights = buildHomepageEventInsights({
    demoNow: '2026-06-01T13:30',
    homepage: makeHomepage({
      recentEvents: [
        {
          recognizedEventId: 're-cardio-1',
          type: 'steady_cardio',
          start: '2026-06-01T13:00',
          end: '2026-06-01T13:30',
          durationMin: 30,
          confidence: 0.92,
          sourceSegmentId: 'seg-cardio-1',
          recognitionEvidence: ['有氧运动'],
          syncState: { lastSyncedMeasuredAt: '2026-06-01T13:30', pendingEventCount: 0, fromSyncedWindow: true },
          evidenceIds: ['event_cardio'],
        },
        {
          recognizedEventId: 're-sedentary-1',
          type: 'prolonged_sedentary',
          start: '2026-06-01T09:00',
          end: '2026-06-01T13:00',
          durationMin: 240,
          confidence: 0.9,
          sourceSegmentId: 'seg-sedentary-1',
          recognitionEvidence: ['久坐'],
          syncState: { lastSyncedMeasuredAt: '2026-06-01T13:30', pendingEventCount: 0, fromSyncedWindow: true },
          evidenceIds: ['event_sedentary'],
        },
      ],
    }),
  });

  expect(insights).toHaveLength(2);
  expect(insights[0]!.mentionPolicy).toEqual({
    summary: 'allowed',
    actions: 'allowed',
    reason: 'current_latest_event',
  });
  expect(insights[1]!.mentionPolicy).toEqual({
    summary: 'forbidden',
    actions: 'forbidden',
    reason: 'prior_event_analysis_only',
  });
  expect(insights[0]!.transitionContext).toEqual(expect.objectContaining({
    priorEventType: 'work_sedentary',
    relation: 'post_sedentary_activation',
  }));
  expect(insights[0]!.transitionContext?.forbiddenMentions).toEqual(expect.arrayContaining([
    '久坐',
    '之前',
    '上一轮',
    '前一个事件',
    '久坐后',
  ]));
});

it('suppresses walk-like and repeat-exercise actions after a current cardio event', () => {
  const insights = buildHomepageEventInsights({
    demoNow: '2026-06-01T13:30',
    homepage: makeHomepage({
      recentEvents: [{
        recognizedEventId: 're-cardio-1',
        type: 'walk',
        start: '2026-06-01T13:00',
        end: '2026-06-01T13:30',
        durationMin: 30,
        confidence: 0.91,
        sourceSegmentId: 'seg-walk-1',
        recognitionEvidence: ['步行 30 min'],
        syncState: { lastSyncedMeasuredAt: '2026-06-01T13:30', pendingEventCount: 0, fromSyncedWindow: true },
        evidenceIds: ['event_walk'],
      }],
    }),
  });

  const actionText = insights[0]!.actionIntents.map((action) => `${action.title}\n${action.description}`).join('\n');
  expect(insights[0]!.transitionContext?.actionSuppressions).toEqual(expect.arrayContaining([
    expect.objectContaining({ category: 'movement_reset' }),
    expect.objectContaining({ interactionMicroEventType: 'micro_short_walk' }),
  ]));
  expect(actionText).not.toMatch(/散步|轻走活动|继续运动|轻松有氧/);
  expect(actionText).toMatch(/补水|恢复营养|拉伸|心率/);
  expect(insights[0]!.actionIntents.map((action) => action.interaction?.kind === 'micro_event' ? action.interaction.microEvent.type : '').join('\n')).not.toMatch(/micro_short_walk|micro_post_workout_slow_walk|micro_easy_cardio/);
});

it('suppresses repeated same-category actions for consecutive current and prior events', () => {
  const insights = buildHomepageEventInsights({
    demoNow: '2026-06-01T18:30',
    homepage: makeHomepage({
      recentEvents: [
        {
          recognizedEventId: 're-cardio-2',
          type: 'steady_cardio',
          start: '2026-06-01T18:00',
          end: '2026-06-01T18:30',
          durationMin: 30,
          confidence: 0.92,
          sourceSegmentId: 'seg-cardio-2',
          recognitionEvidence: ['有氧运动'],
          syncState: { lastSyncedMeasuredAt: '2026-06-01T18:30', pendingEventCount: 0, fromSyncedWindow: true },
          evidenceIds: ['event_cardio_2'],
        },
        {
          recognizedEventId: 're-cardio-1',
          type: 'steady_cardio',
          start: '2026-06-01T17:20',
          end: '2026-06-01T17:50',
          durationMin: 30,
          confidence: 0.9,
          sourceSegmentId: 'seg-cardio-1',
          recognitionEvidence: ['有氧运动'],
          syncState: { lastSyncedMeasuredAt: '2026-06-01T18:30', pendingEventCount: 0, fromSyncedWindow: true },
          evidenceIds: ['event_cardio_1'],
        },
      ],
    }),
  });

  expect(insights[0]!.transitionContext?.relation).toBe('same_category_repeat');
  const actionText = insights[0]!.actionIntents.map((action) => `${action.title}\n${action.description}`).join('\n');
  expect(actionText).not.toMatch(/继续运动|轻松有氧|再.*有氧/);
});


describe('buildHistoryBasedSuppressions', () => {
  const BASE_NOW = 1_000_000_000;

  it('returns empty for empty history', () => {
    expect(buildHistoryBasedSuppressions([], BASE_NOW)).toEqual([]);
  });

  it('suppresses same semantic group within 4h cooldown', () => {
    const now = BASE_NOW;
    const actions: RecentRecommendedAction[] = [
      { category: 'movement_reset', microEventType: 'micro_short_walk', title: '短距离步行', timestamp: now - 20 * 60 * 1000 },
    ];
    const suppressions = buildHistoryBasedSuppressions(actions, now);

    // strenuous_activity 组下两个 category 都应被抑制
    expect(suppressions.some(s => s.category === 'movement_reset')).toBe(true);
    expect(suppressions.some(s => s.category === 'training_adjustment')).toBe(true);
    // microEventType 也应被抑制
    expect(suppressions.some(s => s.interactionMicroEventType === 'micro_short_walk')).toBe(true);
    // 不同组不受影响
    expect(suppressions.some(s => s.category === 'hydration')).toBe(false);
    expect(suppressions.some(s => s.category === 'breathing_reset')).toBe(false);
  });

  it('does not suppress after cooldown expires and under daily cap', () => {
    const now = BASE_NOW;
    const actions: RecentRecommendedAction[] = [
      { category: 'movement_reset', title: '短距离步行', timestamp: now - 5 * 60 * 60 * 1000 },
    ];
    const suppressions = buildHistoryBasedSuppressions(actions, now);
    expect(suppressions.some(s => s.category === 'movement_reset')).toBe(false);
  });

  it('suppresses when daily cap reached even after cooldown expires', () => {
    const now = BASE_NOW;
    const actions: RecentRecommendedAction[] = [
      { category: 'movement_reset', title: '步行 A', timestamp: now - 12 * 60 * 60 * 1000 },
      { category: 'movement_reset', title: '步行 B', timestamp: now - 6 * 60 * 60 * 1000 },
    ];
    const suppressions = buildHistoryBasedSuppressions(actions, now);
    expect(suppressions.some(s => s.category === 'movement_reset')).toBe(true);
  });

  it('allows category after cooldown and under cap', () => {
    const now = BASE_NOW;
    const actions: RecentRecommendedAction[] = [
      { category: 'movement_reset', title: '步行', timestamp: now - 6 * 60 * 60 * 1000 },
    ];
    const suppressions = buildHistoryBasedSuppressions(actions, now);
    expect(suppressions.some(s => s.category === 'movement_reset')).toBe(false);
  });

  it('does not suppress hydration when only movement_reset is in cooldown', () => {
    const now = BASE_NOW;
    const actions: RecentRecommendedAction[] = [
      { category: 'movement_reset', title: '步行', timestamp: now - 20 * 60 * 1000 },
    ];
    const suppressions = buildHistoryBasedSuppressions(actions, now);
    expect(suppressions.some(s => s.category === 'hydration')).toBe(false);
    expect(suppressions.some(s => s.category === 'nutrition')).toBe(false);
  });

  it('suppresses both breathing_reset and sleep_protection when nervous_system_reset group is in cooldown', () => {
    const now = BASE_NOW;
    const actions: RecentRecommendedAction[] = [
      { category: 'breathing_reset', title: '呼吸练习', timestamp: now - 30 * 60 * 1000 },
    ];
    const suppressions = buildHistoryBasedSuppressions(actions, now);
    expect(suppressions.some(s => s.category === 'breathing_reset')).toBe(true);
    expect(suppressions.some(s => s.category === 'sleep_protection')).toBe(true);
  });

  it('ignores actions outside 24h window for daily cap check', () => {
    const now = BASE_NOW;
    const actions: RecentRecommendedAction[] = [
      { category: 'movement_reset', title: '步行 A', timestamp: now - 25 * 60 * 60 * 1000 },
      { category: 'movement_reset', title: '步行 B', timestamp: now - 6 * 60 * 60 * 1000 },
    ];
    const suppressions = buildHistoryBasedSuppressions(actions, now);
    // 24h 内只有 1 次，冷却期已过，不应抑制
    expect(suppressions.some(s => s.category === 'movement_reset')).toBe(false);
  });
});

describe('ACTION_SEMANTIC_GROUPS', () => {
  it('maps all 9 focus categories', () => {
    const categories = [
      'movement_reset', 'breathing_reset', 'nutrition', 'hydration',
      'training_adjustment', 'sleep_protection', 'posture',
      'data_quality', 'medical_attention',
    ];
    for (const cat of categories) {
      expect(ACTION_SEMANTIC_GROUPS[cat]).toBeDefined();
    }
  });

  it('maps movement_reset and training_adjustment to the same group', () => {
    expect(ACTION_SEMANTIC_GROUPS.movement_reset).toBe(ACTION_SEMANTIC_GROUPS.training_adjustment);
  });
});

describe('history-based suppression in buildHomepageEventInsights', () => {
  it('suppresses movement_reset for meal event when walk was recently recommended', () => {
    const now = Date.now();
    const previousActions: RecentRecommendedAction[] = [
      { category: 'movement_reset', microEventType: 'micro_short_walk', title: '短距离步行', timestamp: now - 20 * 60 * 1000 },
    ];

    const insights = buildHomepageEventInsights({
      homepage: makeHomepage({
        recentEvents: [{
          type: 'meal_intake',
          start: '2026-06-01T08:20',
          end: '2026-06-01T08:40',
          durationMin: 20,
          confidence: 0.9,
          recognitionEvidence: ['进餐'],
          syncState: { lastSyncedMeasuredAt: null, pendingEventCount: 0, fromSyncedWindow: false },
          evidenceIds: ['event_meal'],
        }],
      }),
      demoNow: '2026-06-01T08:40',
      previousRecommendedActions: previousActions,
    });

    const focusCategories = insights[0]!.recommendedFocus.map(f => f.category);
    expect(focusCategories).not.toContain('movement_reset');
    // 应保留 hydration 和 breathing_reset（不同语义组）
    expect(focusCategories).toContain('hydration');
    expect(focusCategories).toContain('breathing_reset');
  });

  it('allows movement_reset after cooldown expires and under daily cap', () => {
    const now = Date.now();
    const previousActions: RecentRecommendedAction[] = [
      { category: 'movement_reset', title: '短距离步行', timestamp: now - 5 * 60 * 60 * 1000 },
    ];

    const insights = buildHomepageEventInsights({
      homepage: makeHomepage({
        recentEvents: [{
          type: 'meal_intake',
          start: '2026-06-01T12:30',
          end: '2026-06-01T12:50',
          durationMin: 20,
          confidence: 0.9,
          recognitionEvidence: ['进餐'],
          syncState: { lastSyncedMeasuredAt: null, pendingEventCount: 0, fromSyncedWindow: false },
          evidenceIds: ['event_meal'],
        }],
      }),
      demoNow: '2026-06-01T12:50',
      previousRecommendedActions: previousActions,
    });

    const focusCategories = insights[0]!.recommendedFocus.map(f => f.category);
    expect(focusCategories).toContain('movement_reset');
  });

  it('suppresses movement_reset when daily cap reached', () => {
    const now = Date.now();
    const previousActions: RecentRecommendedAction[] = [
      { category: 'movement_reset', title: '步行 A', timestamp: now - 12 * 60 * 60 * 1000 },
      { category: 'movement_reset', title: '步行 B', timestamp: now - 6 * 60 * 60 * 1000 },
    ];

    const insights = buildHomepageEventInsights({
      homepage: makeHomepage({
        recentEvents: [{
          type: 'prolonged_sedentary',
          start: '2026-06-01T14:00',
          end: '2026-06-01T16:00',
          durationMin: 120,
          confidence: 0.9,
          recognitionEvidence: ['久坐'],
          syncState: { lastSyncedMeasuredAt: null, pendingEventCount: 0, fromSyncedWindow: false },
          evidenceIds: ['event_sedentary'],
        }],
      }),
      demoNow: '2026-06-01T16:05',
      previousRecommendedActions: previousActions,
    });

    const focusCategories = insights[0]!.recommendedFocus.map(f => f.category);
    expect(focusCategories).not.toContain('movement_reset');
    // posture 属于 light_posture，不受 strenuous_activity 抑制
    expect(focusCategories).toContain('posture');
  });

  it('does not affect behavior when no previous actions', () => {
    const insights = buildHomepageEventInsights({
      homepage: makeHomepage({
        recentEvents: [{
          type: 'work_sedentary',
          start: '2026-06-01T10:00',
          end: '2026-06-01T12:00',
          durationMin: 120,
          confidence: 0.9,
          recognitionEvidence: ['久坐'],
          syncState: { lastSyncedMeasuredAt: null, pendingEventCount: 0, fromSyncedWindow: false },
          evidenceIds: ['event_sedentary'],
        }],
      }),
      demoNow: '2026-06-01T12:05',
    });

    const focusCategories = insights[0]!.recommendedFocus.map(f => f.category);
    // 无历史时行为不变：movement_reset 应存在
    expect(focusCategories).toContain('movement_reset');
  });
});
