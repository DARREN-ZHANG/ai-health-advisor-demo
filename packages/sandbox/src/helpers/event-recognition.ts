import type {
  BaselineMetrics,
  CalibrationStatus,
  DeviceMetric,
  RecognitionSource,
  RecognizedEvent,
  RecognizedEventType,
  SensorObservation,
} from '@health-advisor/shared';
import { detectPossibleCaffeineIntake } from './caffeine-detector';
import { detectPossibleAlcoholIntake } from './alcohol-detector';
import { calibrateProbability, type EventCalibrationConfig } from './event-calibration';
import calibrationArtifact from '../calibration/event-recognition.json';

// ============================================================
// 校准 artifact 加载与查找
//
// 在模块加载时构建 eventType → config 的 Map，供 recognizeEvents 使用。
// publishable=false 或概率 < publishThreshold 的候选事件不进入输出。
// ============================================================

const calibrationByType = new Map<RecognizedEventType, EventCalibrationConfig>(
  (calibrationArtifact as EventCalibrationConfig[]).map((c) => [c.eventType, c]),
);

/**
 * 对单个候选事件应用校准
 *
 * 1. 查找该类型的校准配置
 * 2. 若 publishable=false → 返回 null（丢弃）
 * 3. 计算校准概率
 * 4. 若 < publishThreshold → 返回 null
 * 5. 返回更新了 confidence/calibrationStatus 的新对象（immutable），保留 rawScore 到 evidence
 *
 * 安全检查：若传感器推断候选事件的类型在 artifact 中没有配置，
 * 抛出错误而不是静默丢弃——这是 artifact 不完整的不变量违反
 * （spec: "所有 sensor-inferred 类型均有配置"）。
 */
function applyCalibration(candidate: RecognizedEvent): RecognizedEvent | null {
  const config = calibrationByType.get(candidate.type);
  if (!config) {
    // 不变量违反：传感器推断类型必须有显式配置（即使 publishable=false）
    // 静默 return null 会让 nap 等类型被无声吞掉，难以诊断
    throw new Error(
      `[event-recognition] sensor-inferred event type "${candidate.type}" has no calibration config. ` +
        `Add an explicit entry (publishable=false is acceptable) to ` +
        `packages/sandbox/src/calibration/event-recognition.json.`,
    );
  }
  if (!config.publishable) return null;
  const probability = calibrateProbability(candidate.confidence, config);
  if (probability < config.publishThreshold) return null;
  // immutable update：保留 rawScore 在 evidence 中供日志，写回校准概率到 confidence
  return {
    ...candidate,
    confidence: probability,
    calibrationStatus: 'calibrated',
    evidence: [...candidate.evidence, `rawScore=${candidate.confidence.toFixed(3)}`],
  };
}

// ============================================================
// 事件识别器（任务 1.2 重写版）
//
// 核心约束：
// 1. 输入为无标签 SensorObservation 流 + 用户上报事件
// 2. 识别器不得访问 segmentId、eventId、segment.type 等语义字段
// 3. 传感器路径固定算法：
//    一分钟标准化 → optimal partitioning 变化点 → 候选窗口分类 → 加权区间调度
// 4. 用户上报事件（micro event）原样合并，不参与传感器推断
// 5. 任务 1.3：所有传感器推断事件经过离线校准（isotonic + threshold），
//    低置信度候选不返回。用户上报事件不经校准。
// ============================================================

/** 一分钟聚合后的标准化多维时序点 */
interface MinuteSample {
  /** YYYY-MM-DDTHH:mm */
  minute: string;
  /** 相对最早分钟的偏移（分钟） */
  offset: number;
  /** 标准化后的多维特征向量（z-score，与 profile 基线对齐） */
  features: FeatureVector;
  /** 原始聚合值（供分类器使用） */
  raw: RawAggregates;
}

/** 用于变化点代价函数的多维特征 */
interface FeatureVector {
  heartRate: number;
  hrv: number;
  motion: number;
  stepRate: number;
  spo2: number;
  stressLoad: number;
}

/** 一分钟内的原始聚合值（未标准化） */
interface RawAggregates {
  heartRates: number[];
  motions: number[];
  steps: number[];
  spo2Values: number[];
  hrvRmssds: number[];
  stressLoads: number[];
  sleepStages: string[];
}

/** 变化点检测出的候选窗口 */
interface CandidateWindow {
  /** YYYY-MM-DDTHH:mm */
  start: string;
  /** YYYY-MM-DDTHH:mm */
  end: string;
  /** 起始 offset（分钟） */
  startOffset: number;
  /** 结束 offset（分钟，含） */
  endOffset: number;
  /** 窗口内的原始聚合（按分类器需要的形状组织） */
  raw: RawAggregates;
}

/** 新的统一输入 */
export interface RecognizeEventsInput {
  /** 无标签传感器观察流（已过滤 micro event） */
  observations: SensorObservation[];
  /** 用户上报事件（micro event 等，已经是最终形态） */
  userReportedEvents: RecognizedEvent[];
  /** 当前 profile 标识 */
  profileId: string;
  /** 当前时间（YYYY-MM-DDTHH:mm），用于生成 ID */
  currentTime: string;
  /** profile 基线（用于标准化），可选，缺失时使用经验默认值 */
  baseline?: BaselineMetrics;
}

