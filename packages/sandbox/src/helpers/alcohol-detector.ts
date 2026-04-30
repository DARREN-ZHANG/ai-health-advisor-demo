import type {
  DeviceEvent,
  RecognizedEvent,
} from '@health-advisor/shared';

// ============================================================
// 饮酒摄入概率检测器
// 基于传感器时序响应推导 possible_alcohol_intake
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
  if (delta < 3) return 0;
  if (delta < 5) return sustainedCount >= 3 ? 0.4 : 0.2;
  if (delta < 9) return sustainedCount >= 3 ? 0.75 : 0.4;
  return sustainedCount >= 3 ? 1.0 : 0.5;
}

/** RMSSD 子分数：response 内下降（绝对值，单位 ms） */
function computeRmssdScore(baselineAvg: number, responseAvg: number): number {
  const dropMs = baselineAvg - responseAvg;
  if (dropMs < 3) return 0;
  if (dropMs < 5) return 0.4;
  if (dropMs < 12) return 0.8;
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

/** 活动排除子分数（酒精场景略宽松） */
function computeActivityScore(avgMotion: number, avgSteps5min: number): number {
  if (avgMotion < 2.0 && avgSteps5min < 20) return 1.0;
  if (avgMotion < 2.5 && avgSteps5min < 30) return 0.6;
  return 0;
}

/** 时间窗子分数：peak 是否出现在合理范围 */
function computeTimingScore(peakOffsetMin: number): number {
  if (peakOffsetMin >= 30 && peakOffsetMin <= 80) return 1.0;
  if (peakOffsetMin >= 20 && peakOffsetMin <= 120) return 0.7;
  return 0.2;
}

/** meal 上下文子分数 */
function computeContextScore(hasNearbyMeal: boolean): number {
  return hasNearbyMeal ? 1.0 : 0;
}

/** 检查 t0 附近是否存在进餐特征（不使用 segmentId） */
function hasNearbyMealIntake(allEvents: DeviceEvent[], t0Time: string): boolean {
  const windowStart = addMinutes(t0Time, -30);
  const windowEnd = addMinutes(t0Time, 30);

  const motions: number[] = [];
  const hrs: number[] = [];
  const stepsValues: number[] = [];

  for (const e of allEvents) {
    if (!e.measuredAt || e.measuredAt < windowStart || e.measuredAt > windowEnd) continue;
    if (typeof e.value !== 'number') continue;
    if (e.metric === 'motion') motions.push(e.value);
    if (e.metric === 'heartRate') hrs.push(e.value);
    if (e.metric === 'steps') stepsValues.push(e.value);
  }

  if (motions.length === 0 || hrs.length === 0) return false;

  const avgMotion = avg(motions);
  const avgHr = avg(hrs);
  const maxSteps = stepsValues.length > 0 ? Math.max(...stepsValues) : 0;

  // meal_intake 特征：低活动(2~7)、中等心率(60~90)、低步数
  return avgMotion >= 2 && avgMotion <= 7 && avgHr >= 60 && avgHr <= 90 && maxSteps < 50;
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

/** 检查咖啡因重叠（通过传感器模式判断，不使用 segmentId） */
function detectCaffeineOverlap(
  _responseBuckets: TimeBucket[],
  allEvents: DeviceEvent[],
  t0Time: string,
): boolean {
  // 检查 t0 ± 90min 窗口内是否存在咖啡因特征模式：高 HR (>85) + 高 stress (>25) + 低 RMSSD (<42)
  const windowStart = addMinutes(t0Time, -90);
  const windowEnd = addMinutes(t0Time, 90);

  const hrValues: number[] = [];
  const stressValues: number[] = [];
  const rmssdValues: number[] = [];

  for (const e of allEvents) {
    if (!e.measuredAt || e.measuredAt < windowStart || e.measuredAt > windowEnd) continue;
    if (typeof e.value !== 'number') continue;
    if (e.metric === 'heartRate') hrValues.push(e.value);
    if (e.metric === 'stressLoad') stressValues.push(e.value);
    if (e.metric === 'hrvRmssd') rmssdValues.push(e.value);
  }

  if (hrValues.length === 0 || stressValues.length === 0 || rmssdValues.length === 0) {
    return false;
  }

  const avgHr = avg(hrValues);
  const avgStress = avg(stressValues);
  const avgRmssd = avg(rmssdValues);

  // 咖啡因特征：显著高 HR + 高 stress + 低 RMSSD
  return avgHr > 85 && avgStress > 25 && avgRmssd < 42;
}

/** 检查睡眠重叠（包含 baseline 和 response 窗口） */
function detectSleepOverlap(buckets: TimeBucket[], t0Offset: number): boolean {
  const sleepWindow = buckets.filter(
    (b) => b.minuteOffset >= t0Offset - 60 && b.minuteOffset <= t0Offset + 120,
  );
  // 如果窗口内运动极低且心率低，可能是睡眠
  if (sleepWindow.length === 0) return false;
  const lowMotion = sleepWindow.filter((b) => avg(b.motions) < 0.5).length;
  const lowHr = sleepWindow.filter((b) => avg(b.heartRates) < 60).length;
  return lowMotion > sleepWindow.length * 0.7 && lowHr > sleepWindow.length * 0.7;
}

// ============================================================
// 主检测函数
// ============================================================

/**
 * 检测可能的饮酒摄入
 *
 * 只基于已同步 sensor events 推导，不依赖 segment.type 或 segmentId。
 * 返回 confidence >= 0.70 的 possible_alcohol_intake 事件。
 */
export function detectPossibleAlcoholIntake(
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

  for (let t0Offset = minBucketOffset + 60; t0Offset <= maxBucketOffset - 120; t0Offset += 5) {
    const candidate = analyzeCandidate(buckets, t0Offset, refTime, profileEvents);
    if (!candidate) continue;

    // 检查是否与已有结果重叠
    const t0Time = candidate.t0;
    const candidateEnd = addMinutes(t0Time, 120);
    const overlapping = results.some((r) => {
      const overlapStart = r.start > t0Time ? r.start : t0Time;
      const overlapEnd = r.end < candidateEnd ? r.end : candidateEnd;
      const overlapMin = diffMinutes(overlapStart, overlapEnd);
      return overlapMin > 30;
    });
    if (overlapping) continue;

    if (candidate.score >= 0.70) {
      results.push(buildAlcoholEvent(candidate, profileId, currentTime));
    }
  }

  return results;
}

/** 分析单个候选锚点 */
function analyzeCandidate(
  buckets: TimeBucket[],
  t0Offset: number,
  _refTime: string,
  allEvents: DeviceEvent[],
): CandidateResult | null {
  const t0Time = addMinutes(buckets[0]!.time, t0Offset);

  // baseline 窗口：t0-60 ~ t0-15
  const baselineBuckets = buckets.filter(
    (b) => b.minuteOffset >= t0Offset - 60 && b.minuteOffset < t0Offset - 15,
  );
  // response 窗口：t0+20 ~ t0+120（酒精起效稍慢）
  const responseBuckets = buckets.filter(
    (b) => b.minuteOffset >= t0Offset + 20 && b.minuteOffset <= t0Offset + 120,
  );

  // 需要足够的基线和响应数据
  if (baselineBuckets.length < 3 || responseBuckets.length < 6) return null;

  // 计算基线指标（若数据不足则使用合理默认值）
  const baselineAvgHr = avg(baselineBuckets.flatMap((b) => b.heartRates)) || 68;
  const baselineAvgRmssd = avg(baselineBuckets.flatMap((b) => b.hrvRmssds)) || 50;
  const baselineAvgStress = avg(baselineBuckets.flatMap((b) => b.stressLoads)) || 25;
  const baselineAvgSpo2 = avg(baselineBuckets.flatMap((b) => b.spo2Values)) || 97;

  // 计算响应指标（response 窗口必须有核心指标数据）
  const responseHrValues = responseBuckets.flatMap((b) => b.heartRates);
  const responseRmssdValues = responseBuckets.flatMap((b) => b.hrvRmssds);
  const responseStressValues = responseBuckets.flatMap((b) => b.stressLoads);
  const responseSpo2Values = responseBuckets.flatMap((b) => b.spo2Values);
  const responseMotionValues = responseBuckets.flatMap((b) => b.motions);

  if (responseHrValues.length === 0 || responseRmssdValues.length === 0 || responseStressValues.length === 0) {
    return null;
  }

  const responseAvgHr = avg(responseHrValues);
  const responseAvgRmssd = avg(responseRmssdValues);
  const responseAvgStress = avg(responseStressValues);
  const responseAvgSpo2 = responseSpo2Values.length > 0 ? avg(responseSpo2Values) : 97;
  const responseAvgMotion = avg(responseMotionValues);
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
  // 1. response 内至少 3 个点 HR 高于 baseline >= 4 bpm
  const hrElevatedBuckets = responseBuckets.filter(
    (b) => avg(b.heartRates) >= baselineAvgHr + 4,
  );
  if (hrElevatedBuckets.length < 3) return null;

  // 2. RMSSD 下降 >= 4 ms
  if (baselineAvgRmssd - responseAvgRmssd < 4) return null;

  // 3. stress 上升 >= 5
  if (responseAvgStress - baselineAvgStress < 5) return null;

  // 4. 低活动（motion < 2.5 且每5分钟步数增量 < 30）
  if (responseAvgMotion >= 2.5 || responseAvgStepsDelta >= 30) return null;

  // 5. SpO2 不能明显下降
  if (baselineAvgSpo2 > 0 && baselineAvgSpo2 - responseAvgSpo2 >= 2) return null;

  // 混杂因素检查
  const confounds: string[] = [];

  // 运动重叠
  const exerciseOverlap = detectExerciseOverlap(responseBuckets);
  if (exerciseOverlap) {
    return null;
  }

  // 睡眠重叠
  const sleepOverlap = detectSleepOverlap(buckets, t0Offset);
  if (sleepOverlap) {
    return null;
  }

  // SpO2 轻微下降（不直接排除，但记录为混杂）
  if (baselineAvgSpo2 > 0 && responseAvgSpo2 < baselineAvgSpo2 - 1.5) {
    confounds.push('SpO2 轻微下降');
  }

  // 咖啡因重叠
  const caffeineOverlap = detectCaffeineOverlap(responseBuckets, allEvents, t0Time);
  if (caffeineOverlap) {
    confounds.push('存在咖啡因摄入，可能与酒精响应混淆');
  }

  // 计算子分数
  const hrScore = computeHrScore(baselineAvgHr, responseAvgHr, hrElevatedBuckets.length);
  const rmssdScore = computeRmssdScore(baselineAvgRmssd, responseAvgRmssd);
  const stressScore = computeStressScore(baselineAvgStress, responseAvgStress);
  const activityScore = computeActivityScore(responseAvgMotion, responseAvgStepsDelta);

  // 找到 response 窗口中 HR 最高的时间点
  let peakOffset = t0Offset + 50; // 默认
  let peakHr = 0;
  for (const b of responseBuckets) {
    const bAvgHr = avg(b.heartRates);
    if (bAvgHr > peakHr) {
      peakHr = bAvgHr;
      peakOffset = b.minuteOffset;
    }
  }
  const timingScore = computeTimingScore(peakOffset - t0Offset);

  // Context：检查附近是否有 meal_intake 特征
  const nearbyMeal = hasNearbyMealIntake(allEvents, t0Time);
  const contextScore = computeContextScore(nearbyMeal);

  // 总分计算（权重加权和）
  const score =
    hrScore * 0.30 +
    rmssdScore * 0.35 +
    stressScore * 0.15 +
    activityScore * 0.10 +
    timingScore * 0.05 +
    contextScore * 0.05;

  // 混杂扣分：咖啡因重叠 ×0.85，其他混杂 ×0.90
  let finalScore = score;
  if (confounds.some((c) => c.includes('咖啡因'))) {
    finalScore = score * 0.85;
  } else if (confounds.length > 0) {
    finalScore = score * 0.90;
  }

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
      lowActivity: responseAvgMotion < 2.5 && responseAvgStepsDelta < 30,
    },
    score: finalScore,
    subScores: { hrScore, rmssdScore, stressScore, activityScore, timingScore, contextScore },
    confounds,
  };
}

