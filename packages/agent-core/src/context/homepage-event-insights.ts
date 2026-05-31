import type { HomepageSemanticEventType } from './context-packet';

export function normalizeHomepageEventType(eventType: string): HomepageSemanticEventType {
  switch (eventType) {
    case 'sleep':
    case 'nap':
      return 'sleep_end';
    case 'meal_intake':
      return 'meal';
    case 'deep_focus':
      return 'work_focus';
    case 'prolonged_sedentary':
      return 'work_sedentary';
    case 'relaxation':
      return 'rest_break';
    case 'walk':
    case 'steady_cardio':
      return 'cardio_workout';
    case 'intermittent_exercise':
    case 'strength_training':
      return 'hiit_workout';
    case 'anxiety_episode':
      return 'stress_spike';
    case 'caffeine_intake':
    case 'possible_caffeine_intake':
      return 'possible_caffeine_intake';
    case 'alcohol_intake':
    case 'possible_alcohol_intake':
      return 'possible_alcohol_intake';
    default:
      return 'unknown';
  }
}

import type {
  EventBodyTension,
  EventPhysiologySummary,
  HomepageContextPacket,
  HomepageEventInsight,
  Latest24hMetric,
  RecommendedFocus,
  RecoveryContextSummary,
} from './context-packet';

export interface BuildHomepageEventInsightsInput {
  homepage: Pick<HomepageContextPacket, 'recentEvents' | 'latest24h' | 'trend7d' | 'rulesInsights'>;
  demoNow?: string;
}

export function buildHomepageEventInsights(input: BuildHomepageEventInsightsInput): HomepageEventInsight[] {
  const { homepage, demoNow } = input;
  return homepage.recentEvents.map((event, index) => {
    const eventType = normalizeHomepageEventType(event.type);
    const physiology = buildPhysiology(eventType, homepage.latest24h.metrics);
    const recoveryContext = buildRecoveryContext(homepage.latest24h.metrics);
    const tension = determineEventBodyTension(eventType, homepage.latest24h.metrics, homepage.rulesInsights);
    const recommendedFocus = buildRecommendedFocus(eventType, tension);
    return {
      eventId: event.evidenceIds[0] ?? `${event.type}_${event.start}`,
      eventType,
      priority: index === 0 ? 'high' : 'medium',
      timeRelation: formatTimeRelation(event.end, demoNow),
      headline: buildHeadline(eventType, event.durationMin),
      physiology,
      recoveryContext,
      tension,
      recommendedFocus,
      actionIntents: [],
      evidenceIds: [...event.evidenceIds, ...collectMetricEvidenceIds(homepage.latest24h.metrics)],
    };
  });
}

function metric(metrics: Latest24hMetric[], name: string): Latest24hMetric | undefined {
  return metrics.find((m) => m.metric === name);
}

