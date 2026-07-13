import type { RecognizedEventType } from '@health-advisor/shared';

// ============================================================
// 事件校准（任务 1.3）
//
// 本模块实现：
// 1. PAVA (Pool Adjacent Violators Algorithm) 保序回归
//    将 (rawScore, label) 对拟合为单调非递减的阶跃函数
// 2. 基于 precision/recall 的 operating point 选择
//    在 precision >= 阈值 的前提下选择 recall 最高的点
// 3. 运行时保序校准：raw score → calibrated probability
//
// 本模块为纯函数模块，不依赖任何 I/O。
// 校准 artifact（EventCalibrationConfig 集合）由离线脚本生成，
// 运行时由 recognizeEvents 读取并调用 calibrateProbability。
// ============================================================

/** 校准数据点：raw score + ground truth label (0/1) */
export interface CalibrationPoint {
  /** 规则公式输出的原始分数（未校准） */
  rawScore: number;
  /** ground truth 标签：1=正例，0=负例 */
  label: 0 | 1;
}

/** 保序回归拟合得到的阶跃函数 bucket */
export interface IsotonicBucket {
  /** 该 bucket 的最小 raw score（左闭） */
  minRawScore: number;
  /** 该 bucket 的校准概率 */
  probability: number;
}

/** 单个事件类型的校准配置（artifact 中的一项） */
export interface EventCalibrationConfig {
  /** 事件类型 */
  eventType: RecognizedEventType;
  /** 是否可发布：false 表示该类型一律不得输出 */
  publishable: boolean;
  /** 发布阈值：校准概率低于此值的候选不得返回 */
  publishThreshold: number;
  /** likely 阈值：校准概率=0.8 对应的 raw score */
  likelyThreshold: number;
  /** 保序回归 buckets（单调非递减阶跃函数） */
  isotonicBuckets: IsotonicBucket[];
  /** 验证集 precision（publishable=true 时 >= 0.95） */
  validationPrecision: number;
  /** 验证集 recall */
  validationRecall: number;
}

// ============================================================
// PAVA 保序回归
// ============================================================

/** PAVA 内部 bucket：带权重 */
interface PavaBucket {
  /** 该 bucket 的最小 raw score */
  minRawScore: number;
  /** bucket 内所有样本 label 之和（加权） */
  weightedSum: number;
  /** bucket 内所有样本权重之和 */
  weight: number;
}

/**
 * 用 PAVA 拟合保序回归模型
 *
 * 算法：
 * 1. 按 rawScore 升序排序（相同 rawScore 聚合）
 * 2. 初始化每个点为独立 bucket
 * 3. 当存在 bucket[i].value < bucket[i-1].value 时，合并两者
 * 4. 合并后 bucket 的 value = 加权平均
 *
 * @param points 校准数据点
 * @returns 单调非递减的 bucket 序列
 */
export function fitIsotonicRegression(points: CalibrationPoint[]): IsotonicBucket[] {
  if (points.length === 0) return [];

  // 1. 按 rawScore 升序排序；相同 rawScore 聚合为单点（权重 = 样本数）
  const sorted = [...points].sort((a, b) => a.rawScore - b.rawScore);

  // 2. 聚合相同 rawScore
  const aggregated: PavaBucket[] = [];
  for (const p of sorted) {
    const last = aggregated[aggregated.length - 1];
    if (last && last.minRawScore === p.rawScore) {
      // 合并到上一个 bucket
      last.weightedSum += p.label;
      last.weight += 1;
    } else {
      aggregated.push({
        minRawScore: p.rawScore,
        weightedSum: p.label,
        weight: 1,
      });
    }
  }

  // 3. PAVA 合并：当 bucket[i].value < bucket[i-1].value 时合并
  // value = weightedSum / weight
  const buckets: PavaBucket[] = aggregated.map((b) => ({ ...b }));
  let i = 1;
  while (i < buckets.length) {
    const prev = buckets[i - 1]!;
    const curr = buckets[i]!;
    const prevValue = prev.weightedSum / prev.weight;
    const currValue = curr.weightedSum / curr.weight;
    if (currValue < prevValue) {
      // 违反单调性：合并 curr 到 prev
      prev.weightedSum += curr.weightedSum;
      prev.weight += curr.weight;
      buckets.splice(i, 1);
      // 回溯：合并后 prev 可能还需要和更早的 bucket 合并
      i = Math.max(1, i - 1);
    } else {
      i += 1;
    }
  }

  // 4. 转换为 IsotonicBucket
  return buckets.map((b) => ({
    minRawScore: b.minRawScore,
    probability: b.weight > 0 ? b.weightedSum / b.weight : 0,
  }));
}

