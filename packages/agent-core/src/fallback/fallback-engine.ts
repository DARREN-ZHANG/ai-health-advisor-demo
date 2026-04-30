import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AgentTaskType, type AgentResponseEnvelope, type PageContext, type DataTab, type ChartTokenId, type Locale, DEFAULT_LOCALE } from '@health-advisor/shared';

export interface FallbackEntry {
  summary: string;
  chartTokens: ChartTokenId[];
  microTips: string[];
}

// 支持 old 格式（直接 profileId -> FallbackEntry）和 new 格式（Locale -> profileId -> FallbackEntry）
export type LocalizedFallbackMap = Record<string, FallbackEntry> | Record<Locale, Record<string, FallbackEntry>>;

export interface FallbackAssets {
  homepage: LocalizedFallbackMap;
  'view-summary': LocalizedFallbackMap;
  'advisor-chat': LocalizedFallbackMap;
}

export interface FallbackLookupKey {
  profileId: string;
  pageContext: PageContext;
  tab?: DataTab;
}

export interface FallbackEngine {
  getFallback(taskType: AgentTaskType, key: FallbackLookupKey, locale?: Locale): AgentResponseEnvelope;
}

export interface FallbackEngineDeps {
  readFile: (path: string, encoding?: string) => string;
}

const GENERIC_FALLBACK: Record<Locale, FallbackEntry> = {
  zh: {
    summary: '健康数据正在分析中，请稍后再试。',
    chartTokens: [],
    microTips: ['如有疑问，请咨询专业医生'],
  },
  en: {
    summary: 'Health data is being analyzed. Please try again later.',
    chartTokens: [],
    microTips: ['If you have concerns, please consult a healthcare professional'],
  },
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
      locale: Locale = DEFAULT_LOCALE,
    ): AgentResponseEnvelope {
      const entry = lookupEntry(assets, taskType, key, locale);
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

/**
 * 判断 fallback map 是否为新格式（顶层包含 locale 键）
 */
function isLocalizedMap(map: LocalizedFallbackMap): map is Record<Locale, Record<string, FallbackEntry>> {
  return 'zh' in map && 'en' in map;
}

/**
 * 从 fallback map 中按 key 获取条目，自动兼容新旧格式
 */
function resolveEntry(
  map: LocalizedFallbackMap,
  key: string,
  locale: Locale,
): FallbackEntry | undefined {
  if (isLocalizedMap(map)) {
    // 新格式：先按 locale 查找，再按 key 查找
    const localized = map[locale];
    if (localized && key in localized) {
      return localized[key];
    }
    // 如果当前 locale 没找到，尝试默认 locale
    if (locale !== DEFAULT_LOCALE) {
      const defaultLocalized = map[DEFAULT_LOCALE];
      if (defaultLocalized && key in defaultLocalized) {
        return defaultLocalized[key];
      }
    }
    return undefined;
  }

  // 旧格式：直接按 key 查找
  return map[key];
}

function lookupEntry(
  assets: FallbackAssets,
  taskType: AgentTaskType,
  key: FallbackLookupKey,
  locale: Locale,
): FallbackEntry {
  switch (taskType) {
    case AgentTaskType.HOMEPAGE_SUMMARY: {
      const entry = resolveEntry(assets.homepage, key.profileId, locale);
      return entry ?? GENERIC_FALLBACK[locale] ?? GENERIC_FALLBACK[DEFAULT_LOCALE];
    }
    case AgentTaskType.VIEW_SUMMARY: {
      const tabKey = key.tab ?? 'hrv';
      const entry = resolveEntry(assets['view-summary'], tabKey, locale);
      return entry ?? GENERIC_FALLBACK[locale] ?? GENERIC_FALLBACK[DEFAULT_LOCALE];
    }
    case AgentTaskType.ADVISOR_CHAT: {
      const entry = resolveEntry(assets['advisor-chat'], key.profileId, locale);
      return entry ?? GENERIC_FALLBACK[locale] ?? GENERIC_FALLBACK[DEFAULT_LOCALE];
    }
    default:
      return GENERIC_FALLBACK[locale] ?? GENERIC_FALLBACK[DEFAULT_LOCALE];
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