function buildPhysiology(eventType: ReturnType<typeof normalizeHomepageEventType>, metrics: Latest24hMetric[]): EventPhysiologySummary[] {
  const hrv = metric(metrics, 'hrv');
  const restingHr = metric(metrics, 'resting_hr');
  const spo2 = metric(metrics, 'spo2');
  const stress = metric(metrics, 'stress_load');
  const sleep = metric(metrics, 'sleep_total');

  const summaries: EventPhysiologySummary[] = [];

  if (hrv?.value !== undefined) {
    summaries.push({
      metric: 'hrv',
      value: hrv.value,
      unit: hrv.unit,
      qualifier: hrv.status === 'attention' || hrv.status === 'critical' ? 'compressed' : 'normal',
      interpretation: hrv.status === 'attention' || hrv.status === 'critical'
        ? 'HRV 处于压缩状态，提示自主神经恢复压力偏高'
        : 'HRV 状态稳定，可作为恢复背景参考',
      evidenceId: hrv.evidenceId,
    });
  }

  if (restingHr?.value !== undefined) {
    summaries.push({
      metric: 'heart_rate',
      value: restingHr.value,
      unit: restingHr.unit,
      qualifier: restingHr.status === 'attention' || restingHr.status === 'critical' ? 'elevated' : 'normal',
      interpretation: restingHr.status === 'attention' || restingHr.status === 'critical'
        ? '心率偏高，说明身体仍处在较高唤醒或负荷状态'
        : '心率处于平稳范围，可支持当前活动安排',
      evidenceId: restingHr.evidenceId,
    });
  }

  if (spo2?.value !== undefined) {
    summaries.push({
      metric: 'spo2',
      value: spo2.value,
      unit: spo2.unit,
      qualifier: spo2.status === 'critical' ? 'low' : spo2.status === 'attention' ? 'low' : 'normal',
      interpretation: spo2.status === 'critical'
        ? '血氧处于异常风险区间，需要优先处理安全边界'
        : spo2.status === 'attention'
          ? '血氧偏低，需关注呼吸状态和佩戴质量'
          : '血氧稳定，可作为呼吸状态背景',
      evidenceId: spo2.evidenceId,
    });
  }

  if (stress?.value !== undefined) {
    summaries.push({
      metric: 'stress',
      value: stress.value,
      unit: stress.unit,
      qualifier: stress.status === 'attention' || stress.status === 'critical' ? 'elevated' : 'normal',
      interpretation: stress.status === 'attention' || stress.status === 'critical'
        ? '压力负荷偏高，当前事件更容易放大疲劳感'
        : '压力负荷平稳',
      evidenceId: stress.evidenceId,
    });
  }

  if (sleep?.value !== undefined && eventType !== 'sleep_end') {
    summaries.push({
      metric: 'sleep',
      value: sleep.value,
      unit: sleep.unit,
      qualifier: sleep.status === 'attention' || sleep.status === 'critical' ? 'low' : 'normal',
      interpretation: sleep.status === 'attention' || sleep.status === 'critical'
        ? '过去 24h 睡眠恢复不足，当前事件需要降负荷处理'
        : '过去 24h 睡眠恢复可作为当前事件的支撑背景',
      evidenceId: sleep.evidenceId,
    });
  }

  return summaries;
}

function determineEventBodyTension(
  eventType: ReturnType<typeof normalizeHomepageEventType>,
  metrics: Latest24hMetric[],
  rulesInsights: HomepageContextPacket['rulesInsights'],
): EventBodyTension {
  if (metrics.some((m) => m.status === 'critical') || rulesInsights.some((r) => r.severity === 'critical')) {
    return { level: 'critical', summary: '当前存在需要优先处理的异常信号', reason: 'critical metric or rule insight present' };
  }

  const hrvAttention = metric(metrics, 'hrv')?.status === 'attention';
  const hrAttention = metric(metrics, 'resting_hr')?.status === 'attention';
  const stressAttention = metric(metrics, 'stress_load')?.status === 'attention';
  const sleepAttention = metric(metrics, 'sleep_total')?.status === 'attention';

  if ((eventType === 'work_focus' || eventType === 'work_sedentary') && (hrvAttention || hrAttention || stressAttention)) {
    return { level: 'high', summary: '认知或静止负荷已经累积，需要主动重置', reason: 'work event with HRV, heart rate, or stress attention' };
  }
  if ((eventType === 'cardio_workout' || eventType === 'hiit_workout') && (sleepAttention || hrvAttention)) {
    return { level: 'high', summary: '运动负荷与恢复不足叠加，建议调整训练策略', reason: 'workout with sleep or HRV attention' };
  }
  if ((eventType === 'possible_caffeine_intake' || eventType === 'possible_alcohol_intake') && (hrvAttention || hrAttention || stressAttention)) {
    return { level: 'watch', summary: '摄入相关信号可能影响今晚恢复，需要保护睡眠窗口', reason: 'intake event with recovery attention' };
  }

  return { level: 'positive', summary: '事件与当前恢复状态基本匹配', reason: 'no critical or attention conflict detected' };
}