// ============================================================
// 公共入口
// ============================================================

/**
 * 识别事件：基于无标签观察流和用户上报事件
 *
 * @param input - 统一输入对象
 */
export function recognizeEvents(
  input: RecognizeEventsInput,
): RecognizedEvent[];
/**
 * 兼容旧签名：直接接收已同步事件数组
 * @deprecated 新代码应使用 RecognizeEventsInput 签名
 */
export function recognizeEvents(
  syncedEvents: import('@health-advisor/shared').DeviceEvent[],
  profileId: string,
  currentTime: string,
): RecognizedEvent[];
/** 实际实现 */
export function recognizeEvents(
  inputOrEvents: RecognizeEventsInput | import('@health-advisor/shared').DeviceEvent[],
  maybeProfileId?: string,
  maybeCurrentTime?: string,
): RecognizedEvent[] {
  // 兼容旧签名（DeviceEvent[]）：在调用方完成迁移前保留
  if (Array.isArray(inputOrEvents)) {
    return recognizeEventsLegacy(inputOrEvents, maybeProfileId ?? '', maybeCurrentTime ?? '');
  }
  return recognizeEventsNew(inputOrEvents);
}

// ============================================================
// 新签名实现（核心算法）
// ============================================================

/** 经验默认基线（profile 基线缺失时使用） */
const DEFAULT_BASELINE: BaselineMetrics = {
  restingHr: 60,
  hrv: 50,
  spo2: 97,
  avgSleepMinutes: 420,
  avgSteps: 8000,
};

/** 识别主流程 */
function recognizeEventsNew(input: RecognizeEventsInput): RecognizedEvent[] {
  const { observations, userReportedEvents, profileId, currentTime, baseline } = input;

  if (observations.length === 0) {
    return [...userReportedEvents];
  }

  // 筛选当前 profile 的观察
  const profileObs = observations.filter((o) => o.profileId === profileId);
  if (profileObs.length === 0) {
    return [...userReportedEvents];
  }

  const effectiveBaseline = baseline ?? DEFAULT_BASELINE;

  // 1. 一分钟聚合 + 标准化
  const rawSamples = aggregatePerMinute(profileObs, effectiveBaseline);
  if (rawSamples.length === 0) {
    return [...userReportedEvents];
  }

  // 1.1 不做分钟级平滑——变化点检测在原始 z-score 上运行
  // 平滑会模糊段边界，导致相邻活动段被误合并
  const samples = rawSamples;

  // 2. optimal partitioning 变化点检测生成候选窗口
  const windows = detectCandidateWindows(samples);
  if (windows.length === 0) {
    return [...userReportedEvents];
  }

  // 3. 对每个候选窗口分类
  const sensorCandidates: SensorCandidate[] = [];
  for (const window of windows) {
    const recognized = classifyWindow(window, profileId, currentTime);
    if (recognized) {
      sensorCandidates.push({ event: recognized, window });
    }
  }

  // 3.1 合并相邻同类候选窗口
  // OP 可能在稳定段内产生过细的变化点（同一活动被切成多个窗口），
  // 合并相邻且同类的窗口，时间范围取并集，原始聚合合并后重新计算 confidence
  const mergedCandidates = mergeAdjacentSameType(sensorCandidates, samples, profileId, currentTime);

  // 4. 咖啡因/饮酒检测（基于观察流）
  const caffeineResults = detectPossibleCaffeineIntake(
    profileObs,
    profileId,
    currentTime,
  );
  const alcoholResults = detectPossibleAlcoholIntake(
    profileObs,
    profileId,
    currentTime,
  );

  // 饮酒结果与咖啡因重叠过滤（与旧逻辑一致）
  const filteredAlcohol = alcoholResults.filter((alcoholEvent) => {
    if (caffeineResults.length === 0) return true;
    const significantOverlap = caffeineResults.some((caffeineEvent) => {
      const overlapStart = alcoholEvent.start > caffeineEvent.start ? alcoholEvent.start : caffeineEvent.start;
      const overlapEnd = alcoholEvent.end < caffeineEvent.end ? alcoholEvent.end : caffeineEvent.end;
      const overlapMin = diffMinutes(overlapStart, overlapEnd);
      return overlapMin > 30;
    });
    return !significantOverlap;
  });

  // 5. 加权区间调度：在变化点窗口候选中选择非重叠最优集合
  // caffeine/alcohol 是概率推导事件，与活动事件语义独立，不参与调度，直接合并
  const windowCandidates: Array<{ event: RecognizedEvent; start: string; end: string }> =
    mergedCandidates.map((c) => ({ event: c.event, start: c.window.start, end: c.window.end }));

  const selected = weightedIntervalScheduling(windowCandidates);

  // 6. 合并 detector 事件（咖啡因/饮酒）和用户上报事件
  //    传感器推断事件应用校准（过滤低置信度）
  //    用户上报事件原样保留（recognitionSource=user_report）
  const calibratedSensorEvents = [
    ...selected,
    ...caffeineResults,
    ...filteredAlcohol,
  ]
    .map((e) => applyCalibration(e))
    .filter((e): e is RecognizedEvent => e !== null);

  return [...calibratedSensorEvents, ...userReportedEvents];
}

