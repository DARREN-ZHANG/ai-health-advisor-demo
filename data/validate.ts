/**
 * 数据验证脚本
 * 校验所有 profile 的 JSON schema、日期连续性、数据合理性
 * 校验 fallback 文案的 schema 和引用正确性
 * 校验 scenario 定义的结构和引用正确性
 * 校验 prompt 文件的存在性
 * 校验 history 历史归档文件的结构
 * 校验 timeline script 片段无重叠且引用正确
 * 校验 profile 的 initialDemoTime 与 timeline script 一致
 *
 * 用法: npx tsx data/validate.ts
 */

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { loadManifest } from '../packages/sandbox/src/loader';
import { generateDateRange } from '../packages/shared/src/utils/date-range';
import { isValidChartTokenId, CHART_TOKEN_IDS } from '../packages/shared/src/schemas/chart-token';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, 'sandbox');

// --- helpers ---

function readJson<T>(filePath: string): T {
  const raw = readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as T;
}

// 时间戳格式校验: YYYY-MM-DDTHH:mm
const timestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

// 合法的 segmentType 值（与 ActivitySegmentTypeSchema 一致）
const VALID_SEGMENT_TYPES = [
  'meal_intake',
  'steady_cardio',
  'prolonged_sedentary',
  'intermittent_exercise',
  'walk',
  'sleep',
] as const;

// 合法的 scenario type 值
const VALID_SCENARIO_TYPES = [
  'profile_switch',
  'event_inject',
  'metric_override',
  'reset',
  'demo_script',
  'timeline_append',
  'sync_trigger',
  'advance_clock',
  'reset_profile_timeline',
] as const;

// 合法的 sync trigger 值
const VALID_SYNC_TRIGGERS = ['app_open', 'manual_refresh'] as const;

// timeline script 中 segment 的结构
interface TimelineSegment {
  segmentId: string;
  type: string;
  start: string;
  end: string;
  params?: Record<string, unknown>;
  source: string;
}

// timeline script 文件结构
interface TimelineScript {
  profileId: string;
  scriptId: string;
  initialDemoTime: string;
  segments: TimelineSegment[];
}

// history 文件结构
interface HistoryFile {
  profileId: string;
  dateRange: { start: string; end: string };
  records: Array<{ date: string; [key: string]: unknown }>;
}

