import type { DailyRecord } from '@health-advisor/shared';
import { isDateInRange, type DateRange } from '@health-advisor/shared';

/** 单条覆盖规则 */
export interface OverrideEntry {
  /** 要覆盖的指标名称，对应 DailyRecord 的字段（如 "spo2", "stress.load"） */
  metric: string;
  /** 覆盖值 */
  value: unknown;
  /** 可选日期范围，不传则应用到所有记录 */
  dateRange?: { start: string; end: string };
}

/**
 * 对记录列表应用覆盖规则（不可变）
 * 返回新的记录数组，不修改原始数据
 */
export function applyOverrides(records: DailyRecord[], overrides: OverrideEntry[]): DailyRecord[] {
  if (overrides.length === 0) {
    return records;
  }

  return records.map((record) => {
    let current = record;

    for (const override of overrides) {
      // 如果指定了日期范围，检查是否在范围内
      if (override.dateRange) {
        const range: DateRange = { start: override.dateRange.start, end: override.dateRange.end };
        if (!isDateInRange(record.date, range)) {
          continue;
        }
      }

      const updated = applySingleOverride(current, override);
      if (updated !== current) {
        current = updated;
      }
    }

    return current;
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;

/**
 * 对单条记录应用单个覆盖规则
 * 支持点号路径访问嵌套字段（如 "stress.load"）
 */
function applySingleOverride(record: DailyRecord, override: OverrideEntry): DailyRecord {
  const { metric, value } = override;
  const parts = metric.split('.');
  const rec = record as unknown as AnyRecord;

  if (parts.length === 1) {
    // 顶层字段
    if (!(metric in rec) || rec[metric] !== value) {
      return { ...record, [metric]: value };
    }
    return record;
  }

  // 嵌套字段（如 stress.load）
  const topKey = parts[0]!;
  const restKeys = parts.slice(1);
  const currentNested = rec[topKey];

  if (currentNested === undefined || currentNested === null) {
    // 嵌套对象不存在，创建新的
    const newNested = buildNestedObject(restKeys, value);
    return { ...record, [topKey]: newNested };
  }

  const updatedNested = setNestedValue(currentNested as AnyRecord, restKeys, value);

  if (updatedNested === currentNested) {
    return record;
  }

  return { ...record, [topKey]: updatedNested };
}

/**
 * 递归设置嵌套对象的值（不可变）
 */
function setNestedValue(obj: AnyRecord, keys: string[], value: unknown): AnyRecord {
  if (keys.length === 1) {
    const key = keys[0]!;
    if (obj[key] === value) {
      return obj;
    }
    return { ...obj, [key]: value };
  }

  const first = keys[0]!;
  const rest = keys.slice(1);
  const child = obj[first];
  if (child === undefined || child === null) {
    return { ...obj, [first]: buildNestedObject(rest, value) };
  }

  const updatedChild = setNestedValue(child as AnyRecord, rest, value);
  if (updatedChild === child) {
    return obj;
  }

  return { ...obj, [first]: updatedChild };
}

/**
 * 从键数组和值构建嵌套对象
 */
function buildNestedObject(keys: string[], value: unknown): AnyRecord {
  if (keys.length === 1) {
    return { [keys[0]!]: value };
  }
  const first = keys[0]!;
  const rest = keys.slice(1);
  return { [first]: buildNestedObject(rest, value) };
}
