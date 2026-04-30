import type {
  DeviceEvent,
  RecognizedEvent,
} from '@health-advisor/shared';

// ============================================================
// 咖啡因摄入概率检测器
// 基于传感器时序响应推导 possible_caffeine_intake
// 禁止使用 segmentId 或 segment.type 作弊
// ============================================================

/** 5 分钟时间桶的聚合数据 */
interface TimeBucket {
  time: string;
  minuteOffset: number;
  heartRates: number[];
  hrvRmssds: number[];
  stressLoads: number[];
  motions: number[];
  steps: number[];
  spo2Values: number[];
}

/** 候选锚点的分析结果 */
interface CandidateResult {
  t0: string;
  baseline: { avgHr: number; avgRmssd: number; avgStress: number; avgSpo2: number };
  response: { avgHr: number; avgRmssd: number; avgStress: number; avgSpo2: number; lowActivity: boolean };
  score: number;
  subScores: {
    hrScore: number;
    rmssdScore: number;
    stressScore: number;
    activityScore: number;
    timingScore: number;
    contextScore: number;
  };
  confounds: string[];
}

// ============================================================
// 子分数计算
// ============================================================

/** HR 子分数：response 内持续升高 */
function computeHrScore(baselineAvg: number, responseAvg: number, sustainedCount: number): number {
  const delta = responseAvg - baselineAvg;
  if (delta < 5) return 0;
  if (delta < 8) return sustainedCount >= 3 ? 0.4 : 0.2;
  if (delta < 14) return sustainedCount >= 3 ? 0.75 : 0.4;
  return sustainedCount >= 3 ? 1.0 : 0.5;
}

/** RMSSD 子分数：response 内下降 */
function computeRmssdScore(baselineAvg: number, responseAvg: number): number {
  if (baselineAvg <= 0) return 0;
  const dropPct = (baselineAvg - responseAvg) / baselineAvg;
  if (dropPct < 0.08) return 0;
  if (dropPct < 0.15) return 0.4;
  if (dropPct < 0.30) return 0.8;
  return 1.0;
}

/** stress 子分数：response 内上升 */
function computeStressScore(baselineAvg: number, responseAvg: number): number {
  const delta = responseAvg - baselineAvg;
  if (delta < 5) return 0;
  if (delta < 10) return 0.4;
  if (delta < 20) return 0.8;
  return 1.0;
}

/** 活动排除子分数 */
function computeActivityScore(avgMotion: number, avgSteps5min: number): number {
  if (avgMotion < 2.0 && avgSteps5min < 20) return 1.0;
  if (avgMotion < 3.0 && avgSteps5min < 40) return 0.6;
  return 0;
}

/** 时间窗子分数：peak 是否出现在合理范围 */
function computeTimingScore(peakOffsetMin: number): number {
  if (peakOffsetMin >= 30 && peakOffsetMin <= 90) return 1.0;
  if (peakOffsetMin >= 15 && peakOffsetMin <= 120) return 0.7;
  return 0.2;
}

/** drink/meal 上下文子分数 */
function computeContextScore(nearbyTypes: string[]): number {
  if (nearbyTypes.includes('drink_intake') || nearbyTypes.includes('meal_intake')) return 1.0;
  return 0;
}

// ============================================================
// 辅助工具
// ============================================================

