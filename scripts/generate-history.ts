/**
 * generate-history.ts
 * 为指定的 profile 生成 30 天的 DailyRecord 历史数据。
 *
 * 用法: npx tsx scripts/generate-history.ts <profileId>
 * 示例: npx tsx scripts/generate-history.ts profile-a
 */

import * as fs from "fs";
import * as path from "path";

// ─── 类型定义 ───────────────────────────────────────────────

interface IntradayPoint {
  hour: number;
  hr?: number;
  spo2?: number;
  steps?: number;
  sleepMinutes?: number;
  stressLoad?: number;
}

interface DailyRecord {
  date: string;
  hr: number[];
  sleep: {
    totalMinutes: number;
    startTime: string;
    endTime: string;
    stages: { deep: number; light: number; rem: number; awake: number };
    score: number;
  };
  activity: {
    steps: number;
    calories: number;
    activeMinutes: number;
    distanceKm: number;
  };
  spo2: number;
  stress: { load: number };
  intraday: IntradayPoint[];
}

interface HistoryFile {
  profileId: string;
  dateRange: { start: string; end: string };
  records: DailyRecord[];
}

// ─── 确定性伪随机数生成器 (Mulberry32) ──────────────────────

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 将字符串转为数字种子
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash);
}

// ─── 工具函数 ───────────────────────────────────────────────

