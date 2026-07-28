import { describe, expect, it } from 'vitest';
import type { DailyRecord } from '@health-advisor/shared';
import {
  buildPlanOffer,
  buildSleepHomepageOffer,
  classifyLatestSleepQuality,
  GOOD_SLEEP_SCORE_MIN,
} from '../proactive-advisor-flow';

function record(score: number): DailyRecord {
  return {
    date: '2026-04-24',
    sleep: {
      totalMinutes: 420,
      startTime: '23:00',
      endTime: '06:00',
      stages: { deep: 90, light: 180, rem: 120, awake: 30 },
      score,
    },
  };
}

describe('proactive advisor flow', () => {
  it('仅依据设备提供的 sleep.score 做稳定质量分层', () => {
    expect(classifyLatestSleepQuality([record(GOOD_SLEEP_SCORE_MIN)])).toBe('good');
    expect(classifyLatestSleepQuality([record(GOOD_SLEEP_SCORE_MIN - 1)])).toBe(
      'needs_recovery',
    );
    expect(classifyLatestSleepQuality([{ date: '2026-04-24' }])).toBe('missing');
    expect(
      classifyLatestSleepQuality([
        { ...record(90), date: '2026-04-23' },
        { date: '2026-04-24' },
      ]),
    ).toBe('missing');
  });

  it('睡眠兴趣提议使用封闭的 homepage.sleep.show interaction', () => {
    const prompt = buildSleepHomepageOffer('zh');
    expect(prompt.question).toContain('是否需要将睡眠数据放到首页');
    expect(prompt.actions.map((action) => action.interaction)).toEqual([
      {
        type: 'advisor.proactive.respond',
        proposal: 'homepage.sleep.show',
        decision: 'accept',
      },
      {
        type: 'advisor.proactive.respond',
        proposal: 'homepage.sleep.show',
        decision: 'decline',
      },
    ]);
  });

  it('睡眠良好与需恢复分别产生对应的计划提议', () => {
    expect(buildPlanOffer('good', 'zh').kind).toBe('plan.activity-three-day.create');
    expect(buildPlanOffer('good', 'zh').question).toContain('3 日运动计划');
    expect(buildPlanOffer('needs_recovery', 'zh').kind).toBe(
      'plan.sleep-recovery.create',
    );
    expect(buildPlanOffer('needs_recovery', 'zh').question).toContain('睡眠恢复计划');
  });
});
