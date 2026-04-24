/**
 * 确定性历史数据生成器核心逻辑
 * 基于 seeded PRNG 生成指定日期范围的 DailyRecord 数据
 */

// --- 类型定义 ---

interface SleepStages {
  deep: number;
  light: number;
  rem: number;
  awake: number;
}

interface SleepData {
  totalMinutes: number;
  startTime: string;
  endTime: string;
  stages: SleepStages;
  score: number;
}

interface ActivityData {
  steps: number;
  calories: number;
  activeMinutes: number;
  distanceKm: number;
}

interface StressData {
  load: number;
}

interface IntradaySnapshot {
  hour: number;
  hr?: number;
  spo2?: number;
  steps?: number;
  sleepMinutes?: number;
  stressLoad?: number;
}

export interface DailyRecord {
  date: string;
  hr?: number[];
  sleep?: SleepData;
  activity?: ActivityData;
  spo2?: number;
  stress?: StressData;
  intraday?: IntradaySnapshot[];
}

export interface HistoryFile {
  profileId: string;
  dateRange: { start: string; end: string };
  records: DailyRecord[];
}

export interface ProfileBaseline {
  restingHr: number;
  hrv: number;
  spo2: number;
  avgSleepMinutes: number;
  avgSteps: number;
}

export interface ProfileConfig {
  profileId: string;
  seed: number;
  baseline: ProfileBaseline;
  missingRate: {
    hr: number;
    activity: number;
    spo2: number;
  };
  trend: {
    stressDirection: number;
    sleepDirection: number;
    hrDirection: number;
  };
}

// --- seeded PRNG (mulberry32) ---