/** 在 [min, max] 范围内生成确定性随机整数 */
function randInt(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

/** 在 [min, max] 范围内生成确定性随机浮点数，保留一位小数 */
function randFloat(rng: () => number, min: number, max: number): number {
  return Math.round((rng() * (max - min) + min) * 10) / 10;
}

/** 生成 HH:mm 格式的时间字符串 */
function randTime(rng: () => number, hourMin: number, hourMax: number, minuteMin: number, minuteMax: number): string {
  const h = randInt(rng, hourMin, hourMax);
  const m = randInt(rng, minuteMin, minuteMax);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** 日期加一天 */
function addDay(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

// ─── 各 Profile 的参数配置 ─────────────────────────────────

interface ProfileConfig {
  // hr[] 的 5 个范围: [静息最低, 静息最高, 日均最低, 运动峰值最低, 恢复最低]
  hrRanges: [number, number][];
  sleep: {
    totalMinutes: [number, number];
    score: [number, number];
    deep: [number, number];
    awake: [number, number];
  };
  activity: {
    steps: [number, number];
    calories: [number, number];
    activeMinutes: [number, number];
    distanceKm: [number, number];
  };
  spo2: [number, number];
  stressLoad: [number, number];
  intraday: {
    sleepHr: [number, number];    // 夜间心率范围
    dayHr: [number, number];      // 白天心率范围
    nightSpo2?: [number, number]; // 夜间 SpO2（仅 Profile B 需要特殊处理）
  };
}

const PROFILE_CONFIGS: Record<string, ProfileConfig> = {
  "profile-a": {
    // 林巅峰 - 巅峰表现型
    hrRanges: [[43, 60], [55, 62], [60, 75], [100, 145], [60, 72]],
    sleep: { totalMinutes: [435, 495], score: [77, 98], deep: [80, 120], awake: [25, 60] },
    activity: { steps: [7500, 12000], calories: [2340, 2800], activeMinutes: [40, 60], distanceKm: [5.5, 8.5] },
    spo2: [97, 100],
    stressLoad: [17, 33],
    intraday: { sleepHr: [45, 62], dayHr: [57, 90] },
  },
  "profile-b": {
    // 赵沉睡 - 低效睡眠型
    hrRanges: [[65, 80], [68, 78], [65, 90], [80, 100], [65, 78]],
    sleep: { totalMinutes: [450, 510], score: [40, 65], deep: [30, 60], awake: [60, 120] },
    activity: { steps: [2000, 4000], calories: [1800, 2200], activeMinutes: [10, 25], distanceKm: [1.5, 3.0] },
    spo2: [90, 96],
    stressLoad: [50, 75],
    intraday: { sleepHr: [65, 78], dayHr: [68, 90], nightSpo2: [90, 94] },
  },
  "profile-c": {
    // 孙焦虑 - 焦虑耗竭型
    hrRanges: [[72, 85], [85, 115], [78, 105], [80, 110], [70, 82]],
    sleep: { totalMinutes: [280, 380], score: [30, 55], deep: [20, 50], awake: [50, 100] },
    activity: { steps: [2500, 5000], calories: [2000, 2400], activeMinutes: [15, 35], distanceKm: [2.0, 4.0] },
    spo2: [96, 99],
    stressLoad: [60, 85],
    intraday: { sleepHr: [72, 80], dayHr: [85, 110] },
  },
  "profile-d": {
    // 周社交 - 社交运动型
    hrRanges: [[55, 68], [60, 70], [60, 70], [140, 165], [60, 75]],
    sleep: { totalMinutes: [360, 480], score: [45, 70], deep: [50, 80], awake: [40, 80] },
    activity: { steps: [6000, 12000], calories: [2200, 2800], activeMinutes: [30, 65], distanceKm: [4.5, 9.0] },
    spo2: [95, 99],
    stressLoad: [30, 55],
    intraday: { sleepHr: [55, 68], dayHr: [60, 90] },
  },
};

// ─── 生成单条 DailyRecord ──────────────────────────────────

function generateDailyRecord(
  profileId: string,
  date: string,
  dayIndex: number,
  config: ProfileConfig
): DailyRecord {
  // 以 profileId + dayIndex 为种子，保证确定性
  const seed = hashString(`${profileId}-day-${dayIndex}`);
  const rng = mulberry32(seed);

  // hr: 5 个值
  const hr = config.hrRanges.map(([min, max]) => randInt(rng, min, max));

  // sleep
  const totalMinutes = randInt(rng, config.sleep.totalMinutes[0], config.sleep.totalMinutes[1]);
  const deep = randInt(rng, config.sleep.deep[0], config.sleep.deep[1]);
  const awake = randInt(rng, config.sleep.awake[0], config.sleep.awake[1]);
  const remaining = totalMinutes - deep - awake;
  const rem = randInt(rng, Math.max(20, Math.floor(remaining * 0.2)), Math.floor(remaining * 0.5));
  const light = totalMinutes - deep - awake - rem;
  const score = randInt(rng, config.sleep.score[0], config.sleep.score[1]);

  // 睡眠起止时间
  const startHour = randInt(rng, 22, 23);
  const startMinute = randInt(rng, 0, 59);
  const endMinute = startMinute + totalMinutes;
  const endHourRaw = startHour + Math.floor(endMinute / 60);
  const endHour = endHourRaw >= 24 ? endHourRaw - 24 : endHourRaw;
  const endMinFinal = endMinute % 60;

  const startTime = `${String(startHour).padStart(2, "0")}:${String(startMinute).padStart(2, "0")}`;
  const endTime = `${String(endHour).padStart(2, "0")}:${String(Math.min(endMinFinal, 59)).padStart(2, "0")}`;

  // activity
  const steps = randInt(rng, config.activity.steps[0], config.activity.steps[1]);
  const calories = randInt(rng, config.activity.calories[0], config.activity.calories[1]);
  const activeMinutes = randInt(rng, config.activity.activeMinutes[0], config.activity.activeMinutes[1]);
  const distanceKm = randFloat(rng, config.activity.distanceKm[0], config.activity.distanceKm[1]);

  // spo2
  const spo2 = randInt(rng, config.spo2[0], config.spo2[1]);

  // stress
  const stressLoad = randInt(rng, config.stressLoad[0], config.stressLoad[1]);

  // intraday: 12 个数据点 (hour 0,2,4,...,22)
  const hours = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22];
  const totalSteps = steps;

  // 生成 12 个小时的步数分布（递增模式）
  const stepWeights = [0.0, 0.005, 0.02, 0.05, 0.1, 0.15, 0.17, 0.15, 0.13, 0.1, 0.07, 0.055];
  let cumulativeSteps = 0;
  const intraday: IntradayPoint[] = hours.map((hour, idx) => {
    const isSleepHour = hour <= 4 || hour >= 22;
    const isEvening = hour >= 20;

    // 心率: 夜间用睡眠范围，白天用白天范围
    const hrRange = isSleepHour ? config.intraday.sleepHr : config.intraday.dayHr;
    const intradayHr = randInt(rng, hrRange[0], hrRange[1]);

    // SpO2: Profile B 夜间 SpO2 特殊处理
    let intradaySpo2: number;
    if (config.intraday.nightSpo2 && (isSleepHour || hour === 6)) {
      intradaySpo2 = randInt(rng, config.intraday.nightSpo2[0], config.intraday.nightSpo2[1]);
    } else {
      intradaySpo2 = randInt(rng, config.spo2[0], config.spo2[1]);
    }

    // 步数: 按权重递增
    cumulativeSteps += Math.round(stepWeights[idx] * totalSteps);
    const hourSteps = Math.min(cumulativeSteps, totalSteps);

    const point: IntradayPoint = {
      hour,
      hr: intradayHr,
      spo2: intradaySpo2,
      steps: hourSteps,
      stressLoad,
    };

    // 仅在 hour 20, 22 出现 sleepMinutes
    if (hour === 20) {
      point.sleepMinutes = randInt(rng, 30, 60);
    } else if (hour === 22) {
      point.sleepMinutes = randInt(rng, 60, 120);
    }

    return point;
  });

  return {
    date,
    hr,
    sleep: {
      totalMinutes,
      startTime,
      endTime,
      stages: { deep, light: Math.max(light, 0), rem, awake },
      score,
    },
    activity: {
      steps,
      calories,
      activeMinutes,
      distanceKm,
    },
    spo2,
    stress: { load: stressLoad },
    intraday,
  };
}

// ─── 主函数 ────────────────────────────────────────────────

function main() {
  const profileId = process.argv[2];
  if (!profileId) {
    console.error("用法: npx tsx scripts/generate-history.ts <profileId>");
    console.error("示例: npx tsx scripts/generate-history.ts profile-a");
    process.exit(1);
  }

  const config = PROFILE_CONFIGS[profileId];
  if (!config) {
    console.error(`未知的 profileId: ${profileId}`);
    console.error(`可选值: ${Object.keys(PROFILE_CONFIGS).join(", ")}`);
    process.exit(1);
  }

  // 日期范围: 2026-03-25 ~ 2026-04-24（30 天）
  const startDate = "2026-03-25";
  const endDate = "2026-04-24";
  const records: DailyRecord[] = [];

  let currentDate = startDate;
  let dayIndex = 0;
  while (currentDate <= endDate) {
    records.push(generateDailyRecord(profileId, currentDate, dayIndex, config));
    currentDate = addDay(currentDate);
    dayIndex++;
  }

  const output: HistoryFile = {
    profileId,
    dateRange: { start: startDate, end: endDate },
    records,
  };

  // 写入文件
  const outputDir = path.resolve(__dirname, "../data/sandbox/history");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  const outputPath = path.join(outputDir, `${profileId}-daily-records.json`);
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2) + "\n", "utf-8");

  console.log(`已生成 ${records.length} 条记录 -> ${outputPath}`);
  console.log(`日期范围: ${startDate} ~ ${endDate}`);
}

main();
