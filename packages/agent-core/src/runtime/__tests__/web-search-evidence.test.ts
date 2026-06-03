import { describe, expect, it, vi } from 'vitest';
import type { AnalysisPlan } from '../../planner/analysis-plan';
import type { WebSearchInput, WebSearchOutput } from '../../tools/web-search';
import type { ToolDefinition, ToolExecutionContext, ToolResult } from '../../tools/tool-types';
import {
  appendWebSearchEvidenceToPrompt,
  collectWebSearchEvidence,
  hasRequiredUnavailableWebSearch,
} from '../web-search-evidence';

function makePlan(overrides: Partial<AnalysisPlan> = {}): AnalysisPlan {
  return {
    planId: 'plan-web',
    taskType: 'advisor_chat',
    userIntent: { action: 'general', riskLevel: 'general', needsClarification: false },
    evidenceNeeds: [],
    webSearchNeeds: [
      {
        query: 'recent caffeine sleep research',
        reason: '用户询问最近公开研究',
        required: true,
        topic: 'general',
        timeRange: 'year',
      },
    ],
    safetyConstraints: ['no_diagnosis', 'no_medication_advice'],
    answerShape: {
      includeMissingDataDisclosure: false,
      includeChartTokens: false,
      maxSummaryLength: 300,
      tone: 'concise',
    },
    ...overrides,
  };
}

function makeTool(result: ToolResult<WebSearchOutput>): ToolDefinition<WebSearchInput, WebSearchOutput> {
  return {
    name: 'webSearch',
    description: 'test web search',
    inputSchema: { parse: (value: unknown) => value } as never,
    outputSchema: { parse: (value: unknown) => value } as never,
    execute: vi.fn(async () => result),
  };
}

const ctx = {} as ToolExecutionContext;

describe('web search evidence helper', () => {
  it('collects success evidence and renders URL-backed prompt rows', async () => {
    const tool = makeTool({
      success: true,
      data: {
        results: [
          {
            title: 'Caffeine and sleep',
            url: 'https://example.com/caffeine',
            content: 'A public research snippet.',
            score: 0.9,
            publishedDate: '2026-05-01',
          },
        ],
      },
      evidenceIds: ['web:https://example.com/caffeine'],
    });

    const evidence = await collectWebSearchEvidence(makePlan(), { webSearchTool: tool, maxResults: 3 }, ctx);
    const prompt = appendWebSearchEvidenceToPrompt('base prompt', evidence);

    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.status).toBe('success');
    expect(hasRequiredUnavailableWebSearch(evidence)).toBe(false);
    expect(prompt).toContain('## Web Search Evidence');
    expect(prompt).toContain('外部搜索只作为背景资料');
    expect(prompt).toContain('[web:https://example.com/caffeine] Caffeine and sleep');
    expect(prompt).toContain('URL: https://example.com/caffeine');
    expect(prompt).toContain('摘要: A public research snippet.');
    expect(prompt).toContain('Published: 2026-05-01');
  });

  it('marks required needs as unavailable when tool is not injected', async () => {
    const evidence = await collectWebSearchEvidence(makePlan(), { webSearchTool: undefined, maxResults: 3 }, ctx);

    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.status).toBe('unavailable');
    expect(evidence[0]?.required).toBe(true);
    expect(hasRequiredUnavailableWebSearch(evidence)).toBe(true);
  });

  it('marks empty required results as unavailable', async () => {
    const tool = makeTool({ success: true, data: { results: [] }, evidenceIds: [] });

    const evidence = await collectWebSearchEvidence(makePlan(), { webSearchTool: tool, maxResults: 3 }, ctx);

    expect(evidence[0]?.status).toBe('unavailable');
    expect(evidence[0]?.message).toBe('外部搜索未返回可用结果。回答时不得声称已查到外部资料。');
    expect(hasRequiredUnavailableWebSearch(evidence)).toBe(true);
  });

  it('renders optional unavailable status without marking required unavailable', async () => {
    const plan = makePlan({
      webSearchNeeds: [
        {
          query: 'sleep news',
          reason: '外部背景资料',
          required: false,
        },
      ],
    });
    const tool = makeTool({
      success: false,
      error: { code: 'web_search_error', message: 'Tavily unavailable' },
    });

    const evidence = await collectWebSearchEvidence(plan, { webSearchTool: tool, maxResults: 3 }, ctx);
    const prompt = appendWebSearchEvidenceToPrompt('base prompt', evidence);

    expect(hasRequiredUnavailableWebSearch(evidence)).toBe(false);
    expect(prompt).toContain('状态: unavailable');
    expect(prompt).toContain('说明: 外部搜索未返回可用结果。回答时不得声称已查到外部资料。');
  });
});
