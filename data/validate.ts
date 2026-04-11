/**
 * 数据验证脚本
 * 校验所有 profile 的 JSON schema、日期连续性和数据合理性
 *
 * 用法: npx tsx data/validate.ts
 */

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadManifest, loadAllProfiles } from '../packages/sandbox/src/loader';
import { generateDateRange } from '../packages/shared/src/utils/date-range';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, 'sandbox');

interface ValidationResult {
  profileId: string;
  name: string;
  recordCount: number;
  dateRange: { start: string; end: string };
  missingDates: string[];
  errors: string[];
}

function validateDateContinuity(
  records: { date: string }[],
  expectedStart: string,
  expectedEnd: string,
): string[] {
  const recordDates = new Set(records.map((r) => r.date));
  const expectedDates = generateDateRange(expectedStart, expectedEnd);
  return expectedDates.filter((d) => !recordDates.has(d));
}

function validate(): void {
  const manifest = loadManifest(DATA_DIR);
  const profiles = loadAllProfiles(DATA_DIR);
  const results: ValidationResult[] = [];

  let hasErrors = false;

  for (const entry of manifest.profiles) {
    const data = profiles.get(entry.profileId);
    if (!data) {
      hasErrors = true;
      results.push({
        profileId: entry.profileId,
        name: entry.name,
        recordCount: 0,
        dateRange: { start: 'N/A', end: 'N/A' },
        missingDates: [],
        errors: ['Profile data not found after loading'],
      });
      continue;
    }

    const dates = data.records.map((r) => r.date).sort();
    const start = dates[0]!;
    const end = dates[dates.length - 1]!;
    const missingDates = validateDateContinuity(data.records, '2026-03-28', '2026-04-10');
    const errors: string[] = [];

    if (data.records.length !== 14) {
      errors.push(`Expected 14 records, got ${data.records.length}`);
    }

    if (errors.length > 0) {
      hasErrors = true;
    }

    results.push({
      profileId: entry.profileId,
      name: entry.name,
      recordCount: data.records.length,
      dateRange: { start, end },
      missingDates,
      errors,
    });
  }

  // 输出结果
  for (const result of results) {
    const status = result.errors.length > 0 ? 'FAIL' : 'OK';
    const statusIcon = result.errors.length > 0 ? 'x' : '~';
    console.log(`[${statusIcon}] ${result.profileId} (${result.name}): ${status}`);
    console.log(
      `    Records: ${result.recordCount}, Range: ${result.dateRange.start} ~ ${result.dateRange.end}`,
    );

    if (result.missingDates.length > 0) {
      console.log(`    Missing dates: ${result.missingDates.join(', ')}`);
    }

    for (const error of result.errors) {
      console.log(`    ERROR: ${error}`);
    }
  }

  if (hasErrors) {
    console.log('\n~ Some validations failed!');
    process.exit(1);
  } else {
    console.log('\n~ All validations passed!');
  }
}

validate();