function mulberry32(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- 工具函数 ---

function randInt(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function jittered(rng: () => number, baseline: number, range: number): number {
  return baseline + randInt(rng, -range, range);
}

/** 生成日期范围数组 */
export function generateDateRange(startStr: string, endStr: string): string[] {
  const dates: string[] = [];
  const start = new Date(startStr + 'T00:00:00');
  const end = new Date(endStr + 'T00:00:00');
  const current = new Date(start);
  while (current <= end) {
    dates.push(current.toISOString().slice(0, 10));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

// --- Profile 配置 ---

export const PROFILE_CONFIGS: Record<string, ProfileConfig> = {
  'profile-a': {
    profileId: 'profile-a',
    seed: 42,
    baseline: { restingHr: 58, hrv: 68, spo2: 99, avgSleepMinutes: 465, avgSteps: 9500 },
    missingRate: { hr: 0, activity: 0, spo2: 0 },
    trend: { stressDirection: 0, sleepDirection: 0, hrDirection: 0 },
  },
  'profile-b': {
    profileId: 'profile-b',
    seed: 137,
    baseline: { restingHr: 74, hrv: 38, spo2: 96, avgSleepMinutes: 330, avgSteps: 4800 },
    missingRate: { hr: 0.15, activity: 0.15, spo2: 0.1 },
    trend: { stressDirection: 0.5, sleepDirection: -1.5, hrDirection: 0 },
  },
  'profile-c': {
    profileId: 'profile-c',
    seed: 256,
    baseline: { restingHr: 82, hrv: 25, spo2: 94, avgSleepMinutes: 210, avgSteps: 2200 },
    missingRate: { hr: 0, activity: 0, spo2: 0 },
    trend: { stressDirection: 1.5, sleepDirection: -5, hrDirection: 0.5 },
  },
};

// --- 数据生成 ---

function generateHr(rng: () => number, baseline: ProfileBaseline, dayIndex: number, trend: number): number[] {
  const trendOffset = Math.round(dayIndex * trend);
  const resting = jittered(rng, baseline.restingHr + trendOffset, 3);
  const lowest = resting - randInt(rng, 4, 12);
  const avg = resting + randInt(rng, 5, 15);
  const peak = resting + randInt(rng, 40, 80);
  const recovery = resting + randInt(rng, 2, 10);
  return [lowest, resting, avg, peak, recovery];
}

function generateSleep(rng: () => number, baseline: ProfileBaseline, dayIndex: number, trend: number): SleepData {
  const trendOffset = Math.round(dayIndex * trend);
  const totalMinutes = Math.max(60, jittered(rng, baseline.avgSleepMinutes + trendOffset, 30));

  const deepRatio = 0.18 + rng() * 0.06;
  const remRatio = 0.2 + rng() * 0.05;
  const awakeRatio = 0.06 + rng() * 0.06;
  const lightRatio = 1 - deepRatio - remRatio - awakeRatio;

  const deep = Math.round(totalMinutes * deepRatio);
  const rem = Math.round(totalMinutes * remRatio);
  const awake = Math.round(totalMinutes * awakeRatio);
  const light = totalMinutes - deep - rem - awake;

  const baseScore = Math.round((totalMinutes / 480) * 90);
  const score = Math.max(5, Math.min(98, baseScore + randInt(rng, -5, 5)));

  const wakeHour = baseline.avgSleepMinutes >= 400 ? 6 : (baseline.avgSleepMinutes >= 280 ? 6 : 6);
  const wakeMin = baseline.avgSleepMinutes >= 400 ? randInt(rng, 10, 15) : (baseline.avgSleepMinutes >= 280 ? randInt(rng, 0, 10) : randInt(rng, 0, 5));
  const wakeTotalMin = wakeHour * 60 + wakeMin;
  const bedTotalMin = wakeTotalMin - totalMinutes;

  const adjustedBedMin = bedTotalMin < 0 ? bedTotalMin + 24 * 60 : bedTotalMin;
  const bedHour = Math.floor(adjustedBedMin / 60) % 24;
  const bedMinute = adjustedBedMin % 60;

  const startTime = `${String(bedHour).padStart(2, '0')}:${String(bedMinute).padStart(2, '0')}`;
  const endTime = `${String(wakeHour).padStart(2, '0')}:${String(wakeMin).padStart(2, '0')}`;

  return {
    totalMinutes,
    startTime,
    endTime,
    stages: { deep, light, rem, awake },
    score,
  };
}

function generateActivity(rng: () => number, baseline: ProfileBaseline): ActivityData {
  const steps = Math.max(500, jittered(rng, baseline.avgSteps, Math.round(baseline.avgSteps * 0.2)));
  const calories = Math.round(1400 + steps * 0.12 + rng() * 100);
  const activeMinutes = Math.round(steps / 200 + rng() * 5);
  const distanceKm = Math.round((steps * 0.0007 + rng() * 0.5) * 10) / 10;
  return { steps, calories, activeMinutes, distanceKm };
}

function generateStress(rng: () => number, baseline: ProfileBaseline, dayIndex: number, trend: number): StressData {
  const trendOffset = Math.round(dayIndex * trend);
  const baseStress = baseline.hrv > 50 ? 25 : (baseline.hrv > 35 ? 50 : 70);
  const load = Math.max(10, Math.min(99, Math.round(jittered(rng, baseStress + trendOffset, 8))));
  return { load };
}

/** 生成分时快照（每2小时一个窗口，共12个） */
function generateIntraday(
  rng: () => number,
  baseline: ProfileBaseline,
  sleep: SleepData,
  activity: ActivityData | undefined,
  spo2: number | undefined,
  stress: StressData,
): IntradaySnapshot[] {
  const snapshots: IntradaySnapshot[] = [];

  // 解析睡眠开始/结束时间
  const [bedHour, bedMin] = sleep.startTime.split(':').map(Number);
  const [wakeHour, wakeMin] = sleep.endTime.split(':').map(Number);
  const bedTotalMin = (bedHour! * 60 + bedMin!) % (24 * 60);
  const wakeTotalMin = wakeHour! * 60 + wakeMin!;
  const sleepStart = bedTotalMin;
  const sleepEnd = wakeTotalMin < sleepStart ? wakeTotalMin + 24 * 60 : wakeTotalMin;

  for (let hour = 0; hour < 24; hour += 2) {
    const windowStart = hour * 60;
    const windowEnd = (hour + 2) * 60;

    // 心率：基于基线，白天较高，夜间较低
    const isNight = hour >= 22 || hour < 6;
    const hrBase = isNight ? baseline.restingHr - 5 : baseline.restingHr + randInt(rng, 5, 25);
    const hr = Math.max(45, Math.min(180, jittered(rng, hrBase, 8)));

    // 血氧
    const spo2Value = spo2 != null ? Math.min(100, jittered(rng, spo2, 1)) : undefined;

    // 步数：累积值，白天递增
    const dayProgress = hour / 24;
    const stepsValue = activity != null
      ? Math.round(activity.steps * dayProgress * dayProgress)
      : undefined;

    // 睡眠分钟数：计算与睡眠窗口的重叠
    let sleepMinutes = 0;
    if (sleepStart < sleepEnd) {
      const overlapStart = Math.max(sleepStart, windowStart);
      const overlapEnd = Math.min(sleepEnd, windowEnd);
      sleepMinutes = Math.max(0, overlapEnd - overlapStart);
    }

    // 压力
    const stressValue = stress.load;

    snapshots.push({
      hour,
      hr: Math.round(hr),
      ...(spo2Value !== undefined ? { spo2: Math.round(spo2Value) } : {}),
      ...(stepsValue !== undefined ? { steps: stepsValue } : {}),
      ...(sleepMinutes > 0 ? { sleepMinutes: Math.round(sleepMinutes) } : {}),
      stressLoad: Math.round(stressValue),
    });
  }

  return snapshots;
}

/** 生成单个 profile 的完整历史数据 */
export function generateHistory(config: ProfileConfig, startDate: string, endDate: string): HistoryFile {
  const dates = generateDateRange(startDate, endDate);
  const rng = mulberry32(config.seed);

  const records: DailyRecord[] = dates.map((date, dayIndex) => {
    const record: DailyRecord = { date };

    if (rng() >= config.missingRate.hr) {
      record.hr = generateHr(rng, config.baseline, dayIndex, config.trend.hrDirection);
    }

    record.sleep = generateSleep(rng, config.baseline, dayIndex, config.trend.sleepDirection);

    if (rng() >= config.missingRate.activity) {
      record.activity = generateActivity(rng, config.baseline);
    }

    if (rng() >= config.missingRate.spo2) {
      record.spo2 = Math.max(90, Math.min(100, jittered(rng, config.baseline.spo2, 2)));
    }

    record.stress = generateStress(rng, config.baseline, dayIndex, config.trend.stressDirection);

    // 生成分时数据
    record.intraday = generateIntraday(
      rng,
      config.baseline,
      record.sleep,
      record.activity,
      record.spo2,
      record.stress,
    );

    return record;
  });

  return {
    profileId: config.profileId,
    dateRange: { start: dates[0]!, end: dates[dates.length - 1]! },
    records,
  };
}

/** 根据 SandboxProfile 构建用于 generateHistory 的 ProfileConfig */
export function buildProfileConfig(profile: { profileId: string; baseline: ProfileBaseline }): ProfileConfig {
  // 基于字符串哈希生成确定性 seed
  let hash = 0;
  for (let i = 0; i < profile.profileId.length; i++) {
    hash = ((hash << 5) - hash) + profile.profileId.charCodeAt(i);
    hash = hash & hash; // 转为 32 位整数
  }
  return {
    profileId: profile.profileId,
    seed: Math.abs(hash),
    baseline: { ...profile.baseline },
    missingRate: { hr: 0, activity: 0, spo2: 0 },
    trend: { stressDirection: 0, sleepDirection: 0, hrDirection: 0 },
  };
}
