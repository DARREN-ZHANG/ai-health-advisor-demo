import type {
  ActivitySegment,
  BaselineMetrics,
  CloneProfileOverrides,
  ProfileData,
  SandboxProfile,
  UpdateProfilePayload,
} from '@health-advisor/shared';
import { SandboxProfileSchema } from '@health-advisor/shared';
import {
  buildInitialProfileState,
  buildProfileConfig,
  createDemoClock,
  deriveSleepConfig,
  generateHistory,
  generateTimelineScript,
  PROFILE_CONFIGS,
} from '@health-advisor/sandbox';
import { createOverrideStore, type OverrideStoreService } from './override-store.js';

interface SessionProfileState {
  data: ProfileData;
  initialDemoTime: string;
  initialSegments: ActivitySegment[];
}

interface SessionProfileSnapshot {
  state: SessionProfileState;
}

function cloneState(state: SessionProfileState): SessionProfileState {
  return structuredClone(state);
}

function getDateRange(days: number): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

function parseWakeTime(initialDemoTime: string): { hour: number; min: number } {
  const [hour, min] = initialDemoTime.slice(11, 16).split(':').map(Number);
  if (!Number.isInteger(hour) || !Number.isInteger(min)) {
    throw new Error(`Invalid initial demo time: ${initialDemoTime}`);
  }
  return { hour: hour!, min: min! };
}

function baselinesDiffer(
  left: Partial<BaselineMetrics> | undefined,
  right: Partial<BaselineMetrics> | undefined,
): boolean {
  const keys: Array<keyof BaselineMetrics> = [
    'restingHr',
    'hrv',
    'spo2',
    'avgSleepMinutes',
    'avgSteps',
  ];
  return keys.some((key) => left?.[key] !== right?.[key]);
}

function patchHistory(existing: ProfileData['records'], generated: ProfileData['records']) {
  const generatedByDate = new Map(generated.map((record) => [record.date, record]));
  const merged = existing.map((record) => generatedByDate.get(record.date) ?? record);
  const existingDates = new Set(existing.map((record) => record.date));
  for (const record of generated) {
    if (!existingDates.has(record.date)) merged.push(record);
  }
  return merged.sort((left, right) => left.date.localeCompare(right.date));
}

function patchRecordWithDailyBaseline(
  record: ProfileData['records'][number],
  baseline: Partial<BaselineMetrics>,
  initialDemoTime: string,
): void {
  if (baseline.avgSleepMinutes != null && record.sleep) {
    const totalMinutes = baseline.avgSleepMinutes;
    const previousTotal = record.sleep.totalMinutes || totalMinutes;
    const ratio = previousTotal > 0 ? totalMinutes / previousTotal : 1;
    const deep = Math.round(record.sleep.stages.deep * ratio);
    const rem = Math.round(record.sleep.stages.rem * ratio);
    const awake = Math.max(1, Math.round(record.sleep.stages.awake * ratio));
    const light = Math.max(0, totalMinutes - deep - rem - awake);
    const wake = parseWakeTime(initialDemoTime);
    const wakeMinutes = wake.hour * 60 + wake.min;
    const bedMinutes = (wakeMinutes - totalMinutes + 24 * 60) % (24 * 60);
    record.sleep = {
      ...record.sleep,
      totalMinutes,
      stages: { deep, light, rem, awake },
      score: Math.max(5, Math.min(98, Math.round((totalMinutes / 480) * 90))),
      startTime: `${String(Math.floor(bedMinutes / 60)).padStart(2, '0')}:${String(bedMinutes % 60).padStart(2, '0')}`,
      endTime: `${String(wake.hour).padStart(2, '0')}:${String(wake.min).padStart(2, '0')}`,
    };
  }
  if (baseline.hrv != null) record.hrv = baseline.hrv;
  if (baseline.spo2 != null) record.spo2 = baseline.spo2;
  if (baseline.avgSteps != null && record.activity) {
    record.activity = { ...record.activity, steps: baseline.avgSteps };
  }
  if (baseline.restingHr != null && record.hr && record.hr.length >= 2) {
    const delta = baseline.restingHr - record.hr[1]!;
    record.hr = record.hr.map((value) => Math.round(value + delta));
  }
}

function generateInitialSegments(
  profile: SandboxProfile,
  initialDemoTime: string,
  avgSleepMinutes = profile.baseline.avgSleepMinutes,
): ActivitySegment[] {
  const script = generateTimelineScript(
    profile.profileId,
    initialDemoTime.slice(0, 10),
    initialDemoTime,
    deriveSleepConfig(avgSleepMinutes, parseWakeTime(initialDemoTime)),
  );
  return structuredClone(script.segments) as ActivitySegment[];
}

export class SessionProfileManager {
  private readonly originalSnapshots = new Map<string, SessionProfileSnapshot>();

  constructor(
    private readonly profiles: Map<string, SessionProfileState>,
    private readonly overrideStore: OverrideStoreService,
    private readonly onProfilesChanged: () => void,
  ) {
    this.refreshOriginalSnapshots();
  }