/** 合并同类候选窗口的最大间隔（分钟）——OP 可能产生过细变化点 */
const MERGE_GAP_THRESHOLD_MIN = 5;
/** 单次合并后窗口的最大时长（分钟）——防止跨活动段错误合并 */
const MERGE_MAX_DURATION_MIN = 180;

/**
 * 合并相邻候选窗口（不论类型），重新分类
 *
 * OP 可能在稳定段内产生过细的变化点，导致同一活动被切成多个相邻窗口
 * （如 cardio 段心率周期性波动让某些子窗口被误判为 walk）。
 *
 * 此函数采用贪心策略：对时间上间隔 ≤ MERGE_GAP_THRESHOLD_MIN 分钟的相邻窗口，
 * 尝试合并并重新分类。接受合并的条件：
 * 1. 合并后总时长不超过 MERGE_MAX_DURATION_MIN 分钟
 * 2. 重新分类成功，且类型与 current 或 next 一致
 * 3. 合并后 confidence 不低于两者中较低者的 85%
 *
 * 导出以便单元测试
 */
export function mergeAdjacentSameType(
  candidates: SensorCandidate[],
  samples: MinuteSample[],
  profileId: string,
  currentTime: string,
): SensorCandidate[] {
  if (candidates.length <= 1) return [...candidates];

  // 按时间排序
  const sorted = [...candidates].sort((a, b) =>
    a.window.start.localeCompare(b.window.start),
  );

  // 构建 minute offset → sample 的索引
  const sampleByOffset = new Map<number, MinuteSample>();
  for (const s of samples) {
    sampleByOffset.set(s.offset, s);
  }

  const merged: SensorCandidate[] = [];
  let current = sorted[0]!;

  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i]!;
    const gap = diffMinutes(current.window.end, next.window.start);
    const adjacent = gap >= 0 && gap <= MERGE_GAP_THRESHOLD_MIN;
    const mergedDuration = diffMinutes(current.window.start, next.window.end);

    if (adjacent && mergedDuration <= MERGE_MAX_DURATION_MIN) {
      // 尝试合并 current 和 next（不论类型）
      const startOffset = current.window.startOffset;
      const endOffset = next.window.endOffset;
      const mergedRaw = mergeRawAggregates(current.window.raw, next.window.raw);
      const startSample = sampleByOffset.get(startOffset) ?? samples[0]!;
      const endSample = sampleByOffset.get(endOffset) ?? samples[samples.length - 1]!;
      const mergedWindow: CandidateWindow = {
        start: startSample.minute,
        end: endSample.minute,
        startOffset,
        endOffset,
        raw: mergedRaw,
      };
      const reclassified = classifyWindow(mergedWindow, profileId, currentTime);
      if (
        reclassified &&
        (reclassified.type === current.event.type || reclassified.type === next.event.type) &&
        reclassified.confidence >= Math.min(current.event.confidence, next.event.confidence) * 0.85
      ) {
        current = { event: reclassified, window: mergedWindow };
      } else {
        merged.push(current);
        current = next;
      }
    } else {
      merged.push(current);
      current = next;
    }
  }
  merged.push(current);
  return merged;
}

/** 合并两个原始聚合 */
function mergeRawAggregates(a: RawAggregates, b: RawAggregates): RawAggregates {
  return {
    heartRates: [...a.heartRates, ...b.heartRates],
    motions: [...a.motions, ...b.motions],
    steps: [...a.steps, ...b.steps],
    spo2Values: [...a.spo2Values, ...b.spo2Values],
    hrvRmssds: [...a.hrvRmssds, ...b.hrvRmssds],
    stressLoads: [...a.stressLoads, ...b.stressLoads],
    sleepStages: [...a.sleepStages, ...b.sleepStages],
  };
}

/** 传感器候选窗口分类后的中间结构 */
interface SensorCandidate {
  event: RecognizedEvent;
  window: CandidateWindow;
}

// ============================================================
// 步骤 1：一分钟聚合 + 标准化
// ============================================================

/** 默认 HRV 基线（ms）— 用于 z-score 标准化 */
const DEFAULT_HRV_BASELINE_MS = 50;
/** 默认 stress 基线 — 用于 z-score 标准化 */
const DEFAULT_STRESS_BASELINE = 25;

/**
 * 将观察流按一分钟聚合，并对每个维度计算 z-score 标准化值
 *
 * 标准化基线：
 * - heartRate: profile.restingHr（标准差经验值 15）
 * - hrv: profile.hrv（标准差经验值 12）
 * - motion: 基线 0（标准差经验值 2）
 * - stepRate: 基线 0（标准差经验值 30）
 * - spo2: profile.spo2（标准差经验值 1.5）
 * - stressLoad: 经验基线 25（标准差经验值 15）
 */