// profile 文件的新结构
interface SlimProfile {
  profile: {
    profileId: string;
    name: string;
    age: number;
    gender: string;
    avatar: string;
    tags: string[];
    baseline: {
      restingHr: number;
      hrv: number;
      spo2: number;
      avgSleepMinutes: number;
      avgSteps: number;
    };
  };
  initialDemoTime: string;
  historyRef: { file: string };
  timelineScriptRef: { file: string };
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

interface ProfileResult {
  profileId: string;
  name: string;
  recordCount: number;
  dateRange: { start: string; end: string };
  missingDates: string[];
  errors: string[];
}

function validateProfiles(): { results: ProfileResult[]; hasErrors: boolean } {
  const manifest = loadManifest(DATA_DIR);
  const results: ProfileResult[] = [];
  let hasErrors = false;

  for (const entry of manifest.profiles) {
    const profilePath = join(DATA_DIR, entry.file);
    const errors: string[] = [];

    // 读取 profile 文件（新格式：slim profile + refs）
    if (!existsSync(profilePath)) {
      hasErrors = true;
      results.push({
        profileId: entry.profileId,
        name: entry.name,
        recordCount: 0,
        dateRange: { start: 'N/A', end: 'N/A' },
        missingDates: [],
        errors: ['Profile file not found'],
      });
      continue;
    }

    const profileData = readJson<SlimProfile>(profilePath);

    // 校验 profile 基础字段
    if (!profileData.profile || profileData.profile.profileId !== entry.profileId) {
      errors.push(`profileId mismatch: expected "${entry.profileId}"`);
    }

    // 校验 initialDemoTime 格式
    if (!timestampPattern.test(profileData.initialDemoTime)) {
      errors.push(`initialDemoTime "${profileData.initialDemoTime}" does not match YYYY-MM-DDTHH:mm`);
    }

    // 校验 historyRef 引用的文件存在
    if (!profileData.historyRef || !profileData.historyRef.file) {
      errors.push('Missing historyRef.file');
    } else {
      const historyPath = join(DATA_DIR, profileData.historyRef.file);
      if (!existsSync(historyPath)) {
        errors.push(`historyRef file "${profileData.historyRef.file}" not found`);
      }
    }

    // 校验 timelineScriptRef 引用的文件存在
    if (!profileData.timelineScriptRef || !profileData.timelineScriptRef.file) {
      errors.push('Missing timelineScriptRef.file');
    } else {
      const scriptPath = join(DATA_DIR, profileData.timelineScriptRef.file);
      if (!existsSync(scriptPath)) {
        errors.push(`timelineScriptRef file "${profileData.timelineScriptRef.file}" not found`);
      }
    }

    // 从 history 文件读取 records 进行日期连续性校验
    let recordCount = 0;
    let dateRange = { start: 'N/A', end: 'N/A' };
    let missingDates: string[] = [];

    if (profileData.historyRef?.file) {
      const historyPath = join(DATA_DIR, profileData.historyRef.file);
      if (existsSync(historyPath)) {
        const history = readJson<HistoryFile>(historyPath);
        recordCount = history.records.length;
        if (recordCount > 0) {
          const dates = history.records.map((r) => r.date).sort();
          dateRange = { start: dates[0]!, end: dates[dates.length - 1]! };
          missingDates = validateDateContinuity(history.records, history.dateRange.start, history.dateRange.end);

          if (recordCount === 0) {
            errors.push(`Expected at least 1 record, got ${recordCount}`);
          }

          // 校验 history profileId 一致
          if (history.profileId !== entry.profileId) {
            errors.push(`history profileId "${history.profileId}" != expected "${entry.profileId}"`);
          }
        }
      }
    }

    if (errors.length > 0) {
      hasErrors = true;
    }

    results.push({
      profileId: entry.profileId,
      name: entry.name,
      recordCount,
      dateRange,
      missingDates,
      errors,
    });
  }

  return { results, hasErrors };
}

// --- history 校验 ---

function validateHistoryFiles(): { errors: string[]; hasErrors: boolean } {
  const errors: string[] = [];
  const historyDir = join(DATA_DIR, 'history');

  if (!existsSync(historyDir)) {
    return { errors: ['[history] Missing history directory'], hasErrors: true };
  }

  const manifest = loadManifest(DATA_DIR);
  const validProfileIds = new Set(manifest.profiles.map((p) => p.profileId));

  const expectedFiles = [
    'profile-a-daily-records.json',
    'profile-b-daily-records.json',
    'profile-c-daily-records.json',
  ];

  for (const file of expectedFiles) {
    const filePath = join(historyDir, file);
    if (!existsSync(filePath)) {
      errors.push(`[history] Missing file: ${file}`);
      continue;
    }

    const history = readJson<HistoryFile>(filePath);

    // 校验 profileId 合法
    if (!validProfileIds.has(history.profileId)) {
      errors.push(`[history] ${file}: invalid profileId "${history.profileId}"`);
    }

    // 校验 records 是数组
    if (!Array.isArray(history.records)) {
      errors.push(`[history] ${file}: "records" is not an array`);
      continue;
    }

    // 校验每条 record 有 date 字段
    for (let i = 0; i < history.records.length; i++) {
      const record = history.records[i]!;
      if (!record.date || !/^\d{4}-\d{2}-\d{2}$/.test(record.date)) {
        errors.push(`[history] ${file}: record[${i}] missing or invalid "date"`);
      }
    }

    // 校验 dateRange 与实际 records 一致
    if (history.records.length > 0 && history.dateRange) {
      const dates = history.records.map((r) => r.date).sort();
      const actualStart = dates[0]!;
      const actualEnd = dates[dates.length - 1]!;
      if (history.dateRange.start !== actualStart) {
        errors.push(`[history] ${file}: dateRange.start "${history.dateRange.start}" != actual "${actualStart}"`);
      }
      if (history.dateRange.end !== actualEnd) {
        errors.push(`[history] ${file}: dateRange.end "${history.dateRange.end}" != actual "${actualEnd}"`);
      }
    }
  }

  return { errors, hasErrors: errors.length > 0 };
}

// --- timeline script 校验 ---

function validateTimelineScripts(): { errors: string[]; hasErrors: boolean } {
  const errors: string[] = [];
  const scriptsDir = join(DATA_DIR, 'timeline-scripts');

  if (!existsSync(scriptsDir)) {
    return { errors: ['[timeline-script] Missing timeline-scripts directory'], hasErrors: true };
  }

  const manifest = loadManifest(DATA_DIR);
  const validProfileIds = new Set(manifest.profiles.map((p) => p.profileId));

  const expectedFiles = [
    'profile-a-day-1.json',
    'profile-b-day-1.json',
    'profile-c-day-1.json',
  ];

  for (const file of expectedFiles) {
    const filePath = join(scriptsDir, file);
    if (!existsSync(filePath)) {
      errors.push(`[timeline-script] Missing file: ${file}`);
      continue;
    }

    const script = readJson<TimelineScript>(filePath);

    // 校验 profileId 合法
    if (!validProfileIds.has(script.profileId)) {
      errors.push(`[timeline-script] ${file}: invalid profileId "${script.profileId}"`);
    }

    // 校验 scriptId 非空
    if (!script.scriptId || typeof script.scriptId !== 'string') {
      errors.push(`[timeline-script] ${file}: missing or invalid scriptId`);
    }

    // 校验 initialDemoTime 格式
    if (!timestampPattern.test(script.initialDemoTime)) {
      errors.push(`[timeline-script] ${file}: initialDemoTime "${script.initialDemoTime}" invalid format`);
    }

    // 校验 segments 是数组
    if (!Array.isArray(script.segments)) {
      errors.push(`[timeline-script] ${file}: "segments" is not an array`);
      continue;
    }

    // 校验每个 segment
    const segmentIds = new Set<string>();
    for (let i = 0; i < script.segments.length; i++) {
      const seg = script.segments[i]!;

      // segmentId 唯一性
      if (segmentIds.has(seg.segmentId)) {
        errors.push(`[timeline-script] ${file}: segment[${i}] duplicate segmentId "${seg.segmentId}"`);
      }
      segmentIds.add(seg.segmentId);

      // type 必须是合法的 segmentType
      if (!VALID_SEGMENT_TYPES.includes(seg.type as typeof VALID_SEGMENT_TYPES[number])) {
        errors.push(`[timeline-script] ${file}: segment[${i}] invalid type "${seg.type}"`);
      }

      // start/end 格式校验
      if (!timestampPattern.test(seg.start)) {
        errors.push(`[timeline-script] ${file}: segment[${i}] invalid start "${seg.start}"`);
      }
      if (!timestampPattern.test(seg.end)) {
        errors.push(`[timeline-script] ${file}: segment[${i}] invalid end "${seg.end}"`);
      }

      // source 必须是 baseline_script 或 god_mode
      if (seg.source !== 'baseline_script' && seg.source !== 'god_mode') {
        errors.push(`[timeline-script] ${file}: segment[${i}] invalid source "${seg.source}"`);
      }
    }

    // 校验 segments 无重叠
    for (let i = 0; i < script.segments.length; i++) {
      for (let j = i + 1; j < script.segments.length; j++) {
        const segA = script.segments[i]!;
        const segB = script.segments[j]!;
        // 时间区间重叠判断: A.start < B.end && B.start < A.end
        if (segA.start < segB.end && segB.start < segA.end) {
          errors.push(
            `[timeline-script] ${file}: segment "${segA.segmentId}" and "${segB.segmentId}" overlap`,
          );
        }
      }
    }

    // 校验 profile 的 initialDemoTime 与 timeline script 一致
    const profileEntry = manifest.profiles.find((p) => p.profileId === script.profileId);
    if (profileEntry) {
      const profilePath = join(DATA_DIR, profileEntry.file);
      if (existsSync(profilePath)) {
        const profileData = readJson<SlimProfile>(profilePath);
        if (profileData.initialDemoTime !== script.initialDemoTime) {
          errors.push(
            `[timeline-script] ${file}: initialDemoTime "${script.initialDemoTime}" != profile "${profileData.initialDemoTime}"`,
          );
        }
      }
    }
  }

  return { errors, hasErrors: errors.length > 0 };
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
    if (!VALID_SCENARIO_TYPES.includes(scenario.type as typeof VALID_SCENARIO_TYPES[number])) {
      errors.push(
        `[scenario] "${scenario.scenarioId}": invalid type "${scenario.type}" (valid: ${VALID_SCENARIO_TYPES.join(', ')})`,
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

    // timeline_append 的 segmentType 校验
    if (scenario.type === 'timeline_append' && scenario.payload?.segmentType) {
      const segType = scenario.payload.segmentType as string;
      if (!VALID_SEGMENT_TYPES.includes(segType as typeof VALID_SEGMENT_TYPES[number])) {
        errors.push(
          `[scenario] "${scenario.scenarioId}": invalid segmentType "${segType}" (valid: ${VALID_SEGMENT_TYPES.join(', ')})`,
        );
      }
    }

    // sync_trigger 的 trigger 校验
    if (scenario.type === 'sync_trigger' && scenario.payload?.trigger) {
      const trigger = scenario.payload.trigger as string;
      if (!VALID_SYNC_TRIGGERS.includes(trigger as typeof VALID_SYNC_TRIGGERS[number])) {
        errors.push(
          `[scenario] "${scenario.scenarioId}": invalid trigger "${trigger}" (valid: ${VALID_SYNC_TRIGGERS.join(', ')})`,
        );
      }
    }

    // advance_clock 的 minutes 校验
    if (scenario.type === 'advance_clock' && scenario.payload?.minutes) {
      const minutes = scenario.payload.minutes as number;
      if (typeof minutes !== 'number' || minutes <= 0) {
        errors.push(
          `[scenario] "${scenario.scenarioId}": invalid minutes "${minutes}" (must be positive number)`,
        );
      }
    }

    // reset_profile_timeline 的 profileId 校验
    if (scenario.type === 'reset_profile_timeline' && scenario.payload?.profileId) {
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
          // 步骤中的 timeline_append segmentType 校验
          if (step.action === 'timeline_append' && step.payload.segmentType) {
            const segType = step.payload.segmentType as string;
            if (!VALID_SEGMENT_TYPES.includes(segType as typeof VALID_SEGMENT_TYPES[number])) {
              errors.push(
                `[scenario] "${scenario.scenarioId}" step "${step.label}": invalid segmentType "${segType}"`,
              );
            }
          }
          // 步骤中的 sync_trigger 校验
          if (step.action === 'sync_trigger' && step.payload.trigger) {
            const trigger = step.payload.trigger as string;
            if (!VALID_SYNC_TRIGGERS.includes(trigger as typeof VALID_SYNC_TRIGGERS[number])) {
              errors.push(
                `[scenario] "${scenario.scenarioId}" step "${step.label}": invalid trigger "${trigger}"`,
              );
            }
          }
          // 步骤中的 reset_profile_timeline profileId 校验
          if (step.action === 'reset_profile_timeline' && step.payload.profileId) {
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

  // 2. History 校验
  console.log('\n=== History Validation ===');
  const { errors: historyErrors, hasErrors: historyHasErrors } = validateHistoryFiles();
  if (historyErrors.length === 0) {
    console.log('[~] All history files passed');
  } else {
    for (const error of historyErrors) {
      console.log(`[x] ${error}`);
    }
  }

  // 3. Timeline Script 校验
  console.log('\n=== Timeline Script Validation ===');
  const { errors: timelineErrors, hasErrors: timelineHasErrors } = validateTimelineScripts();
  if (timelineErrors.length === 0) {
    console.log('[~] All timeline scripts passed');
  } else {
    for (const error of timelineErrors) {
      console.log(`[x] ${error}`);
    }
  }

  // 4. Fallback 校验
  console.log('\n=== Fallback Validation ===');
  const { errors: fallbackErrors, hasErrors: fallbackHasErrors } = validateFallbacks();
  if (fallbackErrors.length === 0) {
    console.log('[~] All fallbacks passed');
  } else {
    for (const error of fallbackErrors) {
      console.log(`[x] ${error}`);
    }
  }

  // 5. Scenario 校验
  console.log('\n=== Scenario Validation ===');
  const { errors: scenarioErrors, hasErrors: scenarioHasErrors } = validateScenarios();
  if (scenarioErrors.length === 0) {
    console.log('[~] All scenarios passed');
  } else {
    for (const error of scenarioErrors) {
      console.log(`[x] ${error}`);
    }
  }

  // 6. Prompt 校验
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
  totalErrors = profileErrors || historyHasErrors || timelineHasErrors || fallbackHasErrors || scenarioHasErrors || promptHasErrors;

  console.log('\n===');
  if (totalErrors) {
    console.log('~ Some validations failed!');
    process.exit(1);
  } else {
    console.log('~ All validations passed!');
  }
}

validate();
