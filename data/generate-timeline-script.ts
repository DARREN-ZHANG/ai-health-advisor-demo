/**
 * 确定性 Timeline Script 生成器（CLI 入口）
 * 为每个 profile 生成当前活动日的 baseline 片段
 *
 * 用法:
 *   npx tsx data/generate-timeline-script.ts --profile profile-a --date 2026-04-22
 *   npx tsx data/generate-timeline-script.ts --profile all
 *
 * 默认演示日：当前日期
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateTimelineScript, deriveSleepConfig } from '../packages/sandbox/src/generators/timeline-script';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, 'sandbox');

interface SlimProfile {
  profile: {
    profileId: string;
    baseline: {
      restingHr: number;
      hrv: number;
      spo2: number;
      avgSleepMinutes: number;
      avgSteps: number;
    };
    dailyBaseline?: {
      avgSleepMinutes?: number;
    };
  };
  initialDemoTime: string;
}

// 各 profile 的早间时间特征（小时:分钟）
const DEMO_TIME_OFFSETS: Record<string, { hour: number; min: number }> = {
  'profile-a': { hour: 7, min: 5 },
  'profile-b': { hour: 7, min: 30 },
  'profile-c': { hour: 6, min: 45 },
};

function readJson<T>(filePath: string): T {
  const raw = readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as T;
}

function getDefaultDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseArgs(): { profile: string; date: string } {
  const args = process.argv.slice(2);
  let profile = 'all';
  let date: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--profile' && args[i + 1]) {
      profile = args[i + 1]!;
      i++;
    } else if (args[i] === '--date' && args[i + 1]) {
      date = args[i + 1]!;
      i++;
    }
  }

  return { profile, date: date ?? getDefaultDate() };
}

const VALID_PROFILES = ['profile-a', 'profile-b', 'profile-c'];

function main(): void {
  const { profile, date } = parseArgs();
  const profiles = profile === 'all'
    ? VALID_PROFILES
    : [profile];

  const outputDir = join(DATA_DIR, 'timeline-scripts');
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  console.log(`[info] Generating timeline scripts for demo date: ${date}`);

  for (const profileId of profiles) {
    if (!VALID_PROFILES.includes(profileId)) {
      console.error(`[error] 未知的 profile: ${profileId}`);
      process.exit(1);
    }

    const offset = DEMO_TIME_OFFSETS[profileId] ?? { hour: 7, min: 0 };
    const initialDemoTime = `${date}T${String(offset.hour).padStart(2, '0')}:${String(offset.min).padStart(2, '0')}`;

    // 从 profile 文件读取实际 avgSleepMinutes
    const profilePath = join(DATA_DIR, 'profiles', `${profileId}.json`);
    const profileJson = existsSync(profilePath) ? readJson<SlimProfile>(profilePath) : undefined;
    const avgSleepMinutes = profileJson?.profile?.dailyBaseline?.avgSleepMinutes
      ?? profileJson?.profile.baseline.avgSleepMinutes
      ?? 420;
    const sleepConfig = deriveSleepConfig(avgSleepMinutes, { hour: offset.hour, min: offset.min });
    const script = generateTimelineScript(profileId, date, initialDemoTime, sleepConfig);
    const outputPath = join(outputDir, `${profileId}-day-1.json`);
    writeFileSync(outputPath, JSON.stringify(script, null, 2) + '\n', 'utf-8');
    console.log(`[ok] ${profileId}: ${script.segments.length} segments -> ${outputPath}`);
  }
}

main();
