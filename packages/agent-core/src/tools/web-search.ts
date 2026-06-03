import { TavilySearch } from '@langchain/tavily';
import { z } from 'zod';
import type { ToolDefinition, ToolExecutionContext, ToolResult } from './tool-types';

/** WebSearch 工具输入 schema */
export const WebSearchInputSchema = z.object({
  query: z.string().min(3),
  maxResults: z.number().int().positive().max(10).optional(),
  topic: z.enum(['general', 'news']).optional(),
  searchDepth: z.enum(['basic', 'advanced']).optional(),
  timeRange: z.enum(['day', 'week', 'month', 'year']).optional(),
  includeDomains: z.array(z.string().min(1)).optional(),
  excludeDomains: z.array(z.string().min(1)).optional(),
});

export type WebSearchInput = z.infer<typeof WebSearchInputSchema>;

/** 单条搜索结果 schema */
export const WebSearchResultSchema = z.object({
  title: z.string(),
  url: z.string(),
  content: z.string(),
  score: z.number().optional(),
  publishedDate: z.string().optional(),
});

/** WebSearch 工具输出 schema */
export const WebSearchOutputSchema = z.object({
  results: z.array(WebSearchResultSchema),
});

export type WebSearchResult = z.infer<typeof WebSearchResultSchema>;
export type WebSearchOutput = z.infer<typeof WebSearchOutputSchema>;

/** TavilySearch 调用接口，用于依赖注入 */
export interface TavilySearchInvoker {
  invoke(input: Record<string, unknown>): Promise<unknown>;
}

/** 创建 WebSearch 工具的配置选项 */
export interface CreateWebSearchToolOptions {
  maxResults: number;
  timeoutMs: number;
  tavilySearch?: TavilySearchInvoker;
}

/** 创建 WebSearch 工具，支持依赖注入 Tavily 实例 */
export function createWebSearchTool(
  options: CreateWebSearchToolOptions,
): ToolDefinition<WebSearchInput, WebSearchOutput> {
  const tavilySearch = options.tavilySearch ?? new TavilySearch({
    maxResults: options.maxResults,
    topic: 'general',
    includeAnswer: false,
    includeRawContent: false,
    includeImages: false,
  });

  return {
    name: 'webSearch',
    description: 'Search public web pages through Tavily and return URL-backed snippets.',
    inputSchema: WebSearchInputSchema,
    outputSchema: WebSearchOutputSchema,
    async execute(input, _ctx: ToolExecutionContext): Promise<ToolResult<WebSearchOutput>> {
      return executeWebSearch(input, tavilySearch, options);
    },
  };
}

/** 执行 web 搜索并标准化返回结果 */
async function executeWebSearch(
  input: WebSearchInput,
  tavilySearch: TavilySearchInvoker,
  options: CreateWebSearchToolOptions,
): Promise<ToolResult<WebSearchOutput>> {
  try {
    const raw = await tavilySearch.invoke({
      query: input.query,
      maxResults: input.maxResults ?? options.maxResults,
      topic: input.topic ?? 'general',
      ...(input.searchDepth ? { searchDepth: input.searchDepth } : {}),
      ...(input.timeRange ? { timeRange: input.timeRange } : {}),
      ...(input.includeDomains ? { includeDomains: input.includeDomains } : {}),
      ...(input.excludeDomains ? { excludeDomains: input.excludeDomains } : {}),
    });

    const results = normalizeTavilyResults(raw);

    return {
      success: true,
      data: { results },
      evidenceIds: results.map((result) => `web:${result.url}`),
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'web_search_error',
        message: error instanceof Error ? error.message : 'Tavily search failed',
      },
    };
  }
}

/** 将 Tavily 原始返回值标准化为 WebSearchResult 数组 */
function normalizeTavilyResults(raw: unknown): WebSearchResult[] {
  if (!isRecord(raw) || !Array.isArray(raw.results)) return [];

  return raw.results.flatMap((item): WebSearchResult[] => {
    if (!isRecord(item)) return [];
    if (typeof item.title !== 'string') return [];
    if (typeof item.url !== 'string') return [];
    if (typeof item.content !== 'string') return [];

    return [{
      title: item.title,
      url: item.url,
      content: item.content,
      ...(typeof item.score === 'number' ? { score: item.score } : {}),
      ...(typeof item.publishedDate === 'string' ? { publishedDate: item.publishedDate } : {}),
    }];
  });
}

/** 类型守卫：判断值是否为普通对象 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
