/**
 * 确定性历史数据生成器（CLI 入口）
 * 基于 seeded PRNG 生成指定日期范围的 DailyRecord 数据
 *
 * 用法:
 *   npx tsx data/generate-history.ts --profile profile-a --start 2026-03-22 --end 2026-04-22
 *   npx tsx data/generate-history.ts --profile all
 *
 * 默认日期范围：从当前日期向前推 30 天到当前日期（共 31 天）
 */

import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  generateHistory,
  PROFILE_CONFIGS,
  generateDateRange,
  type DailyRecord,
} from '../packages/sandbox/src/generators/history';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, 'sandbox');

function getDefaultDateRange(): { start: string; end: string } {
  const today = new Date();
  const end = today.toISOString().slice(0, 10);
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - 30);
  const start = startDate.toISOString().slice(0, 10);
  return { start, end };
}

function parseArgs(): { profile: string; start: string; end: string } {
  const args = process.argv.slice(2);
  let profile = 'all';
  let start: string | undefined;
  let end: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--profile' && args[i + 1]) {
      profile = args[i + 1]!;
      i++;
    } else if (args[i] === '--start' && args[i + 1]) {
      start = args[i + 1]!;
      i++;
    } else if (args[i] === '--end' && args[i + 1]) {
      end = args[i + 1]!;
      i++;
    }
  }

  const defaults = getDefaultDateRange();
  return {
    profile,
    start: start ?? defaults.start,
    end: end ?? defaults.end,
  };
}

/** 读取 profile JSON 中的 dailyBaseline，覆盖最后一天记录的抖动值 */
function patchLastRecordWithDailyBaseline(
  records: DailyRecord[],
  profilesDir: string,
  profileId: string,
  demoTime?: string,
): void {
  const profilePath = join(profilesDir, `${profileId}.json`);
  if (!existsSync(profilePath)) return;

  const profile = JSON.parse(readFileSync(profilePath, 'utf-8'));
  const dailyBaseline = profile.profile?.dailyBaseline ?? profile.dailyBaseline;
  if (!dailyBaseline || records.length === 0) return;

  const record = records[records.length - 1]!;

  // 保存 patch 前的 spo2 和 steps，用于后续 intraday 修正
  const oldSpo2 = record.spo2;
  const oldSteps = record.activity?.steps;

  // 睡眠：精确覆盖 totalMinutes 并按比例重算 stages
  if (dailyBaseline.avgSleepMinutes != null && record.sleep) {
    const exact = dailyBaseline.avgSleepMinutes;
    const old = record.sleep.totalMinutes || exact;
    const ratio = old > 0 ? exact / old : 1;
    const deep = Math.round(record.sleep.stages.deep * ratio);
    const rem = Math.round(record.sleep.stages.rem * ratio);
    const awake = Math.max(1, Math.round(record.sleep.stages.awake * ratio));
    const light = Math.max(0, exact - deep - rem - awake);

    // 从 demoTime 推导起床时间
    let wakeHour = 6;
    let wakeMin = 0;
    if (demoTime) {
      const timePart = demoTime.split('T')[1];
      if (timePart) {
        const [h, m] = timePart.split(':');
        wakeHour = parseInt(h!, 10);
        wakeMin = parseInt(m!, 10);
      }
    }
    const wakeTotalMin = wakeHour * 60 + wakeMin;
    let bedTotalMin = wakeTotalMin - exact;
    if (bedTotalMin < 0) bedTotalMin += 24 * 60;

    record.sleep = {
      ...record.sleep,
      totalMinutes: exact,
      stages: { deep, light, rem, awake },
      score: Math.max(5, Math.min(98, Math.round((exact / 480) * 90))),
      startTime: `${String(Math.floor(bedTotalMin / 60) % 24).padStart(2, '0')}:${String(bedTotalMin % 60).padStart(2, '0')}`,
      endTime: `${String(wakeHour).padStart(2, '0')}:${String(wakeMin).padStart(2, '0')}`,
    };
  }

  // HRV：直接覆盖
  if (dailyBaseline.hrv != null) {
    record.hrv = dailyBaseline.hrv;
  }

  // 静息心率：保持各采样点的相对偏移量不变，整体平移
  if (dailyBaseline.restingHr != null && record.hr && record.hr.length >= 2) {
    const oldResting = record.hr[1]!;
    const delta = dailyBaseline.restingHr - oldResting;
    record.hr = record.hr.map((v) => Math.round(v + delta));
  }

  // SpO2：直接覆盖
  if (dailyBaseline.spo2 != null) {
    record.spo2 = dailyBaseline.spo2;
  }

  // 步数：直接覆盖
  if (dailyBaseline.avgSteps != null && record.activity) {
    record.activity = { ...record.activity, steps: dailyBaseline.avgSteps };
  }

  // 同步修正 intraday 中的 spo2 和 steps
  if (record.intraday) {
    // spo2：以新的 dailyBaseline.spo2 为中心重新偏移
    if (dailyBaseline.spo2 != null && oldSpo2 != null) {
      const spo2Delta = dailyBaseline.spo2 - oldSpo2;
      for (const snap of record.intraday) {
        if (snap.spo2 != null) {
          snap.spo2 = Math.min(100, Math.max(90, snap.spo2 + spo2Delta));
        }
      }
    }
    // steps：按比例缩放累积步数
    if (dailyBaseline.avgSteps != null && oldSteps != null && oldSteps > 0) {
      const scale = dailyBaseline.avgSteps / oldSteps;
      for (const snap of record.intraday) {
        if (snap.steps != null) {
          snap.steps = Math.round(snap.steps * scale);
        }
      }
    }
  }
}

function main(): void {
  const { profile, start, end } = parseArgs();
  const profiles = profile === 'all'
    ? Object.keys(PROFILE_CONFIGS)
    : [profile];

  const outputDir = join(DATA_DIR, 'history');
  const profilesDir = join(DATA_DIR, 'profiles');
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  console.log(`[info] Generating history from ${start} to ${end} (${generateDateRange(start, end).length} days)`);

  for (const profileId of profiles) {
    const config = PROFILE_CONFIGS[profileId];
    if (!config) {
      console.error(`[error] 未知的 profile: ${profileId}`);
      process.exit(1);
    }

    const history = generateHistory(config, start, end);

    // 读取 profile JSON 获取 dailyBaseline 和 initialDemoTime
    const profilePath = join(profilesDir, `${profileId}.json`);
    let demoTime: string | undefined;
    if (existsSync(profilePath)) {
      const profileJson = JSON.parse(readFileSync(profilePath, 'utf-8'));
      demoTime = profileJson.initialDemoTime;
      patchLastRecordWithDailyBaseline(history.records, profilesDir, profileId, demoTime);
    }

    const outputPath = join(outputDir, `${profileId}-daily-records.json`);
    writeFileSync(outputPath, JSON.stringify(history, null, 2) + '\n', 'utf-8');
    console.log(`[ok] ${profileId}: ${history.records.length} records -> ${outputPath}`);
  }
}

main();