// ============================================================
// Operating point 选择
// ============================================================

/** 阈值评估结果 */
export interface ThresholdEvaluation {
  /** 在该阈值下的 precision */
  precision: number;
  /** 在该阈值下的 recall */
  recall: number;
  /** 阈值本身 */
  threshold: number;
}

/** operating point 选择结果 */
export interface OperatingPoint {
  /** 是否可发布（在某个阈值下 precision >= minPrecision） */
  publishable: boolean;
  /** 选定的发布阈值 */
  publishThreshold: number;
  /** 验证集 precision */
  validationPrecision: number;
  /** 验证集 recall */
  validationRecall: number;
}

/**
 * 在给定阈值下评估 precision 和 recall
 *
 * 预测规则：rawScore >= threshold 视为正例
 *
 * @param points 校准数据点
 * @param threshold 阈值（raw score 域）
 */
export function evaluateThreshold(
  points: CalibrationPoint[],
  threshold: number,
): ThresholdEvaluation {
  let truePositive = 0;
  let falsePositive = 0;
  let falseNegative = 0;
  for (const p of points) {
    const predictedPositive = p.rawScore >= threshold;
    if (predictedPositive && p.label === 1) truePositive += 1;
    else if (predictedPositive && p.label === 0) falsePositive += 1;
    else if (!predictedPositive && p.label === 1) falseNegative += 1;
  }
  const predictedPositiveCount = truePositive + falsePositive;
  const actualPositiveCount = truePositive + falseNegative;
  const precision = predictedPositiveCount > 0 ? truePositive / predictedPositiveCount : 0;
  const recall = actualPositiveCount > 0 ? truePositive / actualPositiveCount : 0;
  return { precision, recall, threshold };
}

/**
 * 在满足 precision >= minPrecision 的前提下，选择 recall 最高的阈值
 *
 * 候选阈值集合：所有 raw score 值（每个 distinct rawScore 都作为一个候选切分点）
 * 若没有任何阈值满足 precision 条件，返回 publishable=false
 *
 * @param points 校准数据点
 * @param minPrecision 最低 precision 要求（通常 0.95）
 */
export function selectOperatingPoint(
  points: CalibrationPoint[],
  minPrecision: number,
): OperatingPoint {
  if (points.length === 0) {
    return {
      publishable: false,
      publishThreshold: 1,
      validationPrecision: 0,
      validationRecall: 0,
    };
  }

  // 候选阈值：所有 distinct rawScore（预测 ">= 阈值" 为正）
  // 加上一个略低于最小 rawScore 的阈值（预测全部为正）
  const distinctScores = [...new Set(points.map((p) => p.rawScore))].sort((a, b) => a - b);
  const minScore = distinctScores[0]!;
  // 候选阈值：从最小 rawScore 开始（最高 recall，可能 precision 低）
  // 到最大 rawScore（最低 recall，最高 precision）
  const candidateThresholds: number[] = [minScore, ...distinctScores];

  let bestThreshold = 1; // 默认不可发布
  let bestRecall = -1;
  let bestPrecision = 0;
  let anyPublishable = false;

  for (const threshold of candidateThresholds) {
    const evalResult = evaluateThreshold(points, threshold);
    if (evalResult.precision >= minPrecision && evalResult.recall > bestRecall) {
      bestRecall = evalResult.recall;
      bestThreshold = threshold;
      bestPrecision = evalResult.precision;
      anyPublishable = true;
    }
  }

  if (!anyPublishable) {
    return {
      publishable: false,
      publishThreshold: 1,
      validationPrecision: 0,
      validationRecall: 0,
    };
  }

  return {
    publishable: true,
    publishThreshold: bestThreshold,
    validationPrecision: bestPrecision,
    validationRecall: bestRecall,
  };
}