/** 构建饮酒摄入 recognized event */
function buildAlcoholEvent(
  candidate: CandidateResult,
  profileId: string,
  _currentTime: string,
): RecognizedEvent {
  const startTime = candidate.t0;
  const endTime = addMinutes(startTime, 120); // response window 结束

  const hrDelta = Math.round(candidate.response.avgHr - candidate.baseline.avgHr);
  const rmssdDropMs = Math.round(candidate.baseline.avgRmssd - candidate.response.avgRmssd);
  const stressDelta = Math.round(candidate.response.avgStress - candidate.baseline.avgStress);

  const evidence: string[] = [
    `recognized possible alcohol response`,
    `HR +${hrDelta}bpm, RMSSD -${rmssdDropMs}ms, stress +${stressDelta}`,
    `low motion and low steps, SpO2 stable`,
    `confidence ${Math.round(candidate.score * 100)}%`,
  ];

  if (candidate.confounds.length > 0) {
    evidence.push(`confounds: ${candidate.confounds.join(', ')}`);
  }

  return {
    recognizedEventId: `re_possible_alcohol_intake_${startTime.replace(/[-T:]/g, '')}`,
    profileId,
    type: 'possible_alcohol_intake',
    start: startTime,
    end: endTime,
    confidence: Math.round(candidate.score * 100) / 100,
    evidence,
    sourceSegmentId: undefined, // 不暴露 segmentId
  };
}
