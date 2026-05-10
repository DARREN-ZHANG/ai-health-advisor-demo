import type { AnalysisPlan } from './analysis-plan';
import type { TaskContextPacket } from '../context/context-packet';

/** 证据解析结果 */
export interface EvidenceResolutionResult {
  /** 已解析的 evidence needs */
  resolved: Array<{
    need: AnalysisPlan['evidenceNeeds'][number];
    evidence: { data: unknown; evidenceIds: string[] };
  }>;
  /** 未满足的 required needs（需要进入 ReAct） */
  unresolved: AnalysisPlan['evidenceNeeds'][number][];
}

/**
 * 基于 AnalysisPlan 的 evidenceNeeds，从 TaskContextPacket 中解析证据。
 * 按优先级解析：
 * 1. 从 packet.evidence 中查找匹配 metric 的 EvidenceFact
 * 2. 从 packet.visibleCharts 中查找匹配 metric 的图表数据
 * 3. 从 packet.homepage?.trend7d 中查找匹配 metric 的趋势数据
 * 4. 未满足的 required needs 返回为 unresolved
 */
export function resolveEvidenceByPlan(
  plan: AnalysisPlan,
  packet: TaskContextPacket,
): EvidenceResolutionResult {
  const resolved: EvidenceResolutionResult['resolved'] = [];
  const unresolved: EvidenceResolutionResult['unresolved'] = [];

  for (const need of plan.evidenceNeeds) {
    const resolvedEvidence = tryResolveFromPacket(need, packet);

    if (resolvedEvidence) {
      resolved.push({ need, evidence: resolvedEvidence });
    } else if (need.required) {
      unresolved.push(need);
    }
    // optional 且未找到 → 不加入任何列表（可选证据缺失不影响流程）
  }

  return { resolved, unresolved };
}

/** 尝试从 packet 中解析单个 evidence need */
function tryResolveFromPacket(
  need: AnalysisPlan['evidenceNeeds'][number],
  packet: TaskContextPacket,
): { data: unknown; evidenceIds: string[] } | null {
  // 1. 从 evidence 中查找（H-5: 移除 source 过滤，按 metric 匹配; H-4: 加入 timeScope 过滤）
  const matchingEvidence = packet.evidence.filter(
    (e) => e.metric === need.metric
      && (!need.timeScope || !e.dateRange
        || isTimeScopeCompatible(need.timeScope, e.dateRange.start, e.dateRange.end)),
  );
  if (matchingEvidence.length > 0) {
    return {
      data: matchingEvidence.map((e) => ({
        id: e.id,
        metric: e.metric,
        value: e.value,
        unit: e.unit,
        derivation: e.derivation,
      })),
      evidenceIds: matchingEvidence.map((e) => e.id),
    };
  }

  // 2. 从 visibleCharts 中查找（增加 timeframe 校验）
  const matchingChart = packet.visibleCharts.find(
    (vc) => vc.metric === need.metric && (
      !need.timeScope || !vc.timeframe
      || need.timeScope === vc.timeframe
      || isTimeScopeCompatible(need.timeScope, vc.timeframe)
    ),
  );
  if (matchingChart) {
    return {
      data: {
        chartToken: matchingChart.chartToken,
        metric: matchingChart.metric,
        trend: matchingChart.dataSummary.trendDirection,
        latest: matchingChart.dataSummary.latest,
        average: matchingChart.dataSummary.average,
      },
      evidenceIds: matchingChart.evidenceIds,
    };
  }

  // 3. 从 homepage.trend7d 中查找（H-8: 增加 timeScope 兼容性校验）
  const matchingTrend = packet.homepage?.trend7d?.find(
    (ms) => ms.metric === need.metric && isTimeScopeCompatible(need.timeScope, '7d'),
  );
  if (matchingTrend) {
    return {
      data: {
        metric: matchingTrend.metric,
        trend: matchingTrend.trendDirection,
        latest: matchingTrend.latest,
        average: matchingTrend.average,
        deltaPctVsBaseline: matchingTrend.deltaPctVsBaseline,
      },
      evidenceIds: matchingTrend.evidenceIds,
    };
  }

  // 4. H-2: 从 advisorChat.relevantFacts 中查找（ADVISOR_CHAT 场景的精确数据源）
  const matchingFacts = packet.advisorChat?.relevantFacts?.filter(
    (f) => (f.factType === 'metric' || f.factType === 'trend' || f.factType === 'chart')
      && f.summary.includes(need.metric),
  );
  if (matchingFacts && matchingFacts.length > 0) {
    return {
      data: matchingFacts.map((f) => ({
        label: f.label,
        factType: f.factType,
        summary: f.summary,
      })),
      evidenceIds: matchingFacts.flatMap((f) => f.evidenceIds),
    };
  }

  return null;
}

/** 判断 need 的 timeScope 与数据源的 timeframe/dateRange 是否兼容 */
function isTimeScopeCompatible(needScope: string, chartTimeframe: string, _dateRangeEnd?: string): boolean {
  // timeScope → 可兼容的 timeframe 值列表（含别名）
  const scopeToTimeframe: Record<string, string[]> = {
    today: ['day', '1d', '24h'],
    week: ['day', 'week', '7d', '1d'],
    month: ['day', 'week', 'month', '30d', '7d'],
  };
  const compatible = scopeToTimeframe[needScope];
  return compatible ? compatible.includes(chartTimeframe) : needScope === chartTimeframe;
}
