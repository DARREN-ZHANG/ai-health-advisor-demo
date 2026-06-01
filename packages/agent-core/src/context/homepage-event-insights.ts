import type { HomepageSemanticEventType } from './context-packet';
import {
  decideRecoveryMetricRelevance,
  isEveningSleepActionWindow,
  isSleepMetric,
} from './homepage-recovery-relevance';

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
  ActionIntentCandidate,
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
    const physiology = buildEventWindowPhysiology(event.eventWindow);
    const recoveryContext = buildRecoveryContext(homepage.latest24h.metrics, eventType, demoNow);
    const visibleRecoveryEvidenceIds = recoveryContext
      .filter((ctx) => ctx.visibility === 'material')
      .map((ctx) => ctx.evidenceId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
    const tension = determineEventBodyTension(eventType, event.eventWindow, homepage.latest24h.metrics, homepage.rulesInsights);
    const recommendedFocus = buildRecommendedFocus(eventType, tension, demoNow);
    return {
      eventId: event.evidenceIds[0] ?? `${event.type}_${event.start}`,
      eventType,
      priority: index === 0 ? 'high' : 'medium',
      timeRelation: formatTimeRelation(event.end, demoNow),
      headline: buildHeadline(eventType, event.durationMin),
      eventWindow: event.eventWindow,
      physiology,
      recoveryContext,
      tension,
      recommendedFocus,
      actionIntents: buildActionIntentCandidates(eventType, recommendedFocus),
      evidenceIds: [
        ...event.evidenceIds,
        ...event.eventWindow?.evidenceIds ?? [],
        ...visibleRecoveryEvidenceIds,
      ],
    };
  });
}

function metric(metrics: Latest24hMetric[], name: string): Latest24hMetric | undefined {
  return metrics.find((m) => m.metric === name);
}

function buildEventWindowPhysiology(
  eventWindow: HomepageContextPacket['recentEvents'][number]['eventWindow'],
): EventPhysiologySummary[] {
  if (!eventWindow || eventWindow.coverage === 'missing') return [];

  return eventWindow.metrics.map((metric) => {
    switch (metric.metric) {
      case 'heart_rate':
        return {
          metric: 'heart_rate',
          value: metric.max ?? metric.latest,
          unit: metric.unit,
          qualifier: metric.qualifier === 'elevated' ? 'elevated' : 'normal',
          interpretation: metric.interpretation,
          evidenceId: metric.evidenceId,
        };
      case 'hrv_rmssd':
        return {
          metric: 'hrv',
          value: metric.latest,
          unit: metric.unit,
          qualifier: metric.qualifier === 'compressed' ? 'compressed' : metric.qualifier === 'recovering' ? 'recovering' : 'normal',
          interpretation: metric.interpretation,
          evidenceId: metric.evidenceId,
        };
      case 'spo2':
        return {
          metric: 'spo2',
          value: metric.min ?? metric.latest,
          unit: metric.unit,
          qualifier: metric.qualifier === 'low' ? 'low' : 'normal',
          interpretation: metric.interpretation,
          evidenceId: metric.evidenceId,
        };
      case 'motion':
        return {
          metric: 'motion',
          value: metric.average,
          unit: metric.unit,
          qualifier: metric.qualifier === 'elevated' ? 'elevated' : 'normal',
          interpretation: metric.interpretation,
          evidenceId: metric.evidenceId,
        };
      case 'steps':
        return {
          metric: 'activity',
          value: metric.max,
          unit: metric.unit,
          qualifier: metric.qualifier === 'elevated' ? 'elevated' : 'normal',
          interpretation: metric.interpretation,
          evidenceId: metric.evidenceId,
        };
      case 'stress_load':
        return {
          metric: 'stress',
          value: metric.max ?? metric.latest,
          unit: metric.unit,
          qualifier: metric.qualifier === 'elevated' ? 'elevated' : 'normal',
          interpretation: metric.interpretation,
          evidenceId: metric.evidenceId,
        };
    }
  });
}