/** 给时间戳加分钟 */
function addMinutes(timestamp: string, minutes: number): string {
  const date = new Date(`${timestamp}:00`);
  date.setMinutes(date.getMinutes() + minutes);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d}T${h}:${min}`;
}

/** 计算两个时间戳之间的分钟差 */
function diffMinutes(start: string, end: string): number {
  const s = new Date(`${start}:00`);
  const e = new Date(`${end}:00`);
  return Math.round((e.getTime() - s.getTime()) / 60000);
}

/** 数组平均值 */
function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/** 将事件按 5 分钟时间桶聚合 */
function buildTimeBuckets(events: DeviceEvent[], refTime: string): TimeBucket[] {
  const bucketMap = new Map<number, TimeBucket>();

  for (const e of events) {
    const offset = Math.floor(diffMinutes(refTime, e.measuredAt) / 5) * 5;
    let bucket = bucketMap.get(offset);
    if (!bucket) {
      bucket = {
        time: addMinutes(refTime, offset),
        minuteOffset: offset,
        heartRates: [],
        hrvRmssds: [],
        stressLoads: [],
        motions: [],
        steps: [],
        spo2Values: [],
      };
      bucketMap.set(offset, bucket);
    }

    if (typeof e.value !== 'number') continue;
    switch (e.metric) {
      case 'heartRate': bucket.heartRates.push(e.value); break;
      case 'hrvRmssd': bucket.hrvRmssds.push(e.value); break;
      case 'stressLoad': bucket.stressLoads.push(e.value); break;
      case 'motion': bucket.motions.push(e.value); break;
      case 'steps': bucket.steps.push(e.value); break;
      case 'spo2': bucket.spo2Values.push(e.value); break;
    }
  }

  return Array.from(bucketMap.values()).sort((a, b) => a.minuteOffset - b.minuteOffset);
}

// ============================================================
// 混杂因素检测
// ============================================================

/** 检查运动重叠（通过 response 窗口的运动和步数增量判断） */
function detectExerciseOverlap(responseBuckets: TimeBucket[]): boolean {
  const highMotionCount = responseBuckets.filter(
    (b) => avg(b.motions) > 2.0,
  ).length;
  // 超过一半的时间桶有高运动 => 可能是运动
  return highMotionCount > responseBuckets.length * 0.5;
}

/** 检查 SpO2 明显下降 */
function detectSpo2Drop(baselineAvg: number, responseAvg: number): boolean {
  return (baselineAvg - responseAvg) >= 2;
}

// ============================================================
// 主检测函数
// ============================================================

/**
 * 检测可能的咖啡因摄入
 *
 * 只基于已同步 sensor events 推导，不依赖 segment.type 或 segmentId。
 * 返回 confidence >= 0.72 的 possible_caffeine_intake 事件。
 */
export function detectPossibleCaffeineIntake(
  events: DeviceEvent[],
  profileId: string,
  currentTime: string,
): RecognizedEvent[] {
  if (events.length === 0) return [];

  const profileEvents = events.filter((e) => e.profileId === profileId);
  if (profileEvents.length === 0) return [];

  // 检查是否有 hrvRmssd 数据（必要条件）
  const hasRmssd = profileEvents.some((e) => e.metric === 'hrvRmssd');
  if (!hasRmssd) return [];

  // 检查是否有 stressLoad 数据（必要条件）
  const hasStress = profileEvents.some((e) => e.metric === 'stressLoad');
  if (!hasStress) return [];

  // 找到最早时间作为参考点
  const sorted = [...profileEvents].sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));
  const refTime = sorted[0]!.measuredAt;
  const buckets = buildTimeBuckets(profileEvents, refTime);

  if (buckets.length < 10) return []; // 数据太少

  // 扫描候选锚点：每 15 分钟一个候选
  const results: RecognizedEvent[] = [];
  const minBucketOffset = buckets[0]!.minuteOffset;
  const maxBucketOffset = buckets[buckets.length - 1]!.minuteOffset;

  for (let t0Offset = minBucketOffset + 60; t0Offset <= maxBucketOffset - 120; t0Offset += 15) {
    const candidate = analyzeCandidate(buckets, t0Offset, refTime);
    if (!candidate) continue;

    // 检查是否与已有结果重叠
    const t0Time = candidate.t0;
    const overlapping = results.some((r) => {
      const overlap = Math.min(diffMinutes(r.start, addMinutes(t0Time, 120)), diffMinutes(t0Time, r.end));
      return overlap > 30;
    });
    if (overlapping) continue;

    if (candidate.score >= 0.72) {
      results.push(buildCaffeineEvent(candidate, profileId, currentTime));
    }
  }

  return results;
}

/** 分析单个候选锚点 */
function analyzeCandidate(
  buckets: TimeBucket[],
  t0Offset: number,
  _refTime: string,
): CandidateResult | null {
  const t0Time = addMinutes(buckets[0]!.time, t0Offset);

  // baseline 窗口：t0-60 ~ t0-15
  const baselineBuckets = buckets.filter(
    (b) => b.minuteOffset >= t0Offset - 60 && b.minuteOffset < t0Offset - 15,
  );
  // response 窗口：t0+15 ~ t0+120
  const responseBuckets = buckets.filter(
    (b) => b.minuteOffset >= t0Offset + 15 && b.minuteOffset <= t0Offset + 120,
  );

  // 需要足够的基线和响应数据
  if (baselineBuckets.length < 3 || responseBuckets.length < 6) return null;

  // 计算基线指标（若数据不足则使用合理默认值）
  const baselineAvgHr = avg(baselineBuckets.flatMap((b) => b.heartRates)) || 68;
  const baselineAvgRmssd = avg(baselineBuckets.flatMap((b) => b.hrvRmssds)) || 50;
  const baselineAvgStress = avg(baselineBuckets.flatMap((b) => b.stressLoads)) || 25;
  const baselineAvgSpo2 = avg(baselineBuckets.flatMap((b) => b.spo2Values)) || 97;

  // 计算响应指标
  const responseAvgHr = avg(responseBuckets.flatMap((b) => b.heartRates));
  const responseAvgRmssd = avg(responseBuckets.flatMap((b) => b.hrvRmssds));
  const responseAvgStress = avg(responseBuckets.flatMap((b) => b.stressLoads));
  const responseAvgSpo2 = avg(responseBuckets.flatMap((b) => b.spo2Values));
  const responseAvgMotion = avg(responseBuckets.flatMap((b) => b.motions));
  // 步数是累积值，需要计算每5分钟增量而非直接取平均
  const responseSteps = responseBuckets.map((b) => b.steps);
  const stepDeltas: number[] = [];
  for (let i = 1; i < responseSteps.length; i++) {
    const prev = responseSteps[i - 1]!;
    const curr = responseSteps[i]!;
    if (prev.length > 0 && curr.length > 0) {
      stepDeltas.push(Math.max(0, Math.max(...curr) - Math.max(...prev)));
    }
  }
  const responseAvgStepsDelta = avg(stepDeltas);

  // 最低证据条件检查
  // 1. response 内至少 3 个点 HR 高于 baseline >= 8 bpm
  const hrElevatedBuckets = responseBuckets.filter(
    (b) => avg(b.heartRates) >= baselineAvgHr + 8,
  );
  if (hrElevatedBuckets.length < 3) return null;

  // 2. RMSSD 下降 >= 15%
  if (baselineAvgRmssd <= 0 || (baselineAvgRmssd - responseAvgRmssd) / baselineAvgRmssd < 0.15) return null;

  // 3. stress 上升 >= 10
  if (responseAvgStress - baselineAvgStress < 10) return null;

  // 4. 低活动（motion < 2.0 且每5分钟步数增量 < 20）
  if (responseAvgMotion >= 2.0 && responseAvgStepsDelta >= 20) return null;

  // 5. SpO2 不能明显下降
  if (baselineAvgSpo2 > 0 && baselineAvgSpo2 - responseAvgSpo2 >= 2) return null;

  // 混杂因素检查
  const confounds: string[] = [];
  const exerciseOverlap = detectExerciseOverlap(responseBuckets);
  if (exerciseOverlap) {
    // 运动重叠时不输出（已在最低条件排除，但保留逻辑完整性）
    return null;
  }

  if (baselineAvgSpo2 > 0 && responseAvgSpo2 < baselineAvgSpo2 - 1.5) {
    confounds.push('SpO2 轻微下降');
  }

  // 计算子分数
  const hrScore = computeHrScore(baselineAvgHr, responseAvgHr, hrElevatedBuckets.length);
  const rmssdScore = computeRmssdScore(baselineAvgRmssd, responseAvgRmssd);
  const stressScore = computeStressScore(baselineAvgStress, responseAvgStress);
  const activityScore = computeActivityScore(responseAvgMotion, responseAvgStepsDelta);

  // 找到 response 窗口中 HR 最高的时间点
  let peakOffset = t0Offset + 45; // 默认
  let peakHr = 0;
  for (const b of responseBuckets) {
    const bAvgHr = avg(b.heartRates);
    if (bAvgHr > peakHr) {
      peakHr = bAvgHr;
      peakOffset = b.minuteOffset;
    }
  }
  const timingScore = computeTimingScore(peakOffset - t0Offset);
  const contextScore = 0; // v1 没有 drink/meal 上下文

  // 总分计算（权重加权和）
  const score =
    hrScore * 0.35 +
    rmssdScore * 0.30 +
    stressScore * 0.15 +
    activityScore * 0.10 +
    timingScore * 0.05 +
    contextScore * 0.05;

  // 焦虑混杂扣分
  const finalScore = confounds.length > 0 ? score * 0.75 : score;

  return {
    t0: t0Time,
    baseline: {
      avgHr: baselineAvgHr,
      avgRmssd: baselineAvgRmssd,
      avgStress: baselineAvgStress,
      avgSpo2: baselineAvgSpo2,
    },
    response: {
      avgHr: responseAvgHr,
      avgRmssd: responseAvgRmssd,
      avgStress: responseAvgStress,
      avgSpo2: responseAvgSpo2,
      lowActivity: responseAvgMotion < 2.0 && responseAvgStepsDelta < 20,
    },
    score: finalScore,
    subScores: { hrScore, rmssdScore, stressScore, activityScore, timingScore, contextScore },
    confounds,
  };
}

/** 构建咖啡因摄入 recognized event */
function buildCaffeineEvent(
  candidate: CandidateResult,
  profileId: string,
  currentTime: string,
): RecognizedEvent {
  const startTime = candidate.t0;
  const endTime = addMinutes(startTime, 120); // response window 结束
  const durationMin = diffMinutes(startTime, endTime);

  const hrDelta = Math.round(candidate.response.avgHr - candidate.baseline.avgHr);
  const rmssdDropPct = candidate.baseline.avgRmssd > 0
    ? Math.round(((candidate.baseline.avgRmssd - candidate.response.avgRmssd) / candidate.baseline.avgRmssd) * 100)
    : 0;
  const stressDelta = Math.round(candidate.response.avgStress - candidate.baseline.avgStress);

  const evidence: string[] = [
    `recognized possible caffeine response`,
    `HR +${hrDelta}bpm, RMSSD -${rmssdDropPct}%, stress +${stressDelta}`,
    `low motion and low steps, SpO2 stable`,
    `confidence ${Math.round(candidate.score * 100)}%`,
  ];

  if (candidate.confounds.length > 0) {
    evidence.push(`confounds: ${candidate.confounds.join(', ')}`);
  }

  return {
    recognizedEventId: `re_possible_caffeine_intake_${startTime.replace(/[-T:]/g, '')}`,
    profileId,
    type: 'possible_caffeine_intake',
    start: startTime,
    end: endTime,
    confidence: Math.round(candidate.score * 100) / 100,
    evidence,
    sourceSegmentId: undefined, // 不暴露 segmentId
  };
}
