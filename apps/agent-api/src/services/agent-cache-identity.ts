import crypto from 'node:crypto';
import type { AgentRequest } from '@health-advisor/agent-core';
import { AgentTaskType, type Locale } from '@health-advisor/shared';
import type { RuntimeRegistry } from '../runtime/registry.js';

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: unknown): string {
  return crypto.createHash('sha256').update(stableJson(value)).digest('hex');
}

export function buildAgentCacheIdentity(input: {
  request: AgentRequest;
  locale: Locale | undefined;
  registry: RuntimeRegistry;
  promptVersion: string;
  modelVersion: string;
}) {
  const locale = input.locale ?? 'zh';
  const syncState = input.registry.overrideStore.getSyncState(input.request.profileId);
  const syncedEvents = input.registry.overrideStore.getSyncedEvents(input.request.profileId);
  const activeOverrides = input.registry.getActiveOverrides(input.request.profileId);
  const injectedEvents = input.registry.getInjectedEvents(input.request.profileId);
  const scope = {
    taskType: input.request.taskType,
    profileId: input.request.profileId,
    pageContext: input.request.pageContext,
    tab: input.request.tab,
    timeframe: input.request.timeframe,
    dateRange: input.request.dateRange,
    visibleChartIds: input.request.visibleChartIds,
  };

  return {
    cacheType: input.request.taskType === AgentTaskType.HOMEPAGE_SUMMARY ? 'homepage_brief' as const : 'view_summary' as const,
    cacheKey: sha256({ scope, locale }),
    dataFingerprint: sha256({ syncState, syncedEvents, activeOverrides, injectedEvents }),
    promptVersion: input.promptVersion,
    modelVersion: input.modelVersion,
    locale,
  };
}
