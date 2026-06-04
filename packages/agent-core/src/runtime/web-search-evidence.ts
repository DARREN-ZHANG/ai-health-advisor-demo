import type { AnalysisPlan, WebSearchNeed } from '../planner/analysis-plan';
import type { ToolDefinition, ToolExecutionContext } from '../tools/tool-types';
import type { WebSearchInput, WebSearchOutput, WebSearchResult } from '../tools/web-search';

/** WebSearch evidence 状态 */
export type WebSearchEvidenceStatus = 'success' | 'unavailable';

/** 单条 WebSearch evidence 记录 */
export interface WebSearchEvidence {
  need: WebSearchNeed;
  query: string;
  reason: string;
  required: boolean;
  status: WebSearchEvidenceStatus;
  results: WebSearchResult[];
  evidenceIds: string[];
  message?: string;
}

/** collectWebSearchEvidence 依赖项 */
export interface CollectWebSearchEvidenceDeps {
  webSearchTool?: ToolDefinition<WebSearchInput, WebSearchOutput>;
  maxResults: number;
}

const UNAVAILABLE_MESSAGE = '外部搜索未返回可用结果。回答时不得声称已查到外部资料。';
const NOT_CONFIGURED_MESSAGE = 'WebSearch 未启用或未配置 Tavily provider。回答时不得声称已查到外部资料。';

/**
 * 遍历 plan.webSearchNeeds，调用 webSearchTool 收集 evidence。
 * 处理三种 unavailable 场景：tool 未注入、调用失败、返回空结果。
 */
export async function collectWebSearchEvidence(
  plan: AnalysisPlan,
  deps: CollectWebSearchEvidenceDeps,
  ctx: ToolExecutionContext,
): Promise<WebSearchEvidence[]> {
  const needs = plan.webSearchNeeds ?? [];
  const evidence: WebSearchEvidence[] = [];

  for (const need of needs) {
    if (!deps.webSearchTool) {
      evidence.push(toUnavailableEvidence(need, NOT_CONFIGURED_MESSAGE));
      continue;
    }

    const result = await deps.webSearchTool.execute(
      {
        query: need.query,
        maxResults: deps.maxResults,
        topic: need.topic,
        timeRange: need.timeRange,
        includeDomains: need.includeDomains,
        excludeDomains: need.excludeDomains,
      },
      ctx,
    );

    if (!result.success) {
      evidence.push(toUnavailableEvidence(need, UNAVAILABLE_MESSAGE));
      continue;
    }

    if (result.data.results.length === 0) {
      evidence.push(toUnavailableEvidence(need, UNAVAILABLE_MESSAGE));
      continue;
    }

    evidence.push({
      need,
      query: need.query,
      reason: need.reason,
      required: need.required,
      status: 'success',
      results: result.data.results,
      evidenceIds: result.evidenceIds,
    });
  }

  return evidence;
}

/**
 * 将收集到的 WebSearch evidence 追加到任务 prompt 中。
 * 外部搜索声明为背景资料，本地健康数据优先。
 */
export function appendWebSearchEvidenceToPrompt(
  taskPrompt: string,
  evidence: WebSearchEvidence[],
): string {
  if (evidence.length === 0) return taskPrompt;

  const sections = [
    taskPrompt,
    '',
    '## Web Search Evidence',
    '',
    '外部搜索只作为背景资料。用户本地健康数据优先级高于网页信息。使用搜索信息时必须保守表达，并保留来源 URL。',
  ];

  for (const item of evidence) {
    sections.push('');
    sections.push(`搜索需求: ${item.reason}`);
    sections.push(`查询: ${item.query}`);
    sections.push(`状态: ${item.status}`);

    if (item.status === 'unavailable') {
      sections.push(`说明: ${item.message ?? UNAVAILABLE_MESSAGE}`);
      continue;
    }

    for (const result of item.results) {
      sections.push('');
      sections.push(`- [web:${result.url}] ${result.title}`);
      sections.push(`  URL: ${result.url}`);
      sections.push(`  摘要: ${result.content}`);
      if (result.publishedDate) {
        sections.push(`  Published: ${result.publishedDate}`);
      }
    }
  }

  return sections.join('\n');
}

/** 检查是否存在 required=true 但 unavailable 的 WebSearch evidence */
export function hasRequiredUnavailableWebSearch(evidence: WebSearchEvidence[]): boolean {
  return evidence.some((item) => item.required && item.status === 'unavailable');
}

function toUnavailableEvidence(need: WebSearchNeed, message: string): WebSearchEvidence {
  return {
    need,
    query: need.query,
    reason: need.reason,
    required: need.required,
    status: 'unavailable',
    results: [],
    evidenceIds: [],
    message,
  };
}
