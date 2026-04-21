/**
 * 数据验证脚本
 * 校验所有 profile 的 JSON schema、日期连续性、数据合理性
 * 校验 fallback 文案的 schema 和引用正确性
 * 校验 scenario 定义的结构和引用正确性
 * 校验 prompt 文件的存在性
 *
 * 用法: npx tsx data/validate.ts
 */

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { loadManifest, loadAllProfiles } from '../packages/sandbox/src/loader';
import { generateDateRange } from '../packages/shared/src/utils/date-range';
import { isValidChartTokenId, CHART_TOKEN_IDS } from '../packages/shared/src/schemas/chart-token';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, 'sandbox');

// --- helpers ---

function readJson<T>(filePath: string): T {
  const raw = readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as T;
}

interface ProfileResult {
  profileId: string;
  name: string;
  recordCount: number;
  dateRange: { start: string; end: string };
  missingDates: string[];
  errors: string[];
}

// --- profile 校验 ---

function validateDateContinuity(
  records: { date: string }[],
  expectedStart: string,
  expectedEnd: string,
): string[] {
  const recordDates = new Set(records.map((r) => r.date));
  const expectedDates = generateDateRange(expectedStart, expectedEnd);
  return expectedDates.filter((d) => !recordDates.has(d));
}

function validateProfiles(): { results: ProfileResult[]; hasErrors: boolean } {
  const manifest = loadManifest(DATA_DIR);
  const profiles = loadAllProfiles(DATA_DIR);
  const results: ProfileResult[] = [];
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
    const missingDates = validateDateContinuity(data.records, '2026-03-28', '2026-04-16');
    const errors: string[] = [];

    if (data.records.length !== 20) {
      errors.push(`Expected 20 records, got ${data.records.length}`);
    }

    if (data.device) {
      if (data.device.samplingIntervalMinutes !== 1) {
        errors.push(`Expected device sampling interval to be 1, got ${data.device.samplingIntervalMinutes}`);
      }
      if (data.device.syncSessions.length === 0) {
        errors.push('Expected at least one device sync session');
      }
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

  return { results, hasErrors };
}

// --- fallback 校验 ---

function validateFallbacks(): { errors: string[]; hasErrors: boolean } {
  const errors: string[] = [];
  const fallbackDir = join(DATA_DIR, 'fallbacks');
  const manifest = loadManifest(DATA_DIR);
  const validProfileIds = new Set(manifest.profiles.map((p) => p.profileId));

  const expectedFiles = ['homepage.json', 'view-summary.json', 'advisor-chat.json'];

  for (const file of expectedFiles) {
    const filePath = join(fallbackDir, file);
    if (!existsSync(filePath)) {
      errors.push(`[fallback] Missing file: ${file}`);
      continue;
    }

    const content = readJson<Record<string, unknown>>(filePath);

    for (const [key, value] of Object.entries(content)) {
      const entry = value as Record<string, unknown>;

      // 校验结构字段
      if (typeof entry.summary !== 'string' || entry.summary.length === 0) {
        errors.push(`[fallback] ${file} → "${key}": missing or empty "summary"`);
      }

      if (!Array.isArray(entry.chartTokens)) {
        errors.push(`[fallback] ${file} → "${key}": "chartTokens" is not an array`);
      } else {
        // 校验 chartTokens 引用正确性
        for (const token of entry.chartTokens as string[]) {
          if (!isValidChartTokenId(token)) {
            errors.push(
              `[fallback] ${file} → "${key}": invalid chartToken "${token}" (valid: ${CHART_TOKEN_IDS.join(', ')})`,
            );
          }
        }
      }

      if (!Array.isArray(entry.microTips)) {
        errors.push(`[fallback] ${file} → "${key}": "microTips" is not an array`);
      }

      // homepage 和 advisor-chat 按 profileId 分 key，校验引用
      if (file === 'homepage.json' || file === 'advisor-chat.json') {
        if (!validProfileIds.has(key)) {
          errors.push(
            `[fallback] ${file} → key "${key}" is not a valid profileId (valid: ${[...validProfileIds].join(', ')})`,
          );
        }
      }

      // view-summary 按 tab 分 key，校验基本命名
      if (file === 'view-summary.json') {
        const validTabs = ['hrv', 'sleep', 'resting-hr', 'activity', 'spo2', 'stress'];
        if (!validTabs.includes(key)) {
          errors.push(
            `[fallback] ${file} → key "${key}" is not a valid DataTab (valid: ${validTabs.join(', ')})`,
          );
        }
      }
    }
  }

  return { errors, hasErrors: errors.length > 0 };
}

// --- scenario 校验 ---

function validateScenarios(): { errors: string[]; hasErrors: boolean } {
  const errors: string[] = [];
  const scenarioPath = join(DATA_DIR, 'scenarios', 'manifest.json');

  if (!existsSync(scenarioPath)) {
    return { errors: ['[scenario] Missing scenarios/manifest.json'], hasErrors: true };
  }

  const manifest = loadManifest(DATA_DIR);
  const validProfileIds = new Set(manifest.profiles.map((p) => p.profileId));
  const content = readJson<{
    version: string;
    scenarios: Array<{
      scenarioId: string;
      label: string;
      type: string;
      payload?: Record<string, unknown>;
      steps?: Array<{ label: string; action: string; payload: Record<string, unknown> }>;
    }>;
  }>(scenarioPath);

  const validTypes = ['profile_switch', 'event_inject', 'metric_override', 'reset', 'demo_script'];
  const scenarioIds = new Set<string>();

  for (const scenario of content.scenarios) {
    // 唯一性校验
    if (scenarioIds.has(scenario.scenarioId)) {
      errors.push(`[scenario] Duplicate scenarioId: "${scenario.scenarioId}"`);
    }
    scenarioIds.add(scenario.scenarioId);

    // 必填字段
    if (!scenario.scenarioId || !scenario.label || !scenario.type) {
      errors.push(
        `[scenario] "${scenario.scenarioId || 'unknown'}": missing scenarioId/label/type`,
      );
      continue;
    }

    // 类型校验
    if (!validTypes.includes(scenario.type)) {
      errors.push(
        `[scenario] "${scenario.scenarioId}": invalid type "${scenario.type}" (valid: ${validTypes.join(', ')})`,
      );
    }

    // profile_switch 的 profileId 引用
    if (scenario.type === 'profile_switch' && scenario.payload?.profileId) {
      if (!validProfileIds.has(scenario.payload.profileId as string)) {
        errors.push(
          `[scenario] "${scenario.scenarioId}": profileId "${scenario.payload.profileId}" not found in manifest`,
        );
      }
    }

    // demo_script 的 steps 校验
    if (scenario.type === 'demo_script') {
      if (!scenario.steps || !Array.isArray(scenario.steps) || scenario.steps.length === 0) {
        errors.push(`[scenario] "${scenario.scenarioId}": demo_script must have non-empty "steps"`);
      } else {
        for (const step of scenario.steps) {
          if (!step.action || !step.payload) {
            errors.push(
              `[scenario] "${scenario.scenarioId}" step "${step.label || 'unknown'}": missing action or payload`,
            );
          }
          // 步骤中的 profile_switch 引用
          if (step.action === 'profile_switch' && step.payload.profileId) {
            if (!validProfileIds.has(step.payload.profileId as string)) {
              errors.push(
                `[scenario] "${scenario.scenarioId}" step "${step.label}": profileId "${step.payload.profileId}" not found`,
              );
            }
          }
        }
      }
    }
  }

  return { errors, hasErrors: errors.length > 0 };
}

// --- prompt 校验 ---

function validatePrompts(): { errors: string[]; hasErrors: boolean } {
  const errors: string[] = [];
  const promptsDir = join(DATA_DIR, 'prompts');
  const expectedFiles = ['system.md', 'homepage.md', 'view-summary.md', 'advisor-chat.md'];

  for (const file of expectedFiles) {
    const filePath = join(promptsDir, file);
    if (!existsSync(filePath)) {
      errors.push(`[prompt] Missing file: ${file}`);
      continue;
    }

    const content = readFileSync(filePath, 'utf-8').trim();
    if (content.length === 0) {
      errors.push(`[prompt] Empty file: ${file}`);
    }
  }

  return { errors, hasErrors: errors.length > 0 };
}

// --- main ---

function validate(): void {
  let totalErrors = false;

  // 1. Profile 校验
  console.log('=== Profile Validation ===');
  const { results: profileResults, hasErrors: profileErrors } = validateProfiles();

  for (const result of profileResults) {
    const status = result.errors.length > 0 ? 'FAIL' : 'OK';
    const icon = result.errors.length > 0 ? 'x' : '~';
    console.log(`[${icon}] ${result.profileId} (${result.name}): ${status}`);
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

  // 2. Fallback 校验
  console.log('\n=== Fallback Validation ===');
  const { errors: fallbackErrors, hasErrors: fallbackHasErrors } = validateFallbacks();
  if (fallbackErrors.length === 0) {
    console.log('[~] All fallbacks passed');
  } else {
    for (const error of fallbackErrors) {
      console.log(`[x] ${error}`);
    }
  }

  // 3. Scenario 校验
  console.log('\n=== Scenario Validation ===');
  const { errors: scenarioErrors, hasErrors: scenarioHasErrors } = validateScenarios();
  if (scenarioErrors.length === 0) {
    console.log('[~] All scenarios passed');
  } else {
    for (const error of scenarioErrors) {
      console.log(`[x] ${error}`);
    }
  }

  // 4. Prompt 校验
  console.log('\n=== Prompt Validation ===');
  const { errors: promptErrors, hasErrors: promptHasErrors } = validatePrompts();
  if (promptErrors.length === 0) {
    console.log('[~] All prompts passed');
  } else {
    for (const error of promptErrors) {
      console.log(`[x] ${error}`);
    }
  }

  // 汇总
  totalErrors = profileErrors || fallbackHasErrors || scenarioHasErrors || promptHasErrors;

  console.log('\n===');
  if (totalErrors) {
    console.log('~ Some validations failed!');
    process.exit(1);
  } else {
    console.log('~ All validations passed!');
  }
}

validate();
