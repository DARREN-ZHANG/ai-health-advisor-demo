import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AgentTaskType, type AgentResponseEnvelope, type PageContext, type DataTab, type ChartTokenId } from '@health-advisor/shared';

export interface FallbackEntry {
  summary: string;
  chartTokens: ChartTokenId[];
  microTips: string[];
}

export interface FallbackAssets {
  homepage: Record<string, FallbackEntry>;
  'view-summary': Record<string, FallbackEntry>;
  'advisor-chat': Record<string, FallbackEntry>;
}

export interface FallbackLookupKey {
  profileId: string;
  pageContext: PageContext;
  tab?: DataTab;
}

export interface FallbackEngine {
  getFallback(taskType: AgentTaskType, key: FallbackLookupKey): AgentResponseEnvelope;
}

export interface FallbackEngineDeps {
  readFile: (path: string, encoding?: string) => string;
}

const GENERIC_FALLBACK: FallbackEntry = {
  summary: '健康数据正在分析中，请稍后再试。',
  chartTokens: [],
  microTips: ['如有疑问，请咨询专业医生'],
};

const DEFAULT_FALLBACKS_DIR = join(
  process.cwd(),
  'data',
  'sandbox',
  'fallbacks',
);

export function createFallbackEngine(
  assetsOrDeps: FallbackAssets | Partial<FallbackEngineDeps>,
  fallbacksDir?: string,
): FallbackEngine {
  let assets: FallbackAssets;

  if ('homepage' in assetsOrDeps && typeof assetsOrDeps.homepage === 'object') {
    assets = assetsOrDeps as FallbackAssets;
  } else {
    const deps = assetsOrDeps as Partial<FallbackEngineDeps>;
    const dir = fallbacksDir ?? DEFAULT_FALLBACKS_DIR;
    const reader = deps.readFile ?? ((path: string, enc?: string) => readFileSync(path, (enc as BufferEncoding) ?? 'utf-8') as string);
    assets = loadFallbackAssets(reader, dir);
  }

  return {
    getFallback(
      taskType: AgentTaskType,
      key: FallbackLookupKey,
    ): AgentResponseEnvelope {
      const entry = lookupEntry(assets, taskType, key);
      return {
        summary: entry.summary,
        source: 'fallback',
        statusColor: 'warning',
        chartTokens: entry.chartTokens,
        microTips: entry.microTips,
        meta: {
          taskType,
          pageContext: key.pageContext,
          finishReason: 'fallback',
        },
      };
    },
  };
}

function lookupEntry(
  assets: FallbackAssets,
  taskType: AgentTaskType,
  key: FallbackLookupKey,
): FallbackEntry {
  switch (taskType) {
    case AgentTaskType.HOMEPAGE_SUMMARY: {
      const byProfile = assets.homepage[key.profileId];
      return byProfile ?? GENERIC_FALLBACK;
    }
    case AgentTaskType.VIEW_SUMMARY: {
      const tabKey = key.tab ?? 'hrv';
      const byTab = assets['view-summary'][tabKey];
      return byTab ?? GENERIC_FALLBACK;
    }
    case AgentTaskType.ADVISOR_CHAT: {
      const byProfile = assets['advisor-chat'][key.profileId];
      return byProfile ?? GENERIC_FALLBACK;
    }
    default:
      return GENERIC_FALLBACK;
  }
}

function loadFallbackAssets(
  reader: (path: string, encoding?: string) => string,
  dir: string,
): FallbackAssets {
  return {
    homepage: JSON.parse(reader(join(dir, 'homepage.json'), 'utf-8')),
    'view-summary': JSON.parse(reader(join(dir, 'view-summary.json'), 'utf-8')),
    'advisor-chat': JSON.parse(reader(join(dir, 'advisor-chat.json'), 'utf-8')),
  };
}
