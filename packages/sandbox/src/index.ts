// Loader
export {
  loadManifest,
  loadProfile,
  loadAllProfiles,
  loadHistoryRecords,
  loadTimelineScript,
  buildInitialProfileState,
} from './loader';
export type { ManifestProfileEntry, Manifest, ProfileFileV2, InitialProfileState } from './loader';

// Helpers — history archive
export { loadHistoryArchive, validateHistoryArchive } from './helpers/history-archive';
export type { HistoryArchiveFile } from './helpers/history-archive';

// Helpers — timeline script
export { loadTimelineScriptFile, validateTimelineScript } from './helpers/timeline-script';
export type { TimelineScriptFile } from './helpers/timeline-script';

// Helpers — demo clock
export { createDemoClock, advanceDemoClock, isTimeInRange } from './helpers/demo-clock';

// Selectors — profile
export { getProfile, listProfiles } from './selectors/profile';
export type { ProfileSummary } from './selectors/profile';

// Selectors — date range
export { selectByDateRange, selectByTimeframe } from './selectors/date-range';

// Merge — override
export { applyOverrides } from './merge/override';
export type { OverrideEntry } from './merge/override';

// Merge — event
export { mergeEvents } from './merge/event';
export type { DatedEvent } from './merge/event';

// Helpers — missing value
export { isMissing, fillMissing } from './helpers/missing-value';

// Helpers — timeline
export { normalizeTimeline, rollingMedian } from './helpers/timeline';
export type { TimelinePoint } from './helpers/timeline';

// Helpers — device stream
export {
  materializeDeviceSamples,
  getSyncedSamples,
  getPendingSamples,
  getSamplesForSyncSession,
  summarizeSyncSessions,
} from './helpers/device-stream';
export type { DeviceSyncSessionSummary } from './helpers/device-stream';

// Helpers — activity generators
export {
  generateEventsForSegment,
  generateMealIntakeEvents,
  generateSteadyCardioEvents,
  generateProlongedSedentaryEvents,
  generateIntermittentExerciseEvents,
  generateWalkEvents,
  generateSleepEvents,
} from './helpers/activity-generators';

// Helpers — raw event repository
export {
  createRawEventRepository,
} from './helpers/raw-event-repository';
export type { RawEventRepository } from './helpers/raw-event-repository';

// Helpers — timeline append
export { appendSegment } from './helpers/timeline-append';
export type { TimelineAppendResult } from './helpers/timeline-append';
