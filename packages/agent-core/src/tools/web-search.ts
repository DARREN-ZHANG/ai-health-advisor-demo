import { z } from 'zod';

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
