/**
 * 确定性历史数据生成器
 * 基于 seeded PRNG 生成 20 天 DailyRecord 数据（2026-03-28 ~ 2026-04-16）
 *
 * 用法:
 *   npx tsx data/generate-history.ts --profile profile-a
 *   npx tsx data/generate-history.ts --profile all
 *
 * 特性:
 *   - 同一 seed + profile 参数始终产生相同输出
 *   - 基于 profile baseline 生成合理范围内的波动数据
 *   - profile-b 会模拟部分字段缺失（hr/activity/spo2）
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, 'sandbox');

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

interface DailyRecord {
  date: string;
  hr?: number[];
  sleep?: SleepData;
  activity?: ActivityData;
  spo2?: number;
  stress?: StressData;
}

interface HistoryFile {
  profileId: string;
  dateRange: { start: string; end: string };
  records: DailyRecord[];
}

interface ProfileBaseline {
  restingHr: number;
  hrv: number;
  spo2: number;
  avgSleepMinutes: number;
  avgSteps: number;
}

interface ProfileConfig {
  profileId: string;
  seed: number;
  baseline: ProfileBaseline;
  // 字段缺失概率（仅 profile-b 使用）
  missingRate: {
    hr: number;
    activity: number;
    spo2: number;
  };
  // 趋势方向：用于模拟渐进变化
  trend: {
    stressDirection: number;  // 正数 = 逐渐升高
    sleepDirection: number;   // 负数 = 逐渐减少
    hrDirection: number;      // 正数 = 逐渐升高
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

/** 在 [min, max] 范围内生成随机整数 */
function randInt(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

/** 在 baseline ± range 范围内生成带波动的值 */
function jittered(rng: () => number, baseline: number, range: number): number {
  return baseline + randInt(rng, -range, range);
}

/** 生成 HH:MM 格式时间（在 baseHour:baseMin 附近 ± jitterMin 分钟） */
function jitteredTime(rng: () => number, baseHour: number, baseMin: number, jitterMin: number): string {
  const totalBase = baseHour * 60 + baseMin;
  const offset = randInt(rng, -jitterMin, jitterMin);
  const total = Math.max(0, Math.min(23 * 60 + 59, totalBase + offset));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** 生成日期范围数组 */
function generateDateRange(startStr: string, endStr: string): string[] {
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

const PROFILE_CONFIGS: Record<string, ProfileConfig> = {
  'profile-a': {
    profileId: 'profile-a',
    seed: 42,
    baseline: { restingHr: 62, hrv: 60, spo2: 98, avgSleepMinutes: 450, avgSteps: 8500 },
    missingRate: { hr: 0, activity: 0, spo2: 0 },
    trend: { stressDirection: 0, sleepDirection: 0, hrDirection: 0 },
  },
  'profile-b': {
    profileId: 'profile-b',
    seed: 137,
    baseline: { restingHr: 72, hrv: 42, spo2: 96, avgSleepMinutes: 340, avgSteps: 5200 },
    missingRate: { hr: 0.15, activity: 0.15, spo2: 0.1 },
    trend: { stressDirection: 0.5, sleepDirection: -1.5, hrDirection: 0 },
  },
  'profile-c': {
    profileId: 'profile-c',
    seed: 256,
    baseline: { restingHr: 78, hrv: 30, spo2: 95, avgSleepMinutes: 240, avgSteps: 2800 },
    missingRate: { hr: 0, activity: 0, spo2: 0 },
    trend: { stressDirection: 1.5, sleepDirection: -5, hrDirection: 0.5 },
  },
};

// --- 数据生成 ---

/** 生成 5 个 HR 锚点 [最低, 静息附近, 平均, 运动峰值, 恢复] */
function generateHr(rng: () => number, baseline: ProfileBaseline, dayIndex: number, trend: number): number[] {
  const trendOffset = Math.round(dayIndex * trend);
  const resting = jittered(rng, baseline.restingHr + trendOffset, 3);
  const lowest = resting - randInt(rng, 4, 12);
  const avg = resting + randInt(rng, 5, 15);
  const peak = resting + randInt(rng, 40, 80);
  const recovery = resting + randInt(rng, 2, 10);
  return [lowest, resting, avg, peak, recovery];
}

/** 生成睡眠数据 */
function generateSleep(rng: () => number, baseline: ProfileBaseline, dayIndex: number, trend: number): SleepData {
  const trendOffset = Math.round(dayIndex * trend);
  const totalMinutes = Math.max(60, jittered(rng, baseline.avgSleepMinutes + trendOffset, 30));

  // 睡眠阶段分配比例
  const deepRatio = 0.18 + rng() * 0.06;
  const remRatio = 0.2 + rng() * 0.05;
  const awakeRatio = 0.06 + rng() * 0.06;
  const lightRatio = 1 - deepRatio - remRatio - awakeRatio;

  const deep = Math.round(totalMinutes * deepRatio);
  const rem = Math.round(totalMinutes * remRatio);
  const awake = Math.round(totalMinutes * awakeRatio);
  const light = totalMinutes - deep - rem - awake;

  // 睡眠评分：基于 totalMinutes 与 baseline 的比较
  const baseScore = Math.round((totalMinutes / 480) * 90);
  const score = Math.max(5, Math.min(98, baseScore + randInt(rng, -5, 5)));

  // 根据睡眠时长推算入睡和起床时间
  // 假设起床时间在 06:00-07:00 左右
  const wakeHour = baseline.avgSleepMinutes >= 400 ? 6 : (baseline.avgSleepMinutes >= 280 ? 6 : 6);
  const wakeMin = baseline.avgSleepMinutes >= 400 ? randInt(rng, 10, 15) : (baseline.avgSleepMinutes >= 280 ? randInt(rng, 0, 10) : randInt(rng, 0, 5));
  const wakeTotalMin = wakeHour * 60 + wakeMin;
  const bedTotalMin = wakeTotalMin - totalMinutes;

  // 处理跨天情况（如果 bedTotalMin 为负数，加 24 小时）
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

/** 生成活动数据 */
function generateActivity(rng: () => number, baseline: ProfileBaseline): ActivityData {
  const steps = Math.max(500, jittered(rng, baseline.avgSteps, Math.round(baseline.avgSteps * 0.2)));
  const calories = Math.round(1400 + steps * 0.12 + rng() * 100);
  const activeMinutes = Math.round(steps / 200 + rng() * 5);
  const distanceKm = Math.round((steps * 0.0007 + rng() * 0.5) * 10) / 10;
  return { steps, calories, activeMinutes, distanceKm };
}

/** 生成压力负荷值 */
function generateStress(rng: () => number, baseline: ProfileBaseline, dayIndex: number, trend: number): StressData {
  const trendOffset = Math.round(dayIndex * trend);
  // profile-a: 低压力 (~25), profile-b: 中等(~50), profile-c: 高压力(~70+)
  const baseStress = baseline.hrv > 50 ? 25 : (baseline.hrv > 35 ? 50 : 70);
  const load = Math.max(10, Math.min(99, Math.round(jittered(rng, baseStress + trendOffset, 8))));
  return { load };
}

/** 生成单个 profile 的完整历史数据 */
function generateHistory(config: ProfileConfig): HistoryFile {
  const dates = generateDateRange('2026-03-28', '2026-04-16');
  const rng = mulberry32(config.seed);

  const records: DailyRecord[] = dates.map((date, dayIndex) => {
    const record: DailyRecord = { date };

    // HR 数据（profile-b 可缺失）
    if (rng() >= config.missingRate.hr) {
      record.hr = generateHr(rng, config.baseline, dayIndex, config.trend.hrDirection);
    }

    // 睡眠数据
    record.sleep = generateSleep(rng, config.baseline, dayIndex, config.trend.sleepDirection);

    // 活动数据（profile-b 可缺失）
    if (rng() >= config.missingRate.activity) {
      record.activity = generateActivity(rng, config.baseline);
    }

    // SpO2（profile-b 可缺失）
    if (rng() >= config.missingRate.spo2) {
      record.spo2 = Math.max(90, jittered(rng, config.baseline.spo2, 2));
    }

    // 压力数据
    record.stress = generateStress(rng, config.baseline, dayIndex, config.trend.stressDirection);

    return record;
  });

  return {
    profileId: config.profileId,
    dateRange: { start: dates[0]!, end: dates[dates.length - 1]! },
    records,
  };
}

// --- CLI 入口 ---

function parseArgs(): { profile: string } {
  const args = process.argv.slice(2);
  let profile = 'all';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--profile' && args[i + 1]) {
      profile = args[i + 1]!;
      i++;
    }
  }
  return { profile };
}

function main(): void {
  const { profile } = parseArgs();
  const profiles = profile === 'all'
    ? Object.keys(PROFILE_CONFIGS)
    : [profile];

  const outputDir = join(DATA_DIR, 'history');
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  for (const profileId of profiles) {
    const config = PROFILE_CONFIGS[profileId];
    if (!config) {
      console.error(`[error] 未知的 profile: ${profileId}`);
      process.exit(1);
    }

    const history = generateHistory(config);
    const outputPath = join(outputDir, `${profileId}-daily-records.json`);
    writeFileSync(outputPath, JSON.stringify(history, null, 2) + '\n', 'utf-8');
    console.log(`[ok] ${profileId}: ${history.records.length} records -> ${outputPath}`);
  }
}

main();