  refreshOriginalSnapshots(): void {
    this.originalSnapshots.clear();
    for (const [profileId, state] of this.profiles) {
      this.originalSnapshots.set(profileId, { state: cloneState(state) });
    }
  }

  updateProfile(profileId: string, changes: UpdateProfilePayload) {
    const state = this.requireState(profileId);
    const previous = state.data.profile;
    const candidate = structuredClone(previous);

    if (changes.name !== undefined) candidate.name = { zh: changes.name, en: changes.name };
    if (changes.age !== undefined) candidate.age = changes.age;
    if (changes.gender !== undefined) candidate.gender = changes.gender;
    if (changes.avatar !== undefined) candidate.avatar = changes.avatar;
    if (changes.tags !== undefined)
      candidate.tags = changes.tags.map((tag) => ({ zh: tag, en: tag }));
    if (changes.baseline !== undefined)
      candidate.baseline = { ...candidate.baseline, ...changes.baseline };
    if (changes.weeklyBaseline !== undefined) {
      candidate.weeklyBaseline = { ...candidate.weeklyBaseline, ...changes.weeklyBaseline };
    }
    if (changes.dailyBaseline !== undefined) {
      candidate.dailyBaseline = { ...candidate.dailyBaseline, ...changes.dailyBaseline };
    }

    const parsed = SandboxProfileSchema.safeParse(candidate);
    if (!parsed.success) {
      throw Object.assign(new Error(parsed.error.issues.map((issue) => issue.message).join('; ')), {
        statusCode: 422,
      });
    }

    const baselineChanged = baselinesDiffer(previous.baseline, parsed.data.baseline);
    const weeklyChanged = baselinesDiffer(previous.weeklyBaseline, parsed.data.weeklyBaseline);
    const dailyChanged = baselinesDiffer(previous.dailyBaseline, parsed.data.dailyBaseline);
    const regenerated = baselineChanged || weeklyChanged || dailyChanged;
    let records = state.data.records;

    if (baselineChanged) {
      const range = getDateRange(31);
      records = generateHistory(
        buildProfileConfig(parsed.data),
        range.startDate,
        range.endDate,
      ).records;
    } else {
      if (weeklyChanged) {
        const range = getDateRange(7);
        const profile = {
          ...parsed.data,
          baseline: { ...parsed.data.baseline, ...parsed.data.weeklyBaseline },
        };
        const generated = generateHistory(
          buildProfileConfig(profile),
          range.startDate,
          range.endDate,
        ).records;
        records = patchHistory(records, generated);
      }
      if (dailyChanged) {
        const range = getDateRange(1);
        const profile = {
          ...parsed.data,
          baseline: { ...parsed.data.baseline, ...parsed.data.dailyBaseline },
        };
        const generated = generateHistory(
          buildProfileConfig(profile),
          range.startDate,
          range.endDate,
        ).records;
        if (generated[0] && parsed.data.dailyBaseline) {
          patchRecordWithDailyBaseline(
            generated[0],
            parsed.data.dailyBaseline,
            state.initialDemoTime,
          );
        }
        records = patchHistory(records, generated);
      }
    }

    state.data = { ...state.data, profile: parsed.data, records };
    if (baselineChanged || dailyChanged) {
      const avgSleepMinutes =
        dailyChanged && !baselineChanged
          ? (parsed.data.dailyBaseline?.avgSleepMinutes ?? parsed.data.baseline.avgSleepMinutes)
          : parsed.data.baseline.avgSleepMinutes;
      state.initialSegments = generateInitialSegments(
        parsed.data,
        state.initialDemoTime,
        avgSleepMinutes,
      );
      this.resetTimeline(profileId);
    }
    this.onProfilesChanged();
    return { profile: structuredClone(parsed.data), regenerated };
  }

  cloneProfile(sourceProfileId: string, newProfileId: string, overrides?: CloneProfileOverrides) {
    if (this.profiles.has(newProfileId)) {
      throw Object.assign(new Error(`Profile '${newProfileId}' already exists`), {
        statusCode: 409,
      });
    }
    const source = this.requireState(sourceProfileId);
    const profile = structuredClone(source.data.profile);
    profile.profileId = newProfileId;
    if (overrides?.name !== undefined) profile.name = { zh: overrides.name, en: overrides.name };
    if (overrides?.age !== undefined) profile.age = overrides.age;
    if (overrides?.gender !== undefined) profile.gender = overrides.gender;
    if (overrides?.avatar !== undefined) profile.avatar = overrides.avatar;
    if (overrides?.tags !== undefined)
      profile.tags = overrides.tags.map((tag) => ({ zh: tag, en: tag }));
    if (overrides?.baseline !== undefined)
      profile.baseline = { ...profile.baseline, ...overrides.baseline };
    const validated = SandboxProfileSchema.parse(profile);
    const range = getDateRange(31);
    const state: SessionProfileState = {
      data: {
        profile: validated,
        records: generateHistory(buildProfileConfig(validated), range.startDate, range.endDate)
          .records,
      },
      initialDemoTime: source.initialDemoTime,
      initialSegments: generateInitialSegments(validated, source.initialDemoTime),
    };
    this.profiles.set(newProfileId, state);
    this.originalSnapshots.set(newProfileId, { state: cloneState(state) });
    this.onProfilesChanged();
    return structuredClone(validated);
  }

