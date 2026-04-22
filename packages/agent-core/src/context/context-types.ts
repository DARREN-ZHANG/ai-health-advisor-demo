import type { DailyRecord, Timeframe, RecognizedEvent, DerivedTemporalState } from '@health-advisor/shared';
import type { OverrideEntry, DatedEvent } from '@health-advisor/sandbox';
import type { SessionMemoryStore } from '../memory/session-memory-store';
import type { AnalyticalMemoryStore } from '../memory/analytical-memory-store';
import type { TimelineSyncContext } from '../types/agent-context';

export interface ContextBuilderDeps {
  getProfile: (profileId: string) => import('@health-advisor/shared').ProfileData;
  selectByTimeframe: (
    records: DailyRecord[],
    timeframe: Timeframe,
    options?: { referenceDate?: string; customDateRange?: { start: string; end: string } },
  ) => DailyRecord[];
  applyOverrides: (records: DailyRecord[], overrides: OverrideEntry[]) => DailyRecord[];
  mergeEvents: (baseEvents: DatedEvent[], injectedEvents: DatedEvent[]) => DatedEvent[];
  sessionMemory: SessionMemoryStore;
  analyticalMemory: AnalyticalMemoryStore;
  getActiveOverrides: (profileId: string) => OverrideEntry[];
  getInjectedEvents: (profileId: string) => DatedEvent[];
  /** 获取时间轴同步上下文（可选，demo timeline 模式下提供） */
  getTimelineSync?: (profileId: string) => TimelineSyncContext | undefined;
}
