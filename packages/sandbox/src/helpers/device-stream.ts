import type { DailyRecord, DeviceSyncSession, ProfileData, SensorSample, SleepStageType } from '@health-advisor/shared';

const MINUTES_PER_DAY = 24 * 60;
const HEART_RATE_ANCHORS = [30, 450, 780, 1080, 1320];

export interface DeviceSyncSessionSummary extends DeviceSyncSession {
  sampleCount: number;
  firstSampleAt: string | null;
  lastSampleAt: string | null;
}

export function materializeDeviceSamples(profile: ProfileData): SensorSample[] {
  const interval = profile.device?.samplingIntervalMinutes ?? 1;
  const sampleMap = new Map<string, SensorSample>();

  for (const record of profile.records) {
    materializeDayVitals(record, interval, sampleMap);
    materializeSleepSession(record, interval, sampleMap);
  }

  return [...sampleMap.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

export function getSyncedSamples(profile: ProfileData): SensorSample[] {
  const sessions = profile.device?.syncSessions ?? [];
  if (sessions.length === 0) return [];

  const samples = materializeDeviceSamples(profile);
  return samples.filter((sample) => isSampleSynced(sample.timestamp, sessions));
}

export function getPendingSamples(profile: ProfileData): SensorSample[] {
  const sessions = profile.device?.syncSessions ?? [];
  if (sessions.length === 0) return materializeDeviceSamples(profile);

  const samples = materializeDeviceSamples(profile);
  return samples.filter((sample) => !isSampleSynced(sample.timestamp, sessions));
}

export function getSamplesForSyncSession(profile: ProfileData, syncId: string): SensorSample[] {
  const session = profile.device?.syncSessions.find((item) => item.syncId === syncId);
  if (!session) {
    throw new Error(`Sync session not found: ${syncId}`);
  }

  return materializeDeviceSamples(profile).filter((sample) =>
    sample.timestamp >= session.uploadedRange.start && sample.timestamp <= session.uploadedRange.end,
  );
}

export function summarizeSyncSessions(profile: ProfileData): DeviceSyncSessionSummary[] {
  return (profile.device?.syncSessions ?? []).map((session) => {
    const samples = getSamplesForSyncSession(profile, session.syncId);
    return {
      ...session,
      sampleCount: samples.length,
      firstSampleAt: samples[0]?.timestamp ?? null,
      lastSampleAt: samples[samples.length - 1]?.timestamp ?? null,
    };
  });
}

function isSampleSynced(timestamp: string, sessions: DeviceSyncSession[]): boolean {
  return sessions.some((session) => (
    timestamp >= session.uploadedRange.start && timestamp <= session.uploadedRange.end
  ));
}

function materializeDayVitals(
  record: DailyRecord,
  interval: number,
  sampleMap: Map<string, SensorSample>,
): void {
  const date = record.date;
  const hrAnchors = buildHeartRateAnchors(record.hr);
  const totalSteps = record.activity?.steps ?? 0;
  const totalCalories = record.activity?.calories ?? 0;
  const totalDistance = record.activity?.distanceKm ?? 0;
  const totalActiveMinutes = record.activity?.activeMinutes ?? 0;
  const activeSlotMinutes = buildActiveSlotMinutes(totalActiveMinutes, interval);
  const activeSlotCount = activeSlotMinutes.length || 1;

  for (let minute = 0; minute < MINUTES_PER_DAY; minute += interval) {
    const timestamp = toTimestamp(date, minute);
    const heartRate = Math.round(interpolateAnchors(HEART_RATE_ANCHORS, hrAnchors, minute));
    const spo2 = record.spo2 == null
      ? undefined
      : clampNumber(record.spo2 + Math.sin((minute / MINUTES_PER_DAY) * Math.PI * 2) * 0.6, 80, 100, 1);
    const stressLoad = record.stress?.load == null
      ? undefined
      : clampNumber(
        record.stress.load + Math.sin(((minute - 720) / MINUTES_PER_DAY) * Math.PI * 2) * 8,
        0,
        100,
      );

    const isActiveSlot = activeSlotMinutes.includes(minute);
    upsertSample(sampleMap, timestamp, {
      timestamp,
      heartRate,
      spo2,
      stressLoad,
      stepsDelta: isActiveSlot ? roundTo(totalSteps / activeSlotCount, 2) : undefined,
      caloriesDelta: isActiveSlot ? roundTo(totalCalories / activeSlotCount, 2) : undefined,
      activeMinutesDelta: isActiveSlot ? interval : undefined,
      distanceKmDelta: isActiveSlot ? roundTo(totalDistance / activeSlotCount, 4) : undefined,
    });
  }
}

function materializeSleepSession(
  record: DailyRecord,
  interval: number,
  sampleMap: Map<string, SensorSample>,
): void {
  if (!record.sleep) return;

  const startMinute = parseClockToMinute(record.sleep.startTime);
  const endMinute = parseClockToMinute(record.sleep.endTime);
  const startDate = shiftDate(record.date, -1);
  const endDate = record.date;
  const duration = (MINUTES_PER_DAY - startMinute) + endMinute;
  const stageSequence = buildSleepStageSequence(record.sleep.stages, interval, duration);

  for (let index = 0; index < stageSequence.length; index += 1) {
    const absoluteMinute = startMinute + index * interval;
    const dayOffset = Math.floor(absoluteMinute / MINUTES_PER_DAY);
    const minuteOfDay = absoluteMinute % MINUTES_PER_DAY;
    const timestamp = toTimestamp(dayOffset === 0 ? startDate : endDate, minuteOfDay);

    upsertSample(sampleMap, timestamp, {
      timestamp,
      sleepStage: stageSequence[index],
    });
  }
}

function buildHeartRateAnchors(values?: number[]): number[] {
  if (!values || values.length === 0) return [60, 64, 72, 88, 66];
  if (values.length >= HEART_RATE_ANCHORS.length) return values.slice(0, HEART_RATE_ANCHORS.length);

  const result = [...values];
  while (result.length < HEART_RATE_ANCHORS.length) {
    result.push(result[result.length - 1] ?? 60);
  }
  return result;
}

function buildActiveSlotMinutes(totalActiveMinutes: number, interval: number): number[] {
  const slotCount = Math.max(0, Math.round(totalActiveMinutes / interval));
  if (slotCount === 0) return [];

  const wakeStart = 7 * 60;
  const wakeEnd = 21 * 60;
  const span = wakeEnd - wakeStart;

  return Array.from({ length: slotCount }, (_, index) => {
    if (slotCount === 1) return wakeStart + Math.floor(span / 2 / interval) * interval;
    const ratio = index / (slotCount - 1);
    const minute = wakeStart + Math.round((span * ratio) / interval) * interval;
    return Math.min(minute, wakeEnd);
  });
}

function buildSleepStageSequence(
  stages: DailyRecord['sleep'] extends infer T
    ? T extends { stages: infer S } ? S : never
    : never,
  interval: number,
  durationMinutes: number,
): SleepStageType[] {
  const totalSlots = Math.max(1, Math.round(durationMinutes / interval));
  const stageCounts = normalizeStageCounts({
    awake: Math.round((stages.awake / durationMinutes) * totalSlots),
    light: Math.round((stages.light / durationMinutes) * totalSlots),
    deep: Math.round((stages.deep / durationMinutes) * totalSlots),
    rem: Math.round((stages.rem / durationMinutes) * totalSlots),
  }, totalSlots);

  const cyclePattern: SleepStageType[] = ['light', 'deep', 'light', 'rem'];
  const sequence: SleepStageType[] = [];
  let cycleIndex = 0;

  while (sequence.length < totalSlots) {
    const preferred = cyclePattern[cycleIndex % cyclePattern.length]!;
    const nextStage = takeNextAvailableStage(stageCounts, preferred);
    sequence.push(nextStage);
    cycleIndex += 1;
  }

  return sequence;
}

function normalizeStageCounts(
  counts: Record<SleepStageType, number>,
  expectedTotal: number,
): Record<SleepStageType, number> {
  const result = { ...counts };
  let currentTotal = Object.values(result).reduce((sum, value) => sum + value, 0);

  while (currentTotal < expectedTotal) {
    result.light += 1;
    currentTotal += 1;
  }

  while (currentTotal > expectedTotal) {
    const stage = (['awake', 'light', 'rem', 'deep'] as SleepStageType[]).find((key) => result[key] > 0);
    if (!stage) break;
    result[stage] -= 1;
    currentTotal -= 1;
  }

  return result;
}

function takeNextAvailableStage(
  counts: Record<SleepStageType, number>,
  preferred: SleepStageType,
): SleepStageType {
  if (counts[preferred] > 0) {
    counts[preferred] -= 1;
    return preferred;
  }

  for (const stage of ['light', 'deep', 'rem', 'awake'] as SleepStageType[]) {
    if (counts[stage] > 0) {
      counts[stage] -= 1;
      return stage;
    }
  }

  return 'light';
}

function interpolateAnchors(anchorMinutes: number[], anchorValues: number[], minute: number): number {
  if (minute <= anchorMinutes[0]!) return anchorValues[0]!;
  if (minute >= anchorMinutes[anchorMinutes.length - 1]!) return anchorValues[anchorValues.length - 1]!;

  for (let index = 0; index < anchorMinutes.length - 1; index += 1) {
    const startMinute = anchorMinutes[index]!;
    const endMinute = anchorMinutes[index + 1]!;
    if (minute < startMinute || minute > endMinute) continue;

    const ratio = (minute - startMinute) / (endMinute - startMinute);
    const startValue = anchorValues[index]!;
    const endValue = anchorValues[index + 1]!;
    return startValue + (endValue - startValue) * ratio;
  }

  return anchorValues[anchorValues.length - 1]!;
}

function upsertSample(
  sampleMap: Map<string, SensorSample>,
  timestamp: string,
  patch: SensorSample,
): void {
  const current = sampleMap.get(timestamp) ?? { timestamp };
  sampleMap.set(timestamp, { ...current, ...patch });
}

function parseClockToMinute(clock: string): number {
  const [hours, minutes] = clock.split(':').map((value) => Number.parseInt(value, 10));
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

function toTimestamp(date: string, minuteOfDay: number): string {
  const hours = Math.floor(minuteOfDay / 60);
  const minutes = minuteOfDay % 60;
  return `${date}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function clampNumber(value: number, min: number, max: number, digits = 0): number {
  const clamped = Math.max(min, Math.min(max, value));
  return roundTo(clamped, digits);
}

function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