  deleteProfile(profileId: string): void {
    if (this.profiles.size <= 1) {
      throw Object.assign(new Error('无法删除最后一个 profile'), { statusCode: 400 });
    }
    this.requireState(profileId);
    this.overrideStore.removeProfile(profileId);
    this.profiles.delete(profileId);
    this.originalSnapshots.delete(profileId);
    this.onProfilesChanged();
  }

  resetProfile(profileId: string) {
    this.requireState(profileId);
    const snapshot = this.originalSnapshots.get(profileId);
    if (!snapshot) {
      throw Object.assign(new Error(`Profile '${profileId}' 原始快照不存在`), { statusCode: 404 });
    }
    const restored = cloneState(snapshot.state);
    this.profiles.set(profileId, restored);
    this.resetTimeline(profileId);
    this.onProfilesChanged();
    return { profile: structuredClone(restored.data.profile), regenerated: true };
  }

  recalibrate(): void {
    const range = getDateRange(31);
    const offsets: Record<string, { hour: number; min: number }> = {
      'profile-a': { hour: 7, min: 5 },
      'profile-b': { hour: 7, min: 30 },
      'profile-c': { hour: 6, min: 45 },
      'profile-d': { hour: 7, min: 15 },
    };
    for (const [profileId, state] of this.profiles) {
      const offset = offsets[profileId] ?? { hour: 7, min: 0 };
      state.initialDemoTime = `${range.endDate}T${String(offset.hour).padStart(2, '0')}:${String(offset.min).padStart(2, '0')}`;
      state.data = {
        ...state.data,
        records: generateHistory(
          PROFILE_CONFIGS[profileId]
            ? {
                ...PROFILE_CONFIGS[profileId]!,
                baseline: { ...state.data.profile.baseline },
              }
            : buildProfileConfig(state.data.profile),
          range.startDate,
          range.endDate,
        ).records,
      };
      state.initialSegments = generateInitialSegments(state.data.profile, state.initialDemoTime);
      this.resetTimeline(profileId);
    }
    this.onProfilesChanged();
  }

  private resetTimeline(profileId: string): void {
    this.overrideStore.resetProfileTimeline(profileId);
    this.overrideStore.performSync(profileId, 'manual_refresh');
  }

  private requireState(profileId: string): SessionProfileState {
    const state = this.profiles.get(profileId);
    if (!state) {
      throw Object.assign(new Error(`Profile '${profileId}' not found`), { statusCode: 404 });
    }
    return state;
  }
}

export interface SessionSandbox {
  profiles: Map<string, ProfileData>;
  overrideStore: OverrideStoreService;
  profileManager: SessionProfileManager;
  getRawProfile(profileId: string): ProfileData;
}

export class SessionSandboxStore {
  private readonly sessions = new Map<string, SessionSandbox>();

  constructor(
    private readonly dataDir: string,
    private readonly getBaseProfiles: () => Map<string, ProfileData>,
  ) {}

  get(sessionId: string): SessionSandbox {
    const existing = this.sessions.get(sessionId);
    if (existing) return existing;

    const states = new Map<string, SessionProfileState>();
    for (const profileId of this.getBaseProfiles().keys()) {
      const initial = buildInitialProfileState(this.dataDir, profileId);
      states.set(profileId, {
        data: structuredClone(initial.profileData),
        initialDemoTime: initial.demoClock.currentTime,
        initialSegments: structuredClone(initial.segments),
      });
    }
    const defaultProfileId = states.keys().next().value as string | undefined;
    if (!defaultProfileId) throw new Error('No profiles available for session sandbox');

    const overrideStore = createOverrideStore(defaultProfileId, {
      getInitialState: (profileId) => {
        const state = states.get(profileId);
        if (!state)
          throw Object.assign(new Error(`Profile '${profileId}' not found`), { statusCode: 404 });
        return {
          clock: createDemoClock(profileId, state.initialDemoTime),
          segments: structuredClone(state.initialSegments),
        };
      },
    });
    const profiles = new Map<string, ProfileData>();
    const syncProfiles = () => {
      profiles.clear();
      for (const [profileId, state] of states) profiles.set(profileId, state.data);
    };
    syncProfiles();
    const profileManager = new SessionProfileManager(states, overrideStore, syncProfiles);
    const firstState = states.values().next().value as SessionProfileState | undefined;
    if (
      firstState &&
      firstState.initialDemoTime.slice(0, 10) !== new Date().toISOString().slice(0, 10)
    ) {
      profileManager.recalibrate();
      profileManager.refreshOriginalSnapshots();
    }

    const sandbox: SessionSandbox = {
      profiles,
      overrideStore,
      profileManager,
      getRawProfile(profileId: string) {
        const state = states.get(profileId);
        if (!state)
          throw Object.assign(new Error(`Profile '${profileId}' not found`), { statusCode: 404 });
        return state.data;
      },
    };
    this.sessions.set(sessionId, sandbox);
    return sandbox;
  }
}
