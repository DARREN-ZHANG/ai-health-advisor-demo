import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { AgentResponseEnvelope } from '@health-advisor/shared';
import { AgentTaskType } from '@health-advisor/shared';
import { applyAdvisorUiDirectives } from './advisor-ui-directives';
import {
  selectHomeTrendCardDisplay,
  useHomeTrendCardStore,
} from '@/stores/home-trend-card.store';

function makeEnvelope(overrides: Partial<AgentResponseEnvelope>): AgentResponseEnvelope {
  return {
    summary: '已在首页展示睡眠趋势简报。',
    source: 'planner',
    statusColor: 'good',
    chartTokens: [],
    microTips: [],
    meta: {
      taskType: AgentTaskType.ADVISOR_CHAT,
      pageContext: { profileId: 'profile-a', page: 'homepage', timeframe: 'week' },
      finishReason: 'complete',
    },
    ...overrides,
  } as AgentResponseEnvelope;
}

describe('applyAdvisorUiDirectives', () => {
  beforeEach(() => {
    useHomeTrendCardStore.setState({ displayByProfile: {} });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('合法 complete 指令', () => {
    it('sleep 指令更新对应 profile', () => {
      applyAdvisorUiDirectives(
        makeEnvelope({
          uiDirectives: [{ type: 'homepage.trend-card.set', display: 'sleep' }],
        }),
        'profile-a',
      );
      expect(
        selectHomeTrendCardDisplay(useHomeTrendCardStore.getState(), 'profile-a'),
      ).toBe('sleep');
    });

    it('activity 指令更新对应 profile', () => {
      applyAdvisorUiDirectives(
        makeEnvelope({
          uiDirectives: [{ type: 'homepage.trend-card.set', display: 'activity' }],
        }),
        'profile-a',
      );
      expect(
        selectHomeTrendCardDisplay(useHomeTrendCardStore.getState(), 'profile-a'),
      ).toBe('activity');
    });

    it('hidden 指令把 sleep 改回 hidden', () => {
      useHomeTrendCardStore.getState().setDisplay('profile-a', 'sleep');
      applyAdvisorUiDirectives(
        makeEnvelope({
          uiDirectives: [{ type: 'homepage.trend-card.set', display: 'hidden' }],
        }),
        'profile-a',
      );
      expect(
        selectHomeTrendCardDisplay(useHomeTrendCardStore.getState(), 'profile-a'),
      ).toBe('hidden');
    });
  });

  describe('无效响应 — 不改变 store', () => {
    it('fallback finishReason 不应用指令', () => {
      useHomeTrendCardStore.getState().setDisplay('profile-a', 'sleep');
      applyAdvisorUiDirectives(
        makeEnvelope({
          uiDirectives: [{ type: 'homepage.trend-card.set', display: 'hidden' }],
          meta: {
            taskType: AgentTaskType.ADVISOR_CHAT,
            pageContext: { profileId: 'profile-a', page: 'homepage', timeframe: 'week' },
            finishReason: 'fallback',
          },
        }),
        'profile-a',
      );
      expect(
        selectHomeTrendCardDisplay(useHomeTrendCardStore.getState(), 'profile-a'),
      ).toBe('sleep');
    });

    it('timeout finishReason 不应用指令', () => {
      applyAdvisorUiDirectives(
        makeEnvelope({
          uiDirectives: [{ type: 'homepage.trend-card.set', display: 'sleep' }],
          meta: {
            taskType: AgentTaskType.ADVISOR_CHAT,
            pageContext: { profileId: 'profile-a', page: 'homepage', timeframe: 'week' },
            finishReason: 'timeout',
          },
        }),
        'profile-a',
      );
      expect(
        selectHomeTrendCardDisplay(useHomeTrendCardStore.getState(), 'profile-a'),
      ).toBe('hidden');
    });

    it('非 ADVISOR_CHAT task 不应用指令', () => {
      applyAdvisorUiDirectives(
        makeEnvelope({
          uiDirectives: [{ type: 'homepage.trend-card.set', display: 'sleep' }],
          meta: {
            taskType: AgentTaskType.HOMEPAGE_SUMMARY,
            pageContext: { profileId: 'profile-a', page: 'homepage', timeframe: 'week' },
            finishReason: 'complete',
          },
        }),
        'profile-a',
      );
      expect(
        selectHomeTrendCardDisplay(useHomeTrendCardStore.getState(), 'profile-a'),
      ).toBe('hidden');
    });

    it('profile mismatch 不应用指令', () => {
      applyAdvisorUiDirectives(
        makeEnvelope({
          uiDirectives: [{ type: 'homepage.trend-card.set', display: 'sleep' }],
        }),
        'profile-other',
      );
      expect(
        selectHomeTrendCardDisplay(useHomeTrendCardStore.getState(), 'profile-a'),
      ).toBe('hidden');
      expect(
        selectHomeTrendCardDisplay(useHomeTrendCardStore.getState(), 'profile-other'),
      ).toBe('hidden');
    });

    it('uiDirectives 为 undefined 不应用', () => {
      applyAdvisorUiDirectives(makeEnvelope({ uiDirectives: undefined }), 'profile-a');
      expect(
        selectHomeTrendCardDisplay(useHomeTrendCardStore.getState(), 'profile-a'),
      ).toBe('hidden');
    });

    it('uiDirectives 为空数组不应用', () => {
      applyAdvisorUiDirectives(makeEnvelope({ uiDirectives: [] }), 'profile-a');
      expect(
        selectHomeTrendCardDisplay(useHomeTrendCardStore.getState(), 'profile-a'),
      ).toBe('hidden');
    });

    it('uiDirectives 超过 1 条不应用', () => {
      applyAdvisorUiDirectives(
        makeEnvelope({
          uiDirectives: [
            { type: 'homepage.trend-card.set', display: 'sleep' },
            { type: 'homepage.trend-card.set', display: 'activity' },
          ] as AgentResponseEnvelope['uiDirectives'],
        }),
        'profile-a',
      );
      expect(
        selectHomeTrendCardDisplay(useHomeTrendCardStore.getState(), 'profile-a'),
      ).toBe('hidden');
    });
  });

  describe('网络边界 — 非法 payload', () => {
    it('未知 directive type 不应用且不抛异常', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      applyAdvisorUiDirectives(
        makeEnvelope({
          uiDirectives: [
            { type: 'homepage.unknown.set', display: 'sleep' },
          ] as unknown as AgentResponseEnvelope['uiDirectives'],
        }),
        'profile-a',
      );
      expect(
        selectHomeTrendCardDisplay(useHomeTrendCardStore.getState(), 'profile-a'),
      ).toBe('hidden');
      expect(warnSpy).toHaveBeenCalledTimes(1);
      warnSpy.mockRestore();
    });

    it('非法 display 不应用且不抛异常', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      applyAdvisorUiDirectives(
        makeEnvelope({
          uiDirectives: [
            { type: 'homepage.trend-card.set', display: 'overview' },
          ] as unknown as AgentResponseEnvelope['uiDirectives'],
        }),
        'profile-a',
      );
      expect(
        selectHomeTrendCardDisplay(useHomeTrendCardStore.getState(), 'profile-a'),
      ).toBe('hidden');
      warnSpy.mockRestore();
    });
  });
});