export function aggregatePerMinute(
  observations: SensorObservation[],
  baseline: BaselineMetrics,
): MinuteSample[] {
  // 按分钟分组（保留分钟字符串）
  const byMinute = new Map<string, SensorObservation[]>();
  for (const obs of observations) {
    const existing = byMinute.get(obs.measuredAt) ?? [];
    byMinute.set(obs.measuredAt, [...existing, obs]);
  }

  // 排序得到分钟序列
  const sortedMinutes = [...byMinute.keys()].sort((a, b) => a.localeCompare(b));
  if (sortedMinutes.length === 0) return [];

  const firstMinute = sortedMinutes[0]!;

  // 预计算各维度的标准化常数
  const hrMean = baseline.restingHr;
  const hrStd = 15;
  const hrvMean = baseline.hrv > 0 ? baseline.hrv : DEFAULT_HRV_BASELINE_MS;
  const hrvStd = 12;
  const motionMean = 0;
  const motionStd = 2;
  const stepMean = 0;
  const stepStd = 30;
  const spo2Mean = baseline.spo2 > 0 ? baseline.spo2 : 97;
  const spo2Std = 1.5;
  const stressMean = DEFAULT_STRESS_BASELINE;
  const stressStd = 15;

  const samples: MinuteSample[] = [];
  for (const minute of sortedMinutes) {
    const bucket = byMinute.get(minute)!;
    const raw = extractRawAggregates(bucket);
    // 跳过只有 wearState 等非数值 metric 的分钟（不贡献有效特征）
    const hasNumericData =
      raw.heartRates.length > 0 ||
      raw.motions.length > 0 ||
      raw.steps.length > 0 ||
      raw.spo2Values.length > 0 ||
      raw.hrvRmssds.length > 0 ||
      raw.stressLoads.length > 0 ||
      raw.sleepStages.length > 0;
    if (!hasNumericData) continue;
    // 缺失维度返回 0 z-score（中性，不贡献 SSE），避免 0 被当作低值
    const features: FeatureVector = {
      heartRate: raw.heartRates.length > 0 ? zScore(avg(raw.heartRates), hrMean, hrStd) : 0,
      hrv: raw.hrvRmssds.length > 0 ? zScore(avg(raw.hrvRmssds), hrvMean, hrvStd) : 0,
      motion: raw.motions.length > 0 ? zScore(avg(raw.motions), motionMean, motionStd) : 0,
      stepRate: raw.steps.length > 0 ? zScore(avg(raw.steps), stepMean, stepStd) : 0,
      spo2: raw.spo2Values.length > 0 ? zScore(avg(raw.spo2Values), spo2Mean, spo2Std) : 0,
      stressLoad: raw.stressLoads.length > 0 ? zScore(avg(raw.stressLoads), stressMean, stressStd) : 0,
    };
    samples.push({
      minute,
      offset: diffMinutes(firstMinute, minute),
      features,
      raw,
    });
  }
  return samples;
}

/** 从一分钟内的观察提取原始聚合 */
function extractRawAggregates(bucket: SensorObservation[]): RawAggregates {
  const agg: RawAggregates = {
    heartRates: [],
    motions: [],
    steps: [],
    spo2Values: [],
    hrvRmssds: [],
    stressLoads: [],
    sleepStages: [],
  };
  for (const obs of bucket) {
    switch (obs.metric) {
      case 'heartRate':
        if (typeof obs.value === 'number') agg.heartRates.push(obs.value);
        break;
      case 'motion':
        if (typeof obs.value === 'number') agg.motions.push(obs.value);
        break;
      case 'steps':
        if (typeof obs.value === 'number') agg.steps.push(obs.value);
        break;
      case 'spo2':
        if (typeof obs.value === 'number') agg.spo2Values.push(obs.value);
        break;
      case 'hrvRmssd':
        if (typeof obs.value === 'number') agg.hrvRmssds.push(obs.value);
        break;
      case 'stressLoad':
        if (typeof obs.value === 'number') agg.stressLoads.push(obs.value);
        break;
      case 'sleepStage':
        if (typeof obs.value === 'string') agg.sleepStages.push(obs.value);
        break;
      case 'wearState':
        // 不参与特征聚合
        break;
    }
  }
  return agg;
}

/** 计算 z-score（避免除零） */
function zScore(value: number, mean: number, std: number): number {
  if (!Number.isFinite(value)) return 0;
  if (std <= 0) return 0;
  return (value - mean) / std;
}

// ============================================================
// 步骤 2：optimal partitioning 变化点检测 → 候选窗口
//
// 注意：此实现是 optimal partitioning (OP)，复杂度 O(n²)。
// 原注释误称为 PELT (Pruned Exact Linear Time) —— PELT 通过不等式剪枝
// 将期望复杂度降到 O(n)，但本实现未实现剪枝（保留所有候选）。
// 函数名 detectCandidateWindows 保持不变以兼容调用方。
// ============================================================

