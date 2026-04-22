/**
 * 确定性 Timeline Script 生成器
 * 为每个 profile 生成当前活动日的 baseline 片段
 *
 * 用法:
 *   npx tsx data/generate-timeline-script.ts --profile profile-a
 *   npx tsx data/generate-timeline-script.ts --profile all
 *
 * 特性:
 *   - 同一 seed + profile 参数始终产生相同输出
 *   - 生成的 baseline sleep 片段与 profile 的 initialDemoTime 一致
 *   - segment 时间区间无重叠
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, 'sandbox');

// --- 类型定义 ---

interface TimelineSegment {
  segmentId: string;
  type: string;
  start: string;
  end: string;
  params: Record<string, unknown>;
  source: string;
}

interface TimelineScript {
  profileId: string;
  scriptId: string;
  initialDemoTime: string;
  segments: TimelineSegment[];
}

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
  };
  initialDemoTime: string;
}

// --- 睡眠片段配置 ---

interface SleepConfig {
  bedHour: number;
  bedMin: number;
  wakeHour: number;
  wakeMin: number;
}

const SLEEP_CONFIGS: Record<string, SleepConfig> = {
  'profile-a': { bedHour: 22, bedMin: 30, wakeHour: 6, wakeMin: 30 },
  'profile-b': { bedHour: 23, bedMin: 0, wakeHour: 6, wakeMin: 0 },
  'profile-c': { bedHour: 1, bedMin: 0, wakeHour: 6, wakeMin: 0 },
};

// --- 工具函数 ---

function readJson<T>(filePath: string): T {
  const raw = readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as T;
}

function formatTimestamp(date: string, hour: number, minute: number): string {
  return `${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

// --- 生成逻辑 ---

function generateTimelineScript(profileId: string): TimelineScript {
  // 读取 profile 获取 initialDemoTime
  const profilePath = join(DATA_DIR, 'profiles', `${profileId}.json`);
  const profileData = readJson<SlimProfile>(profilePath);
  const initialDemoTime = profileData.initialDemoTime;

  // 提取 initialDemoTime 的日期部分（用于计算 sleep 的 end 日期）
  const demoDate = initialDemoTime.split('T')[0]!;

  // 获取睡眠配置
  const sleepConfig = SLEEP_CONFIGS[profileId];
  if (!sleepConfig) {
    throw new Error(`未找到 profile ${profileId} 的睡眠配置`);
  }

  // 睡眠片段：end 在 demoDate 当天，start 可能在前一天
  const sleepEnd = formatTimestamp(demoDate, sleepConfig.wakeHour, sleepConfig.wakeMin);

  // 计算入睡日期：如果 bedHour < 12 说明是凌晨入睡，在同一天；否则是前一天
  let sleepStartDate: string;
  if (sleepConfig.bedHour >= 12) {
    // 正常晚间入睡，日期是前一天
    const prevDate = new Date(demoDate + 'T00:00:00');
    prevDate.setDate(prevDate.getDate() - 1);
    sleepStartDate = prevDate.toISOString().slice(0, 10);
  } else {
    // 凌晨入睡（如 profile-c），日期与 demoDate 相同
    sleepStartDate = demoDate;
  }
  const sleepStart = formatTimestamp(sleepStartDate, sleepConfig.bedHour, sleepConfig.bedMin);

  // 通过解析 start/end 时间戳计算实际时长（分钟）
  const startMs = new Date(sleepStart).getTime();
  const endMs = new Date(sleepEnd).getTime();
  const durationMinutes = Math.round((endMs - startMs) / 60000);

  const segments: TimelineSegment[] = [
    {
      segmentId: `seg-baseline-sleep-${profileId.split('-')[1]}`,
      type: 'sleep',
      start: sleepStart,
      end: sleepEnd,
      params: { durationMinutes },
      source: 'baseline_script',
    },
  ];

  return {
    profileId,
    scriptId: `${profileId}-day-1`,
    initialDemoTime,
    segments,
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

const VALID_PROFILES = ['profile-a', 'profile-b', 'profile-c'];

function main(): void {
  const { profile } = parseArgs();
  const profiles = profile === 'all'
    ? VALID_PROFILES
    : [profile];

  const outputDir = join(DATA_DIR, 'timeline-scripts');
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  for (const profileId of profiles) {
    if (!VALID_PROFILES.includes(profileId)) {
      console.error(`[error] 未知的 profile: ${profileId}`);
      process.exit(1);
    }

    const script = generateTimelineScript(profileId);
    const outputPath = join(outputDir, `${profileId}-day-1.json`);
    writeFileSync(outputPath, JSON.stringify(script, null, 2) + '\n', 'utf-8');
    console.log(`[ok] ${profileId}: ${script.segments.length} segments -> ${outputPath}`);
  }
}

main();
