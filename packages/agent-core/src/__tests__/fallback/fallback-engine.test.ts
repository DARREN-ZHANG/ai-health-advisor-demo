import { describe, it, expect } from 'vitest';
import { createFallbackEngine, type FallbackEngine, type FallbackAssets } from '../../fallback/fallback-engine';
import { AgentTaskType, ChartTokenId } from '@health-advisor/shared';

const mockAssets: FallbackAssets = {
  homepage: {
    'profile-a': {
      summary: '整体健康数据看起来不错。',
      chartTokens: [ChartTokenId.HRV_7DAYS, ChartTokenId.SLEEP_7DAYS],
      microTips: ['建议每天保持 7-8 小时的睡眠'],
    },
  },
  'view-summary': {
    hrv: {
      summary: '近 7 天 HRV 数据整体在正常范围内。',
      chartTokens: [ChartTokenId.HRV_7DAYS],
      microTips: ['心率变异性稳定'],
    },
  },
  'advisor-chat': {
    'profile-a': {
      summary: '根据您的数据分析，整体状况良好。',
      chartTokens: [ChartTokenId.HRV_7DAYS],
      microTips: ['保持运动'],
    },
  },
};

function makeEngine(assets: FallbackAssets = mockAssets): FallbackEngine {
  return createFallbackEngine(assets);
}

const basePageContext = {
  profileId: 'profile-a',
  page: 'home',
  timeframe: 'week' as const,
};

describe('createFallbackEngine', () => {
  it('为 homepage_summary 返回 profile 匹配的 fallback', () => {
    const engine = makeEngine();
    const result = engine.getFallback(AgentTaskType.HOMEPAGE_SUMMARY, {
      profileId: 'profile-a',
      pageContext: basePageContext,
    });

    expect(result.summary).toContain('不错');
    expect(result.meta.finishReason).toBe('fallback');
  });

  it('为 view_summary 返回 tab 匹配的 fallback', () => {
    const engine = makeEngine();
    const result = engine.getFallback(AgentTaskType.VIEW_SUMMARY, {
      profileId: 'profile-a',
      pageContext: { ...basePageContext, page: 'data-center', dataTab: 'hrv' },
      tab: 'hrv',
    });

    expect(result.summary).toContain('HRV');
    expect(result.meta.finishReason).toBe('fallback');
  });

  it('为 advisor_chat 返回 profile 匹配的 fallback', () => {
    const engine = makeEngine();
    const result = engine.getFallback(AgentTaskType.ADVISOR_CHAT, {
      profileId: 'profile-a',
      pageContext: basePageContext,
    });

    expect(result.summary).toContain('良好');
    expect(result.meta.finishReason).toBe('fallback');
  });

  it('找不到匹配 fallback 时返回通用 fallback', () => {
    const engine = makeEngine();
    const result = engine.getFallback(AgentTaskType.HOMEPAGE_SUMMARY, {
      profileId: 'unknown-profile',
      pageContext: { ...basePageContext, profileId: 'unknown-profile' },
    });

    expect(result.summary).toBeTruthy();
    expect(result.meta.finishReason).toBe('fallback');
  });

  it('fallback 包含正确的 meta 字段', () => {
    const engine = makeEngine();
    const result = engine.getFallback(AgentTaskType.HOMEPAGE_SUMMARY, {
      profileId: 'profile-a',
      pageContext: basePageContext,
    });

    expect(result.meta.taskType).toBe(AgentTaskType.HOMEPAGE_SUMMARY);
    expect(result.meta.pageContext.profileId).toBe('profile-a');
    expect(result.meta.finishReason).toBe('fallback');
  });

  it('从文件加载 fallback 资产', () => {
    const engine = createFallbackEngine({
      readFile: (path: string) => {
        if (path.includes('homepage')) return JSON.stringify(mockAssets.homepage);
        if (path.includes('view-summary')) return JSON.stringify(mockAssets['view-summary']);
        if (path.includes('advisor-chat')) return JSON.stringify(mockAssets['advisor-chat']);
        throw new Error(`Not found: ${path}`);
      },
    } as never);

    const result = engine.getFallback(AgentTaskType.HOMEPAGE_SUMMARY, {
      profileId: 'profile-a',
      pageContext: basePageContext,
    });

    expect(result.summary).toContain('不错');
  });
});