/** 多维特征向量维度数（用于 BIC penalty） */
const FEATURE_COUNT = 6;

/**
 * 使用 multivariate optimal partitioning (OP) 变化点检测生成候选窗口
 *
 * 算法：
 * - 代价函数：各维度 squared-error 之和
 * - penalty：BIC = featureCount * log(sampleCount)
 * - 对每个 tau 枚举所有可能的前驱 tau'，复杂度 O(n²)
 * - 对检测到的变化点列表切分连续窗口
 *
 * 导出以便单元测试
 */
export function detectCandidateWindows(samples: MinuteSample[]): CandidateWindow[] {
  if (samples.length < 2) return [];

  // 特征矩阵：[sampleIndex][featureIndex]
  const featureKeys: (keyof FeatureVector)[] = [
    'heartRate',
    'hrv',
    'motion',
    'stepRate',
    'spo2',
    'stressLoad',
  ];
  const matrix: number[][] = samples.map((s) => featureKeys.map((k) => s.features[k]));

  const n = samples.length;
  // BIC penalty
  const penalty = FEATURE_COUNT * Math.log(n);

  // optimal partitioning 动态规划
  // cost[i] = min cost to segment samples[0..i-1]
  // changePoints 记录最优解的变化点
  const cost = new Array<number>(n + 1).fill(0);
  const prev = new Array<number>(n + 1).fill(-1);
  cost[0] = 0;

  // 预计算 segment cost：segmentCost(i, j) = samples[i..j-1] 的 squared error
  // 为了效率，使用前缀和
  // sum[k] = 各维度前缀和；sumSq[k] = 各维度平方前缀和
  const sum: number[][] = Array.from({ length: n + 1 }, () => new Array(FEATURE_COUNT).fill(0));
  const sumSq: number[][] = Array.from({ length: n + 1 }, () => new Array(FEATURE_COUNT).fill(0));
  for (let k = 0; k < n; k++) {
    for (let f = 0; f < FEATURE_COUNT; f++) {
      sum[k + 1]![f] = sum[k]![f]! + matrix[k]![f]!;
      sumSq[k + 1]![f] = sumSq[k]![f]! + matrix[k]![f]! * matrix[k]![f]!;
    }
  }

  /** 计算 samples[i..j-1] 的 squared-error 之和 */
  const segmentCost = (i: number, j: number): number => {
    // 样本数
    const count = j - i;
    if (count <= 0) return 0;
    let total = 0;
    for (let f = 0; f < FEATURE_COUNT; f++) {
      const s = sum[j]![f]! - sum[i]![f]!;
      const sq = sumSq[j]![f]! - sumSq[i]![f]!;
      // 方差 * count = sq - s^2 / count
      // squared error 相对均值 = sq - s*s/count
      const mean = s / count;
      total += sq - s * mean;
    }
    return total;
  };

  // OP 主体：对每个 tau，枚举所有前驱 tau'（不剪枝，复杂度 O(n²)）
  const candidates: number[] = [0];

  for (let tau = 1; tau <= n; tau++) {
    let bestCost = Infinity;
    let bestPrev = -1;
    const nextCandidates: number[] = [];
    for (const cand of candidates) {
      const segCost = segmentCost(cand, tau);
      const totalCost = cost[cand]! + segCost + penalty;
      if (totalCost < bestCost) {
        bestCost = totalCost;
        bestPrev = cand;
      }
      // 不做剪枝：保留所有候选（PELT 才会通过不等式剪枝）
      nextCandidates.push(cand);
    }
    cost[tau] = bestCost;
    prev[tau] = bestPrev;
    nextCandidates.push(tau);
    candidates.length = 0;
    candidates.push(...dedupe(nextCandidates));
  }

  // 回溯得到变化点列表
  const breakpoints: number[] = [];
  let cur = n;
  while (cur > 0) {
    const p = prev[cur]!;
    if (p <= 0) break;
    if (p < cur) {
      breakpoints.push(p);
    }
    cur = p;
  }
  breakpoints.sort((a, b) => a - b);

  // 切分连续窗口：[0, bp1), [bp1, bp2), ..., [bpK, n)
  const boundaries: number[] = [0, ...breakpoints, n];
  const windows: CandidateWindow[] = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const startIdx = boundaries[i]!;
    const endIdx = boundaries[i + 1]!;
    if (endIdx <= startIdx) continue;
    // 合并窗口内原始聚合
    const mergedRaw: RawAggregates = {
      heartRates: [],
      motions: [],
      steps: [],
      spo2Values: [],
      hrvRmssds: [],
      stressLoads: [],
      sleepStages: [],
    };
    for (let k = startIdx; k < endIdx; k++) {
      const raw = samples[k]!.raw;
      mergedRaw.heartRates.push(...raw.heartRates);
      mergedRaw.motions.push(...raw.motions);
      mergedRaw.steps.push(...raw.steps);
      mergedRaw.spo2Values.push(...raw.spo2Values);
      mergedRaw.hrvRmssds.push(...raw.hrvRmssds);
      mergedRaw.stressLoads.push(...raw.stressLoads);
      mergedRaw.sleepStages.push(...raw.sleepStages);
    }
    const startSample = samples[startIdx]!;
    const endSample = samples[endIdx - 1]!;
    windows.push({
      start: startSample.minute,
      end: endSample.minute,
      startOffset: startSample.offset,
      endOffset: endSample.offset,
      raw: mergedRaw,
    });
  }

  return windows;
}