function determineEventBodyTension(
  eventType: ReturnType<typeof normalizeHomepageEventType>,
  eventWindow: HomepageContextPacket['recentEvents'][number]['eventWindow'],
  metrics: Latest24hMetric[],
  rulesInsights: HomepageContextPacket['rulesInsights'],
): EventBodyTension {
  if (metrics.some((m) => m.status === 'critical') || rulesInsights.some((r) => r.severity === 'critical')) {
    return { level: 'critical', summary: '当前存在需要优先处理的异常信号', reason: 'critical metric or rule insight present' };
  }

  const eventMetrics = eventWindow?.metrics ?? [];
  const hrvCompressed = eventMetrics.some((m) => m.metric === 'hrv_rmssd' && m.qualifier === 'compressed');
  const hrElevated = eventMetrics.some((m) => m.metric === 'heart_rate' && m.qualifier === 'elevated');
  const stressElevated = eventMetrics.some((m) => m.metric === 'stress_load' && m.qualifier === 'elevated');
  const lowMotion = eventMetrics.some((m) => m.metric === 'motion' && (m.average ?? 0) < 1);

  if ((eventType === 'work_focus' || eventType === 'work_sedentary') && (hrvCompressed || hrElevated || stressElevated || lowMotion)) {
    return { level: 'high', summary: '这次工作事件内已经出现神经或静止负荷累积', reason: 'event-window work load markers present' };
  }
  if ((eventType === 'cardio_workout' || eventType === 'hiit_workout') && (hrvCompressed || hrElevated)) {
    return { level: 'watch', summary: '运动事件已经进入恢复窗口，需要降低后续刺激', reason: 'event-window workout recovery markers present' };
  }
  if ((eventType === 'possible_caffeine_intake' || eventType === 'possible_alcohol_intake') && (hrvCompressed || hrElevated || stressElevated)) {
    return { level: 'watch', summary: '摄入相关事件内存在恢复受压信号，需要保护今晚睡眠窗口', reason: 'event-window intake recovery markers present' };
  }

  return { level: 'positive', summary: '事件窗口内没有明显冲突信号', reason: 'event-window markers do not indicate elevated tension' };
}

function buildRecoveryContext(
  metrics: Latest24hMetric[],
  primaryEventType: HomepageEventInsight['eventType'],
  demoNow?: string,
): RecoveryContextSummary[] {
  const sleep = metric(metrics, 'sleep_total');
  const hrv = metric(metrics, 'hrv');
  const contexts: RecoveryContextSummary[] = [];

  if (sleep) {
    const relevance = decideRecoveryMetricRelevance({
      metric: sleep,
      primaryEventType,
      demoNow,
    });

    if (relevance.visible) {
      contexts.push({
        source: 'latest24h',
        metric: 'sleep_total',
        relation: sleep.status === 'normal' ? 'supports' : sleep.status === 'missing' ? 'missing' : 'conflicts',
        summary: sleep.status === 'normal'
          ? '过去 24h 睡眠可作为当前事件的恢复底子'
          : sleep.status === 'missing'
            ? '缺少最近睡眠数据，无法完整判断恢复背景'
            : '过去 24h 睡眠不足，当前事件需要更保守处理',
        visibility: 'material',
        reason: relevance.reason,
        evidenceId: sleep.evidenceId,
      });
    }
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
      visibility: 'material',
      reason: 'metric_supports_current_event',
      evidenceId: hrv.evidenceId,
    });
  }

  return contexts.filter((ctx) => !isSleepMetric(ctx.metric) || ctx.visibility === 'material');
}

