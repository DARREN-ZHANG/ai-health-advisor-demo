import { describe, expect, it, vi } from 'vitest';
import type { ToolExecutionContext } from '../tool-types';
import { createWebSearchTool, WebSearchInputSchema, WebSearchOutputSchema } from '../web-search';

const ctx = {} as ToolExecutionContext;

describe('webSearchTool', () => {
  it('validates input and output schemas', () => {
    expect(WebSearchInputSchema.safeParse({
      query: 'latest sleep guideline',
      maxResults: 3,
      topic: 'general',
      searchDepth: 'basic',
      timeRange: 'year',
      includeDomains: ['nih.gov'],
      excludeDomains: ['example.com'],
    }).success).toBe(true);

    expect(WebSearchInputSchema.safeParse({ query: 'ai' }).success).toBe(false);
    expect(WebSearchOutputSchema.safeParse({ results: [{ title: 'A', url: 'https://a.test', content: 'snippet' }] }).success).toBe(true);
  });

  it('converts Tavily results into stable output and web evidence ids', async () => {
    const invoke = vi.fn(async () => ({
      query: 'latest sleep guideline',
      answer: 'ignored answer',
      images: ['ignored image'],
      results: [
        {
          title: 'Sleep guideline',
          url: 'https://example.com/sleep',
          content: 'Public guideline snippet',
          raw_content: 'ignored raw content',
          score: 0.92,
          publishedDate: '2026-05-01',
        },
      ],
    }));
    const tool = createWebSearchTool({
      maxResults: 3,
      timeoutMs: 10000,
      tavilySearch: { invoke },
    });

    const result = await tool.execute({
      query: 'latest sleep guideline',
      topic: 'general',
      searchDepth: 'basic',
      timeRange: 'year',
      includeDomains: ['nih.gov'],
      excludeDomains: ['example.com'],
    }, ctx);

    expect(result.success).toBe(true);
    expect(invoke).toHaveBeenCalledWith({
      query: 'latest sleep guideline',
      maxResults: 3,
      topic: 'general',
      searchDepth: 'basic',
      timeRange: 'year',
      includeDomains: ['nih.gov'],
      excludeDomains: ['example.com'],
    });
    if (result.success) {
      expect(result.data.results).toEqual([
        {
          title: 'Sleep guideline',
          url: 'https://example.com/sleep',
          content: 'Public guideline snippet',
          score: 0.92,
          publishedDate: '2026-05-01',
        },
      ]);
      expect(result.evidenceIds).toEqual(['web:https://example.com/sleep']);
    }
  });

  it('returns an empty success result when Tavily returns no results', async () => {
    const tool = createWebSearchTool({
      maxResults: 3,
      timeoutMs: 10000,
      tavilySearch: { invoke: vi.fn(async () => ({ results: [] })) },
    });

    const result = await tool.execute({ query: 'recent caffeine sleep research' }, ctx);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.results).toEqual([]);
      expect(result.evidenceIds).toEqual([]);
    }
  });

  it('returns web_search_error when Tavily throws', async () => {
    const tool = createWebSearchTool({
      maxResults: 3,
      timeoutMs: 10000,
      tavilySearch: { invoke: vi.fn(async () => { throw new Error('Tavily unavailable'); }) },
    });

    const result = await tool.execute({ query: 'recent caffeine sleep research' }, ctx);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('web_search_error');
      expect(result.error.message).toContain('Tavily unavailable');
    }
  });
});