/** 数组去重保序 */
function dedupe(arr: number[]): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const v of arr) {
    if (!seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

// ============================================================
// 步骤 3：窗口分类（迁移自旧 classifySegment，去除 segmentId 依赖）
// ============================================================

/**
 * 对一个候选窗口运行特征分类器
 *
 * 分类顺序与旧 classifySegment 一致，但不读取 segmentId
 */
function classifyWindow(
  window: CandidateWindow,
  profileId: string,
  currentTime: string,
): RecognizedEvent | null {
  const evidence: string[] = [];
  const durationMin = diffMinutes(window.start, window.end);
  const raw = window.raw;

  // 睡眠优先判定（基于 sleepStage 观察值，非 segmentId）
  if (raw.sleepStages.length > 0) {
    return classifySleep(window, durationMin, evidence, profileId, currentTime);
  }

  const avgHr = average(raw.heartRates);
  const avgMotion = average(raw.motions);
  const maxSteps = raw.steps.length > 0 ? Math.max(...raw.steps) : 0;
  const hrStdDev = stdDev(raw.heartRates);

  // 力量训练：高心率变异性 + 极低步数（先于 HIIT 检测）
  if (hrStdDev > 20 && maxSteps < 50 && avgHr >= 90 && avgMotion > 2) {
    return buildRecognized(
      window,
      'strength_training',
      durationMin,
      evidence,
      profileId,
      currentTime,
      () => {
        evidence.push(`心率标准差 ${hrStdDev.toFixed(0)}, 低步数 ${maxSteps}, 间歇高强度`);
        return Math.min(0.85, 0.5 + Math.min(hrStdDev / 50, 0.35));
      },
    );
  }

  // 间歇运动：高心率变异性 + 较多步数
  if (raw.heartRates.length > 4 && hrStdDev > 20) {
    return buildRecognized(
      window,
      'intermittent_exercise',
      durationMin,
      evidence,
      profileId,
      currentTime,
      () => {
        evidence.push(`心率标准差 ${hrStdDev.toFixed(0)}, 交替高低强度`);
        return Math.min(0.85, 0.5 + Math.min(hrStdDev / 40, 0.35));
      },
    );
  }

  // 稳态有氧
  if (avgHr >= 110 && avgMotion > 5 && maxSteps > 100) {
    return buildRecognized(
      window,
      'steady_cardio',
      durationMin,
      evidence,
      profileId,
      currentTime,
      () => {
        const hrConsistency = 1 - hrStdDev / avgHr;
        evidence.push(`平均心率 ${avgHr.toFixed(0)}, 运动强度 ${avgMotion.toFixed(1)}, 步数 ${maxSteps}`);
        return Math.min(0.95, Math.max(0.5, hrConsistency * 0.8 + 0.15));
      },
    );
  }

  // 步行
  if (avgHr >= 80 && avgMotion >= 2.5 && maxSteps > 50) {
    return buildRecognized(
      window,
      'walk',
      durationMin,
      evidence,
      profileId,
      currentTime,
      () => {
        evidence.push(`平均心率 ${avgHr.toFixed(0)}, 运动强度 ${avgMotion.toFixed(1)}, 步数 ${maxSteps}`);
        return Math.min(0.9, 0.6 + Math.min(durationMin / 30, 0.3));
      },
    );
  }

  // 进餐
  if (avgMotion >= 2 && avgMotion <= 7 && avgHr >= 60 && avgHr <= 90 && maxSteps < 50) {
    return buildRecognized(
      window,
      'meal_intake',
      durationMin,
      evidence,
      profileId,
      currentTime,
      () => {
        evidence.push(`平均心率 ${avgHr.toFixed(0)}, 运动强度 ${avgMotion.toFixed(1)}, 少量步数`);
        return Math.min(0.85, 0.55 + Math.min(durationMin / 40, 0.3));
      },
    );
  }

  // 久坐
  if (avgHr < 75 && avgMotion < 1 && maxSteps === 0 && durationMin > 30) {
    return buildRecognized(
      window,
      'prolonged_sedentary',
      durationMin,
      evidence,
      profileId,
      currentTime,
      () => {
        evidence.push(`低心率 ${avgHr.toFixed(0)}, 无运动, 持续 ${durationMin} 分钟`);
        return Math.min(0.9, 0.5 + Math.min(durationMin / 90, 0.4));
      },
    );
  }

  return null;
}

/** 睡眠/小憩分类（基于 sleepStage 观察值，非 segmentId） */
function classifySleep(
  window: CandidateWindow,
  durationMin: number,
  evidence: string[],
  profileId: string,
  currentTime: string,
): RecognizedEvent {
  const stageCounts = countBy(window.raw.sleepStages);
  const avgHr = average(window.raw.heartRates);
  const isNap = durationMin < 120;
  const eventType: RecognizedEventType = isNap ? 'nap' : 'sleep';

  if (isNap) {
    evidence.push(`小憩持续 ${durationMin} 分钟, 阶段分布: ${Object.entries(stageCounts).map(([k, v]) => `${k}=${v}`).join(', ')}`);
    evidence.push(`平均心率 ${avgHr.toFixed(0)}, 短时恢复性睡眠`);
  } else {
    evidence.push(`睡眠阶段转换 ${window.raw.sleepStages.length} 次, 持续 ${durationMin} 分钟`);
    evidence.push(`平均心率 ${avgHr.toFixed(0)}, 阶段分布: ${Object.entries(stageCounts).map(([k, v]) => `${k}=${v}`).join(', ')}`);
  }

  const durationConf = isNap
    ? Math.min(durationMin / 60, 0.5)
    : Math.min(durationMin / 360, 0.5);
  const stageConf = Math.min(Object.keys(stageCounts).length / 4, 0.3);
  const confidence = Math.min(0.95, 0.3 + durationConf + stageConf);

  return {
    recognizedEventId: makeRecognizedId('sleep', window.start, currentTime),
    profileId,
    type: eventType,
    start: window.start,
    end: window.end,
    confidence,
    evidence,
    sourceSegmentId: undefined,
    recognitionSource: 'sensor_inference',
    calibrationStatus: 'calibrated',
  };
}

/**
 * 构建已识别事件（统一入口，默认传感器推断）
 */
function buildRecognized(
  window: CandidateWindow,
  type: RecognizedEventType,
  durationMin: number,
  evidence: string[],
  profileId: string,
  currentTime: string,
  computeConfidence: () => number,
  recognitionSource: RecognitionSource = 'sensor_inference',
  calibrationStatus: CalibrationStatus = 'calibrated',
): RecognizedEvent {
  evidence.unshift(`检测到 ${type} 活动, 持续 ${durationMin} 分钟`);
  return {
    recognizedEventId: makeRecognizedId(type, window.start, currentTime),
    profileId,
    type,
    start: window.start,
    end: window.end,
    confidence: computeConfidence(),
    evidence,
    sourceSegmentId: undefined,
    recognitionSource,
    calibrationStatus,
  };
}

/** 生成稳定的 recognizedEventId */
function makeRecognizedId(
  type: string,
  start: string,
  currentTime: string,
): string {
  const safeStart = start.replace(/[-T:]/g, '');
  return `re-auto-${type}-${safeStart}`;
}

// ============================================================
// 步骤 4：加权区间调度
// ============================================================

/** 候选区间（已分类事件 + 时间范围） */
interface SchedulableInterval {
  event: RecognizedEvent;
  start: string;
  end: string;
}

/**
 * 加权区间调度：选择非重叠子集使 confidence 总和最大
 *
 * 算法：
 * 1. 按 end 时间排序
 * 2. 对每个区间找最新的非重叠前驱
 * 3. DP：best[i] = max(best[i-1], weight[i] + best[pred[i]])
 * 4. 回溯选择
 *
 * 导出以便单元测试
 */
export function weightedIntervalScheduling(
  intervals: SchedulableInterval[],
): RecognizedEvent[] {
  if (intervals.length === 0) return [];

  // 1. 按 end 排序（稳定）
  const sorted = [...intervals].sort((a, b) => {
    const cmp = a.end.localeCompare(b.end);
    return cmp !== 0 ? cmp : a.start.localeCompare(b.start);
  });

  // 2. 预计算每个区间的"最新非重叠前驱"索引
  const latestNonOverlap: number[] = new Array(sorted.length).fill(-1);
  for (let i = 0; i < sorted.length; i++) {
    // 找到最大的 j < i，使得 sorted[j].end <= sorted[i].start
    let lo = 0;
    let hi = i - 1;
    let result = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid]!.end.localeCompare(sorted[i]!.start) <= 0) {
        result = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    latestNonOverlap[i] = result;
  }

  // 3. DP
  // best[i] = 考虑前 i+1 个区间时的最优总权重
  // take[i] = 是否在最优解中选择了第 i 个
  const best = new Array<number>(sorted.length).fill(0);
  const take = new Array<boolean>(sorted.length).fill(false);
  for (let i = 0; i < sorted.length; i++) {
    const weight = sorted[i]!.event.confidence;
    const without = i > 0 ? best[i - 1]! : 0;
    const predIdx = latestNonOverlap[i]!;
    const withThis = weight + (predIdx >= 0 ? best[predIdx]! : 0);
    if (withThis > without) {
      best[i] = withThis;
      take[i] = true;
    } else {
      best[i] = without;
      take[i] = false;
    }
  }

  // 4. 回溯
  const selected: RecognizedEvent[] = [];
  let i = sorted.length - 1;
  while (i >= 0) {
    if (take[i]) {
      selected.push(sorted[i]!.event);
      i = latestNonOverlap[i]!;
    } else {
      i -= 1;
    }
  }
  // 按 start 时间升序返回
  return selected.sort((a, b) => a.start.localeCompare(b.start));
}

// ============================================================
// 兼容旧签名（调用方迁移过渡用）
// ============================================================

import {
  projectDeviceEventsToSensorObservations,
} from './sensor-observation';
import type { DeviceEvent, MicroEventType } from '@health-advisor/shared';
import { MicroEventTypeSchema } from '@health-advisor/shared';

/** 旧签名实现：内部投影观察 + 拆分 micro event + 调用新签名 */
function recognizeEventsLegacy(
  syncedEvents: DeviceEvent[],
  profileId: string,
  currentTime: string,
): RecognizedEvent[] {
  if (syncedEvents.length === 0) return [];
  const input = buildRecognizeInputFromDeviceEvents(syncedEvents, profileId, currentTime);
  return recognizeEventsNew(input);
}

/** micro event segmentId 格式：seg-micro-{type}-{timestamp} */
const MICRO_SEGMENT_PATTERN_LEGACY = /^seg-micro-(micro_[a-z_]+)-(\d+)$/;

/** micro event segmentId 前缀（用于分离通道） */
export const MICRO_SEGMENT_PREFIX = 'seg-micro-';

/**
 * 从 DeviceEvent 列表构建识别输入
 *
 * 调用方在拥有原始 DeviceEvent（同步后）时使用此辅助函数：
 * 1. 分离 micro event 与 sensor event
 * 2. micro event 转换为 userReportedEvents
 * 3. sensor event 投影为无标签观察
 *
 * 返回可直接传给 recognizeEvents 的 RecognizeEventsInput
 */
export function buildRecognizeInputFromDeviceEvents(
  syncedEvents: DeviceEvent[],
  profileId: string,
  currentTime: string,
): RecognizeEventsInput {
  const profileEvents = syncedEvents.filter((e) => e.profileId === profileId);
  const microEvents: DeviceEvent[] = [];
  const sensorEvents: DeviceEvent[] = [];
  for (const e of profileEvents) {
    if (e.segmentId && e.segmentId.startsWith(MICRO_SEGMENT_PREFIX)) {
      microEvents.push(e);
    } else {
      sensorEvents.push(e);
    }
  }

  const userReportedEvents = buildUserReportedFromMicroEvents(microEvents, profileId);
  const observations = projectDeviceEventsToSensorObservations(sensorEvents);

  return {
    observations,
    userReportedEvents,
    profileId,
    currentTime,
  };
}

/**
 * 将 micro event 设备事件聚合为 userReportedEvents
 *
 * 按 segmentId 分组，每组产生一个 RecognizedEvent
 */
function buildUserReportedFromMicroEvents(
  events: DeviceEvent[],
  profileId: string,
): RecognizedEvent[] {
  if (events.length === 0) return [];

  // 按 segmentId 分组
  const bySegment = new Map<string, DeviceEvent[]>();
  for (const e of events) {
    const key = e.segmentId ?? '__no_segment__';
    const existing = bySegment.get(key) ?? [];
    bySegment.set(key, [...existing, e]);
  }

  const results: RecognizedEvent[] = [];
  for (const [segmentId, group] of bySegment) {
    // 从 segmentId 提取微事件类型
    const match = MICRO_SEGMENT_PATTERN_LEGACY.exec(segmentId);
    const rawType = match?.[1];
    const parsed = rawType ? MicroEventTypeSchema.safeParse(rawType) : null;
    if (!parsed?.success) continue;
    const microType = parsed.data as MicroEventType;

    // 按时间排序
    const sorted = [...group].sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));
    const start = sorted[0]!.measuredAt;
    const end = sorted[sorted.length - 1]!.measuredAt;
    const durationMin = diffMinutes(start, end);

    const evidence = [
      `检测到 ${microType} 活动, 持续 ${durationMin} 分钟`,
      `用户选择触发微事件 ${microType}, 持续 ${durationMin} 分钟`,
    ];

    results.push({
      recognizedEventId: `re-${segmentId}`,
      profileId,
      type: microType,
      start,
      end,
      confidence: 1.0,
      evidence,
      sourceSegmentId: segmentId,
      recognitionSource: 'user_report',
      calibrationStatus: 'not_applicable',
    });
  }

  return results;
}

// ============================================================
// 辅助工具函数
// ============================================================

/** 计算两个时间戳之间的分钟差 */
function diffMinutes(start: string, end: string): number {
  const s = new Date(`${start}:00`);
  const e = new Date(`${end}:00`);
  return Math.round((e.getTime() - s.getTime()) / 60000);
}

/** 计算平均值 */
function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** 计算标准差 */
function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = average(values);
  const squaredDiffs = values.map((v) => (v - avg) ** 2);
  return Math.sqrt(average(squaredDiffs));
}

/** 计数统计 */
function countBy(items: string[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const item of items) {
    result[item] = (result[item] ?? 0) + 1;
  }
  return result;
}

/** 计算 avg，避免命名冲突 */
function avg(values: number[]): number {
  return average(values);
}