// ============================================================
// likelyThreshold 插值
// ============================================================

/**
 * 在 bucket 序列上插值找到 probability=targetProbability 对应的 raw score
 *
 * 规则：
 * - 若所有 bucket 概率均低于 target，返回最大 bucket 边界
 * - 若所有 bucket 概率均高于 target，返回最小 bucket 边界
 * - 否则线性插值
 *
 * @param buckets 保序回归 bucket 序列（单调非递减）
 * @param targetProbability 目标概率（通常 0.8）
 */
export function findLikelyThreshold(
  buckets: IsotonicBucket[],
  targetProbability: number,
): number {
  if (buckets.length === 0) return 0;

  // 全部低于 target
  const lastBucket = buckets[buckets.length - 1]!;
  if (lastBucket.probability < targetProbability) {
    return lastBucket.minRawScore;
  }

  // 全部高于 target
  const firstBucket = buckets[0]!;
  if (firstBucket.probability >= targetProbability) {
    return firstBucket.minRawScore;
  }

  // 找到第一个 probability >= target 的 bucket，在它和前一个 bucket 之间线性插值
  for (let i = 1; i < buckets.length; i++) {
    const prev = buckets[i - 1]!;
    const curr = buckets[i]!;
    if (curr.probability >= targetProbability) {
      // 在 [prev.probability, curr.probability] 之间插值
      const range = curr.probability - prev.probability;
      if (range === 0) return curr.minRawScore;
      const t = (targetProbability - prev.probability) / range;
      return prev.minRawScore + t * (curr.minRawScore - prev.minRawScore);
    }
  }
  return lastBucket.minRawScore;
}

// ============================================================
// 运行时校准
// ============================================================

/**
 * 根据校准配置将 raw score 映射为校准概率
 *
 * 使用 bucket 阶跃函数：
 * - rawScore 低于第一个 bucket 边界 → 返回第一个 bucket 概率
 * - rawScore 高于最后一个 bucket 边界 → 返回最后一个 bucket 概率
 * - 否则返回 rawScore 所在 bucket 的概率
 *
 * @param rawScore 规则公式输出的原始分数
 * @param config 该事件类型的校准配置
 */
export function calibrateProbability(
  rawScore: number,
  config: EventCalibrationConfig,
): number {
  const buckets = config.isotonicBuckets;
  if (buckets.length === 0) return 0;

  // 低于第一个 bucket 边界 → 返回第一个 bucket 概率
  const first = buckets[0]!;
  if (rawScore < first.minRawScore) {
    return first.probability;
  }

  // 找到 rawScore 所在的 bucket（最后一个 minRawScore <= rawScore 的 bucket）
  let result = first.probability;
  for (const bucket of buckets) {
    if (bucket.minRawScore <= rawScore) {
      result = bucket.probability;
    } else {
      break;
    }
  }
  return result;
}

/**
 * 判断候选事件是否应被发布
 *
 * @param rawScore 原始分数
 * @param config 该事件类型的校准配置
 * @returns 若应发布返回 { probability, calibrated: true }，否则返回 null
 */
export function shouldPublish(
  rawScore: number,
  config: EventCalibrationConfig,
): { probability: number } | null {
  if (!config.publishable) return null;
  const probability = calibrateProbability(rawScore, config);
  if (probability < config.publishThreshold) return null;
  return { probability };
}