function buildRecoveryContext(metrics: Latest24hMetric[]): RecoveryContextSummary[] {
  const sleep = metric(metrics, 'sleep_total');
  const hrv = metric(metrics, 'hrv');
  const contexts: RecoveryContextSummary[] = [];

  if (sleep) {
    contexts.push({
      source: 'latest24h',
      metric: 'sleep_total',
      relation: sleep.status === 'normal' ? 'supports' : sleep.status === 'missing' ? 'missing' : 'conflicts',
      summary: sleep.status === 'normal'
        ? '过去 24h 睡眠可作为当前事件的恢复底子'
        : sleep.status === 'missing'
          ? '缺少最近睡眠数据，无法完整判断恢复背景'
          : '过去 24h 睡眠不足，当前事件需要更保守处理',
      evidenceId: sleep.evidenceId,
    });
  }

  if (hrv) {
    contexts.push({
      source: 'latest24h',
      metric: 'hrv',
      relation: hrv.status === 'normal' ? 'supports' : hrv.status === 'missing' ? 'missing' : 'conflicts',
      summary: hrv.status === 'normal'
        ? 'HRV 状态支持当前活动安排'
        : hrv.status === 'missing'
          ? '缺少 HRV 数据，无法判断自主神经恢复状态'
          : 'HRV 走弱，提示恢复压力偏高',
      evidenceId: hrv.evidenceId,
    });
  }

  return contexts;
}

function buildRecommendedFocus(
  eventType: ReturnType<typeof normalizeHomepageEventType>,
  tension: EventBodyTension,
): RecommendedFocus[] {
  if (tension.level === 'critical') {
    return [
      { category: 'medical_attention', action: '如伴随胸闷、气短或明显不适，及时就医评估', timing: '现在', rationale: '当前存在异常风险信号，应优先处理安全边界' },
    ];
  }

  if (eventType === 'work_focus' || eventType === 'work_sedentary') {
    return [
      { category: 'movement_reset', action: '起身轻走并活动肩颈', durationMin: 10, rationale: '帮助从静止和认知负荷中切换出来' },
      { category: 'breathing_reset', action: '做一组缓慢呼吸', durationMin: 3, rationale: '用延长呼气降低交感神经兴奋' },
    ];
  }

  if (eventType === 'cardio_workout' || eventType === 'hiit_workout') {
    return [
      { category: 'hydration', action: '小口补水并做轻度走动冷身', durationMin: 10, rationale: '帮助心率平稳回落并支持循环恢复' },
      { category: 'sleep_protection', action: '睡前降低刺激和屏幕暴露', timing: '今晚睡前 60 min', rationale: '保护运动后的深睡恢复窗口' },
    ];
  }

  return [
    { category: 'movement_reset', action: '安排一次轻量活动切换状态', durationMin: 10, rationale: '帮助身体从当前事件平稳过渡到下一阶段' },
  ];
}

function formatTimeRelation(eventEnd: string, demoNow?: string): string {
  if (!demoNow) return '最近发生';
  const endMs = new Date(`${eventEnd}:00`).getTime();
  const nowMs = new Date(`${demoNow}:00`).getTime();
  const diffMin = Math.max(0, Math.round((nowMs - endMs) / 60000));
  if (diffMin < 60) return `刚结束约 ${diffMin} min`;
  const hours = Math.floor(diffMin / 60);
  const minutes = diffMin % 60;
  return `约 ${hours}h${minutes > 0 ? `${minutes}min` : ''} 前结束`;
}

function buildHeadline(eventType: ReturnType<typeof normalizeHomepageEventType>, durationMin: number): string {
  switch (eventType) {
    case 'work_focus':
      return `连续专注 ${durationMin} min，认知负荷正在累积`;
    case 'work_sedentary':
      return `连续静止 ${durationMin} min，循环和体态需要重置`;
    case 'cardio_workout':
    case 'hiit_workout':
      return `完成 ${durationMin} min 训练，身体进入恢复窗口`;
    case 'sleep_end':
      return `刚结束一段 ${durationMin} min 睡眠，需要评估恢复质量`;
    default:
      return `最近事件持续 ${durationMin} min，需要结合恢复背景判断`;
  }
}

function collectMetricEvidenceIds(metrics: Latest24hMetric[]): string[] {
  return metrics
    .map((item) => item.evidenceId)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
}