function buildRecommendedFocus(
  eventType: ReturnType<typeof normalizeHomepageEventType>,
  tension: EventBodyTension,
  demoNow?: string,
): RecommendedFocus[] {
  if (tension.level === 'critical') {
    return [
      { category: 'medical_attention', action: '如伴随胸闷、气短或明显不适，及时就医评估', timing: '现在', rationale: '当前存在异常风险信号，应优先处理安全边界' },
    ];
  }

  switch (eventType) {
    case 'work_focus':
    case 'work_sedentary':
      return [
        { category: 'movement_reset', action: '起身轻走并活动肩颈', durationMin: 10, rationale: '帮助从静止和认知负荷中切换出来' },
        { category: 'breathing_reset', action: '做一组缓慢呼吸', durationMin: 3, rationale: '用延长呼气降低交感神经兴奋' },
        { category: 'posture', action: '把接下来的工作切到站姿或挺直坐姿', timing: '接下来 30 min', rationale: '减少久坐对呼吸和循环的压迫' },
      ];
    case 'cardio_workout':
    case 'hiit_workout': {
      const focus: RecommendedFocus[] = [
        { category: 'hydration', action: '小口补水并做轻度走动冷身', durationMin: 10, rationale: '帮助心率平稳回落并支持循环恢复' },
        { category: 'nutrition', action: '补充蛋白质和易消化碳水', timing: '运动后 45 min 内', rationale: '支持糖原回补和肌肉修复' },
      ];

      if (eventType === 'hiit_workout' && isEveningSleepActionWindow(demoNow)) {
        focus.push({ category: 'sleep_protection', action: '睡前降低刺激和屏幕暴露', timing: '今晚睡前 60 min', rationale: '保护高强度运动后的深睡恢复窗口' });
      }

      return focus;
    }
    case 'possible_alcohol_intake':
    case 'possible_caffeine_intake':
      return [
        { category: 'sleep_protection', action: '把睡前环境调暗并降低刺激', timing: '今晚睡前 60 min', rationale: '降低摄入相关兴奋对入睡的影响' },
        { category: 'breathing_reset', action: '做一组延长呼气的呼吸练习', durationMin: 5, rationale: '帮助神经系统从紧绷状态回落' },
      ];
    default:
      return [
        { category: 'movement_reset', action: '安排一次轻量活动切换状态', durationMin: 10, rationale: '帮助身体从当前事件平稳过渡到下一阶段' },
      ];
  }
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

const RECORD_CHOICE_PROMISE = '我会记录你的选择并用于本次建议上下文';

function buildActionIntentCandidates(
  eventType: ReturnType<typeof normalizeHomepageEventType>,
  focusItems: RecommendedFocus[],
): ActionIntentCandidate[] {
  return focusItems.slice(0, 3).map((focus, index) => ({
    id: `event_${eventType}_action_${index + 1}`,
    emoji: emojiForFocus(focus.category),
    title: titleForFocus(focus),
    description: describeFocus(focus),
    aiPromise: RECORD_CHOICE_PROMISE,
    productCapability: 'record_choice',
  }));
}

function emojiForFocus(category: RecommendedFocus['category']): string {
  switch (category) {
    case 'movement_reset':
      return '🚶';
    case 'breathing_reset':
      return '🫁';
    case 'nutrition':
      return '🥣';
    case 'hydration':
      return '💧';
    case 'training_adjustment':
      return '🏃';
    case 'sleep_protection':
      return '🌙';
    case 'posture':
      return '🪑';
    case 'data_quality':
      return '⌚';
    case 'medical_attention':
      return '🩺';
  }
}

function titleForFocus(focus: RecommendedFocus): string {
  switch (focus.category) {
    case 'movement_reset':
      return '做一次轻量活动重置';
    case 'breathing_reset':
      return '用呼吸把紧张降下来';
    case 'nutrition':
      return '补一份恢复营养';
    case 'hydration':
      return '先把补水做好';
    case 'training_adjustment':
      return '把训练强度调保守';
    case 'sleep_protection':
      return '保护今晚睡眠窗口';
    case 'posture':
      return '调整接下来的姿势';
    case 'data_quality':
      return '补齐判断所需数据';
    case 'medical_attention':
      return '优先处理安全信号';
  }
}

function describeFocus(focus: RecommendedFocus): string {
  const schedule = focus.durationMin !== undefined
    ? `${focus.durationMin} min`
    : focus.timing ?? '现在';
  return `${schedule}：${focus.action}。${focus.rationale}`;
}
