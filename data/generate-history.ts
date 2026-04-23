/**
 * 确定性历史数据生成器（CLI 入口）
 * 基于 seeded PRNG 生成指定日期范围 DailyRecord 数据
 *
 * 用法:
 *   npx tsx data/generate-history.ts --profile profile-a --start 2026-03-22 --end 2026-04-22
 *   npx tsx data/generate-history.ts --profile all
 *
 * 默认日期范围：从当前日期向前推 30 天到当前日期（共 31 天）
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  generateHistory,
  PROFILE_CONFIGS,
  generateDateRange,
  type ProfileConfig,
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

function main(): void {
  const { profile, start, end } = parseArgs();
  const profiles = profile === 'all'
    ? Object.keys(PROFILE_CONFIGS)
    : [profile];

  const outputDir = join(DATA_DIR, 'history');
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
    const outputPath = join(outputDir, `${profileId}-daily-records.json`);
    writeFileSync(outputPath, JSON.stringify(history, null, 2) + '\n', 'utf-8');
    console.log(`[ok] ${profileId}: ${history.records.length} records -> ${outputPath}`);
  }
}

main();
