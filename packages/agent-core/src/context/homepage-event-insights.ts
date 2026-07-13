import type { HomepageSemanticEventType } from './context-packet';
import type { RecentRecommendedAction } from '../types/memory';
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
  ActionInteraction,
  ActionSuppression,
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
  previousRecommendedActions?: RecentRecommendedAction[];
}

interface EventSequenceItem {
  eventId: string;
  rawType: string;
  eventType: HomepageSemanticEventType;
}

export function buildHomepageEventInsights(
  input: BuildHomepageEventInsightsInput,
): HomepageEventInsight[] {
  const { homepage, demoNow, previousRecommendedActions } = input;

  // 构建历史抑制规则（使用真实时间，不受 demoNow 影响）
  const historySuppressions =
    previousRecommendedActions && previousRecommendedActions.length > 0
      ? buildHistoryBasedSuppressions(previousRecommendedActions)
      : [];
  const sequence = homepage.recentEvents.map((event) => ({
    eventId: event.evidenceIds[0] ?? `${event.type}_${event.start}`,
    rawType: event.type,
    eventType: normalizeHomepageEventType(event.type),
  }));

  return homepage.recentEvents.map((event, index) => {
    const eventId = event.evidenceIds[0] ?? `${event.type}_${event.start}`;
    const eventType = sequence[index]?.eventType ?? normalizeHomepageEventType(event.type);
    const physiology = buildEventWindowPhysiology(event.eventWindow);
    const recoveryContext = buildRecoveryContext(homepage.latest24h.metrics, eventType, demoNow);
    const visibleRecoveryEvidenceIds = recoveryContext
      .filter((ctx) => ctx.visibility === 'material')
      .map((ctx) => ctx.evidenceId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
    const tension = determineEventBodyTension(
      eventType,
      event.eventWindow,
      homepage.latest24h.metrics,
      homepage.rulesInsights,
    );
    const transitionContext =
      index === 0 ? buildTransitionContext(sequence[0]!, sequence[1]) : undefined;
    const recommendedFocus = buildRecommendedFocus({
      currentEventType: eventType,
      priorEventType: sequence[1]?.eventType,
      tension,
      transitionContext,
      demoNow,
      eventStart: event.start,
      historySuppressions,
    });
    const mentionPolicy = buildMentionPolicy(index);

    return {
      eventId,
      rawEventType: event.type,
      eventType,
      // 从对应 RecentEventPacket 透传确定性档位
      certaintyBand: event.certaintyBand,
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
        ...(event.eventWindow?.evidenceIds ?? []),
        ...visibleRecoveryEvidenceIds,
      ],
      mentionPolicy,
      ...(transitionContext ? { transitionContext } : {}),
    };
  });
}

function buildMentionPolicy(index: number): HomepageEventInsight['mentionPolicy'] {
  return index === 0
    ? { summary: 'allowed', actions: 'allowed', reason: 'current_latest_event' }
    : { summary: 'forbidden', actions: 'forbidden', reason: 'prior_event_analysis_only' };
}

function buildTransitionContext(
  current: EventSequenceItem,
  prior: EventSequenceItem | undefined,
): HomepageEventInsight['transitionContext'] {
  if (!prior) {
    return {
      currentEventId: current.eventId,
      relation: 'neutral',
      internalFinding: '没有可用的前一事件，当前事件独立解释。',
      allowedUserFacingAngle: '只围绕当前事件解释身体状态。',
      forbiddenMentions: [],
      actionSuppressions: buildActionSuppressions(current.eventType, undefined),
    };
  }

  const relation = classifyTransitionRelation(current.eventType, prior.eventType);
  return {
    currentEventId: current.eventId,
    priorEventId: prior.eventId,
    priorEventType: prior.eventType,
    relation,
    internalFinding: buildInternalFinding(current.eventType, prior.eventType, relation),
    allowedUserFacingAngle: buildAllowedUserFacingAngle(current.eventType, relation),
    forbiddenMentions: buildForbiddenMentions(prior),
    actionSuppressions: buildActionSuppressions(current.eventType, prior.eventType),
  };
}

function classifyTransitionRelation(
  current: HomepageSemanticEventType,
  prior: HomepageSemanticEventType,
): NonNullable<HomepageEventInsight['transitionContext']>['relation'] {
  if (current === prior) {
    return 'same_category_repeat';
  }
  if ((current === 'cardio_workout' || current === 'hiit_workout') && prior === 'work_sedentary') {
    return 'post_sedentary_activation';
  }
  if (prior === 'cardio_workout' || prior === 'hiit_workout') {
    return 'post_workout_recovery';
  }
  if (prior === 'possible_caffeine_intake' || prior === 'possible_alcohol_intake') {
    return 'post_intake_sleep_risk';
  }
  return 'neutral';
}

function buildInternalFinding(
  current: HomepageSemanticEventType,
  prior: HomepageSemanticEventType,
  relation: NonNullable<HomepageEventInsight['transitionContext']>['relation'],
): string {
  switch (relation) {
    case 'post_sedentary_activation':
      return '前一事件提示低活动和静止负荷，当前运动事件可用于判断循环激活和疲劳回落。';
    case 'post_workout_recovery':
      return '前一事件是运动负荷，当前事件需要优先判断恢复而不是继续追加活动。';
    case 'post_intake_sleep_risk':
      return '前一摄入相关事件可能仍影响神经兴奋度，当前事件建议需要避免增加刺激。';
    case 'same_category_repeat':
      return `当前事件与前一事件同为 ${current}，建议应避免重复同类动作。`;
    case 'neutral':
      return `前一事件 ${prior} 仅作为内部背景，不应直接进入用户可见表达。`;
  }
}

function buildAllowedUserFacingAngle(
  current: HomepageSemanticEventType,
  relation: NonNullable<HomepageEventInsight['transitionContext']>['relation'],
): string {
  if (
    relation === 'post_sedentary_activation' &&
    (current === 'cardio_workout' || current === 'hiit_workout')
  ) {
    return '只表达当前运动让身体从低活跃状态重新被带动，疲劳感和循环状态正在改善。';
  }
  if (relation === 'post_workout_recovery') {
    return '只表达当前事件应帮助身体从当前负荷里平稳恢复。';
  }
  if (relation === 'same_category_repeat') {
    return '只表达当前事件后的收尾和恢复，不建议再次重复同类动作。';
  }
  return '只围绕当前事件的事件窗口指标、当前张力和下一步建议表达。';
}

function buildForbiddenMentions(prior: EventSequenceItem): string[] {
  const common = ['之前', '上一轮', '前一个事件', '前一次', '刚才'];
  switch (prior.eventType) {
    case 'work_sedentary':
      return ['久坐', '静止工作', '长时间静止', '久坐后', ...common];
    case 'work_focus':
      return ['专注', '工作', '深度专注', ...common];
    case 'meal':
      return ['进餐', '吃饭', '餐后', ...common];
    case 'cardio_workout':
    case 'hiit_workout':
      return ['上一段运动', '运动后吃饭', '刚运动完又', ...common];
    case 'possible_caffeine_intake':
      return ['咖啡因后', '喝咖啡后', ...common];
    case 'possible_alcohol_intake':
      return ['饮酒后', '喝酒后', ...common];
    default:
      return common;
  }
}

/** 行动类别到语义组的映射 */
export const ACTION_SEMANTIC_GROUPS: Record<string, string> = {
  movement_reset: 'strenuous_activity',
  training_adjustment: 'strenuous_activity',
  posture: 'light_posture',
  breathing_reset: 'nervous_system_reset',
  sleep_protection: 'nervous_system_reset',
  hydration: 'recovery_intake',
  nutrition: 'recovery_intake',
  data_quality: 'data',
  medical_attention: 'safety',
};

const COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4h 冷却
const DAILY_CAP = 2; // 每语义组 24h 内最多 2 次
const DAILY_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h 滑动窗口

/**
 * 基于历史行动推荐记录构建抑制规则。
 * 双维度：冷却（同语义组距上次 < 4h）+ 频率（同语义组 24h 内 ≥ 2 次）。
 * 使用真实时间（Date.now()），不受 demoNow 影响。
 */
export function buildHistoryBasedSuppressions(
  previousActions: RecentRecommendedAction[],
  now: number = Date.now(),
): ActionSuppression[] {
  if (previousActions.length === 0) return [];

  const suppressions: ActionSuppression[] = [];

  // 按语义组聚合
  const groupEntries = new Map<string, RecentRecommendedAction[]>();
  for (const action of previousActions) {
    const group = ACTION_SEMANTIC_GROUPS[action.category];
    if (!group) continue;
    const list = groupEntries.get(group) ?? [];
    list.push(action);
    groupEntries.set(group, list);
  }

  // 对每个语义组判断是否抑制
  for (const [, actions] of groupEntries) {
    const sorted = [...actions].sort((a, b) => b.timestamp - a.timestamp);
    const lastTime = sorted[0]!.timestamp;
    const group = ACTION_SEMANTIC_GROUPS[sorted[0]!.category]!;

    // 维度一：冷却检查（距上次 < 4h）
    const inCooldown = now - lastTime < COOLDOWN_MS;

    // 维度二：24h 频率检查
    const recentCount = sorted.filter((a) => now - a.timestamp < DAILY_WINDOW_MS).length;
    const overDailyCap = recentCount >= DAILY_CAP;

    if (inCooldown || overDailyCap) {
      // 抑制该语义组下所有 category
      for (const [category, g] of Object.entries(ACTION_SEMANTIC_GROUPS)) {
        if (g === group) {
          suppressions.push({
            category: category as RecommendedFocus['category'],
            reason: inCooldown
              ? `语义组 '${group}' 在冷却期内（距上次 ${Math.round((now - lastTime) / 60000)} min）`
              : `语义组 '${group}' 24h 内已推荐 ${recentCount} 次，达到每日上限`,
          });
        }
      }

      // 同时抑制该组下的 microEventType
      for (const action of sorted) {
        if (action.microEventType) {
          suppressions.push({
            interactionMicroEventType: action.microEventType,
            reason: `属于已抑制语义组 '${group}'`,
          });
        }
      }
    }
  }

  return suppressions;
}

function isWorkoutEvent(eventType: HomepageSemanticEventType | undefined): boolean {
  return eventType === 'cardio_workout' || eventType === 'hiit_workout';
}

function buildActionSuppressions(
  current: HomepageSemanticEventType,
  prior: HomepageSemanticEventType | undefined,
): ActionSuppression[] {
  const suppressions: ActionSuppression[] = [];

  if (isWorkoutEvent(current)) {
    suppressions.push(
      { category: 'movement_reset', reason: 'current event is already a completed workout' },
      {
        interactionMicroEventType: 'micro_short_walk',
        reason: 'avoid recommending a walk after workout completion',
      },
      {
        interactionMicroEventType: 'micro_easy_cardio',
        reason: 'avoid recommending more cardio after workout completion',
      },
      {
        textPattern: '散步|轻走活动|继续运动|轻松有氧|再.*有氧',
        reason: 'avoid repeat movement wording after workout',
      },
    );
  }

  if (isWorkoutEvent(prior) && !isWorkoutEvent(current)) {
    suppressions.push(
      {
        interactionMicroEventType: 'micro_easy_cardio',
        reason: 'prior event was workout; current action should not add more training',
      },
      {
        textPattern: '继续运动|轻松有氧|再.*运动',
        reason: 'avoid more training after prior workout',
      },
    );
  }

  if (prior === current) {
    suppressions.push(
      {
        category: 'movement_reset',
        reason: 'same event category repeated; avoid repeating the same action type',
      },
      { textPattern: '再.*一次|继续.*同样', reason: 'avoid repeated same-category instruction' },
    );
  }

  return suppressions;
}

function applyActionSuppressions(
  focusItems: RecommendedFocus[],
  suppressions: ActionSuppression[],
): RecommendedFocus[] {
  return focusItems.filter((focus) => {
    if (suppressions.some((suppression) => suppression.category === focus.category)) return false;
    const text = `${focus.action}\n${focus.rationale}`;
    return !suppressions.some((suppression) => {
      if (!suppression.textPattern) return false;
      return new RegExp(suppression.textPattern).test(text);
    });
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
          qualifier:
            metric.qualifier === 'compressed'
              ? 'compressed'
              : metric.qualifier === 'recovering'
                ? 'recovering'
                : 'normal',
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
  if (
    metrics.some((m) => m.status === 'critical') ||
    rulesInsights.some((r) => r.severity === 'critical')
  ) {
    return {
      level: 'critical',
      summary: '当前存在需要优先处理的异常信号',
      reason: 'critical metric or rule insight present',
    };
  }

  const eventMetrics = eventWindow?.metrics ?? [];
  const hrvCompressed = eventMetrics.some(
    (m) => m.metric === 'hrv_rmssd' && m.qualifier === 'compressed',
  );
  const hrElevated = eventMetrics.some(
    (m) => m.metric === 'heart_rate' && m.qualifier === 'elevated',
  );
  const stressElevated = eventMetrics.some(
    (m) => m.metric === 'stress_load' && m.qualifier === 'elevated',
  );
  const lowMotion = eventMetrics.some((m) => m.metric === 'motion' && (m.average ?? 0) < 1);

  if (
    (eventType === 'work_focus' || eventType === 'work_sedentary') &&
    (hrvCompressed || hrElevated || stressElevated || lowMotion)
  ) {
    return {
      level: 'high',
      summary: '这次工作事件内已经出现神经或静止负荷累积',
      reason: 'event-window work load markers present',
    };
  }
  if (
    (eventType === 'cardio_workout' || eventType === 'hiit_workout') &&
    (hrvCompressed || hrElevated)
  ) {
    return {
      level: 'watch',
      summary: '运动事件已经进入恢复窗口，需要降低后续刺激',
      reason: 'event-window workout recovery markers present',
    };
  }
  if (
    (eventType === 'possible_caffeine_intake' || eventType === 'possible_alcohol_intake') &&
    (hrvCompressed || hrElevated || stressElevated)
  ) {
    return {
      level: 'watch',
      summary: '摄入相关事件内存在恢复受压信号，需要保护今晚睡眠窗口',
      reason: 'event-window intake recovery markers present',
    };
  }

  return {
    level: 'positive',
    summary: '事件窗口内没有明显冲突信号',
    reason: 'event-window markers do not indicate elevated tension',
  };
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
        relation:
          sleep.status === 'normal'
            ? 'supports'
            : sleep.status === 'missing'
              ? 'missing'
              : 'conflicts',
        summary:
          sleep.status === 'normal'
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
      relation:
        hrv.status === 'normal' ? 'supports' : hrv.status === 'missing' ? 'missing' : 'conflicts',
      summary:
        hrv.status === 'normal'
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

interface BuildRecommendedFocusInput {
  currentEventType: ReturnType<typeof normalizeHomepageEventType>;
  priorEventType?: HomepageSemanticEventType;
  tension: EventBodyTension;
  transitionContext?: HomepageEventInsight['transitionContext'];
  demoNow?: string;
  eventStart?: string;
  historySuppressions?: ActionSuppression[];
}

function buildRecommendedFocus(input: BuildRecommendedFocusInput): RecommendedFocus[] {
  const {
    currentEventType: eventType,
    priorEventType,
    tension,
    transitionContext,
    demoNow,
    eventStart,
    historySuppressions,
  } = input;

  // 统一合并事件转换抑制 + 历史抑制
  const allSuppressions = [
    ...(transitionContext?.actionSuppressions ??
      buildActionSuppressions(eventType, priorEventType)),
    ...(historySuppressions ?? []),
  ];

  if (tension.level === 'critical') {
    return [
      {
        category: 'medical_attention',
        action: '如伴随胸闷、气短或明显不适，及时就医评估',
        timing: '现在',
        rationale: '当前存在异常风险信号，应优先处理安全边界',
      },
    ];
  }

  switch (eventType) {
    case 'work_focus':
    case 'work_sedentary': {
      const focus: RecommendedFocus[] = [
        {
          category: 'movement_reset',
          action: '起身轻走并活动肩颈',
          durationMin: 10,
          rationale: '帮助从静止和认知负荷中切换出来',
        },
        {
          category: 'breathing_reset',
          action: '做一组缓慢呼吸',
          durationMin: 3,
          rationale: '用延长呼气降低交感神经兴奋',
        },
        {
          category: 'posture',
          action: '把接下来的工作切到站姿或挺直坐姿',
          timing: '接下来 30 min',
          rationale: '减少久坐对呼吸和循环的压迫',
        },
      ];
      return applyActionSuppressions(focus, allSuppressions);
    }
    case 'cardio_workout':
    case 'hiit_workout': {
      const focus: RecommendedFocus[] = [
        {
          category: 'hydration',
          action: '小口补水，做 5-10 min 低强度冷身拉伸',
          durationMin: 10,
          rationale: '帮助心率平稳回落并支持循环恢复',
        },
        {
          category: 'nutrition',
          action: '补充蛋白质和易消化碳水',
          timing: '运动后 45 min 内',
          rationale: '支持糖原回补和肌肉修复',
        },
      ];

      if (eventType === 'hiit_workout' && isEveningSleepActionWindow(demoNow)) {
        focus.push({
          category: 'sleep_protection',
          action: '睡前降低刺激和屏幕暴露',
          timing: '今晚睡前 60 min',
          rationale: '保护高强度运动后的深睡恢复窗口',
        });
      }

      return applyActionSuppressions(focus, allSuppressions);
    }
    case 'possible_alcohol_intake':
    case 'possible_caffeine_intake': {
      let focus: RecommendedFocus[];
      if (eventType === 'possible_caffeine_intake' && isAtOrAfterHour(eventStart, 17)) {
        focus = [
          {
            category: 'sleep_protection',
            action: '睡前洗个热水澡并降低刺激',
            timing: '今晚睡前 60 min',
            rationale: '帮助身体从下午咖啡因兴奋中回落',
          },
          {
            category: 'breathing_reset',
            action: '做一组延长呼气的呼吸练习',
            durationMin: 5,
            rationale: '帮助神经系统从紧绷状态回落',
          },
        ];
      } else {
        focus = [
          {
            category: 'sleep_protection',
            action: '把睡前环境调暗并降低刺激',
            timing: '今晚睡前 60 min',
            rationale: '降低摄入相关兴奋对入睡的影响',
          },
          {
            category: 'breathing_reset',
            action: '做一组延长呼气的呼吸练习',
            durationMin: 5,
            rationale: '帮助神经系统从紧绷状态回落',
          },
        ];
      }
      return applyActionSuppressions(focus, allSuppressions);
    }
    case 'meal': {
      const focus: RecommendedFocus[] = [
        {
          category: 'movement_reset',
          action: '餐后轻走帮助消化',
          durationMin: 10,
          rationale: '帮助餐后血糖平稳和消化',
        },
        {
          category: 'hydration',
          action: '小口补充温水',
          timing: '接下来 30 min',
          rationale: '帮助消化和代谢',
        },
        {
          category: 'breathing_reset',
          action: '做一组延长呼气的呼吸练习',
          durationMin: 5,
          rationale: '帮助副交感神经激活，促进消化',
        },
      ];
      return applyActionSuppressions(focus, allSuppressions);
    }
    default: {
      const focus: RecommendedFocus[] = [
        {
          category: 'movement_reset',
          action: '安排一次轻量活动切换状态',
          durationMin: 10,
          rationale: '帮助身体从当前事件平稳过渡到下一阶段',
        },
      ];
      return applyActionSuppressions(focus, allSuppressions);
    }
  }
}

function isAtOrAfterHour(timestamp: string | undefined, targetHour: number): boolean {
  const time = timestamp?.split('T')[1];
  if (!time) return false;
  const hour = Number(time.slice(0, 2));
  return Number.isFinite(hour) && hour >= targetHour;
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

function buildHeadline(
  eventType: ReturnType<typeof normalizeHomepageEventType>,
  durationMin: number,
): string {
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

function interactionForFocus(
  eventType: HomepageSemanticEventType,
  focus: RecommendedFocus,
): ActionInteraction | undefined {
  const actionLower = focus.action.toLowerCase();

  switch (focus.category) {
    case 'breathing_reset': {
      if (
        actionLower.includes('箱式') ||
        actionLower.includes('box') ||
        actionLower.includes('紧急') ||
        actionLower.includes('rescue')
      ) {
        return {
          kind: 'micro_event',
          microEvent: { type: 'micro_box_breathing', durationMinutes: focus.durationMin ?? 3 },
        };
      }
      if (
        actionLower.includes('舒缓') ||
        actionLower.includes('calming') ||
        actionLower.includes('延长呼气') ||
        actionLower.includes('4-7-8')
      ) {
        return {
          kind: 'micro_event',
          microEvent: { type: 'micro_calming_breathing', durationMinutes: focus.durationMin ?? 5 },
        };
      }
      if (
        actionLower.includes('冷水') ||
        actionLower.includes('cold') ||
        actionLower.includes('敷面') ||
        actionLower.includes('冰敷')
      ) {
        return {
          kind: 'micro_event',
          microEvent: { type: 'micro_cold_face_dip', durationMinutes: focus.durationMin ?? 3 },
        };
      }
      if (
        actionLower.includes('小憩') ||
        actionLower.includes('nap') ||
        actionLower.includes('闭目小憩')
      ) {
        return {
          kind: 'micro_event',
          microEvent: { type: 'micro_power_nap', durationMinutes: focus.durationMin ?? 20 },
        };
      }
      if (
        actionLower.includes('冥想') ||
        actionLower.includes('meditation') ||
        actionLower.includes('正念')
      ) {
        return {
          kind: 'micro_event',
          microEvent: {
            type: 'micro_mindfulness_meditation',
            durationMinutes: focus.durationMin ?? 15,
          },
        };
      }
      if (
        actionLower.includes('肌肉放松') ||
        actionLower.includes('muscle relaxation') ||
        actionLower.includes('渐进')
      ) {
        return {
          kind: 'micro_event',
          microEvent: { type: 'micro_muscle_relaxation', durationMinutes: focus.durationMin ?? 10 },
        };
      }
      return {
        kind: 'micro_event',
        microEvent: { type: 'micro_deep_breathing', durationMinutes: focus.durationMin },
      };
    }

    case 'movement_reset': {
      if (eventType === 'meal') {
        return {
          kind: 'micro_event',
          microEvent: { type: 'micro_post_meal_walk', durationMinutes: focus.durationMin ?? 10 },
        };
      }
      if (eventType === 'cardio_workout' || eventType === 'hiit_workout') {
        return {
          kind: 'micro_event',
          microEvent: {
            type: 'micro_post_workout_slow_walk',
            durationMinutes: focus.durationMin ?? 10,
          },
        };
      }
      if (
        actionLower.includes('补水') ||
        actionLower.includes('接水') ||
        actionLower.includes('hydration')
      ) {
        return {
          kind: 'micro_event',
          microEvent: { type: 'micro_hydration_walk', durationMinutes: focus.durationMin ?? 5 },
        };
      }
      if (
        actionLower.includes('户外') ||
        actionLower.includes('outdoor') ||
        actionLower.includes('窗外') ||
        actionLower.includes('新鲜空气')
      ) {
        return {
          kind: 'micro_event',
          microEvent: { type: 'micro_outdoor_breather', durationMinutes: focus.durationMin ?? 10 },
        };
      }
      if (actionLower.includes('楼梯') || actionLower.includes('stair')) {
        return {
          kind: 'micro_event',
          microEvent: { type: 'micro_stair_climb', durationMinutes: focus.durationMin ?? 5 },
        };
      }
      return {
        kind: 'micro_event',
        microEvent: { type: 'micro_short_walk', durationMinutes: focus.durationMin ?? 10 },
      };
    }

    case 'posture': {
      if (
        actionLower.includes('站姿办公') ||
        actionLower.includes('站立办公') ||
        actionLower.includes('standing desk')
      ) {
        return {
          kind: 'micro_event',
          microEvent: { type: 'micro_standing_work', durationMinutes: focus.durationMin ?? 20 },
        };
      }
      if (
        actionLower.includes('纠正') ||
        actionLower.includes('坐姿') ||
        actionLower.includes('posture correction') ||
        actionLower.includes('挺直')
      ) {
        return {
          kind: 'micro_event',
          microEvent: {
            type: 'micro_posture_correction',
            durationMinutes: focus.durationMin ?? 15,
          },
        };
      }
      if (actionLower.includes('站') || actionLower.includes('站立')) {
        return {
          kind: 'micro_event',
          microEvent: { type: 'micro_standing_stretch', durationMinutes: focus.durationMin },
        };
      }
      return {
        kind: 'micro_event',
        microEvent: { type: 'micro_desk_mobility', durationMinutes: focus.durationMin },
      };
    }

    case 'nutrition': {
      if (eventType === 'cardio_workout' || eventType === 'hiit_workout') {
        return { kind: 'micro_event', microEvent: { type: 'micro_post_workout_snack' } };
      }
      if (eventType === 'prepare_sleep') {
        return { kind: 'micro_event', microEvent: { type: 'micro_pre_workout_snack' } };
      }
      if (
        actionLower.includes('恢复餐') ||
        actionLower.includes('recovery meal') ||
        actionLower.includes('练后')
      ) {
        return {
          kind: 'micro_event',
          microEvent: { type: 'micro_recovery_meal', durationMinutes: focus.durationMin ?? 15 },
        };
      }
      if (
        actionLower.includes('轻食') ||
        actionLower.includes('清淡') ||
        actionLower.includes('light meal') ||
        actionLower.includes('减负')
      ) {
        return {
          kind: 'micro_event',
          microEvent: { type: 'micro_light_meal', durationMinutes: focus.durationMin ?? 15 },
        };
      }
      return undefined;
    }

    case 'training_adjustment': {
      if (
        actionLower.includes('有氧') ||
        actionLower.includes('心肺') ||
        actionLower.includes('cardio')
      ) {
        return {
          kind: 'micro_event',
          microEvent: { type: 'micro_easy_cardio', durationMinutes: focus.durationMin },
        };
      }
      if (
        actionLower.includes('泡沫轴') ||
        actionLower.includes('foam roll') ||
        actionLower.includes('筋膜')
      ) {
        return {
          kind: 'micro_event',
          microEvent: { type: 'micro_foam_rolling', durationMinutes: focus.durationMin ?? 10 },
        };
      }
      if (
        actionLower.includes('拉伸') ||
        actionLower.includes('恢复') ||
        actionLower.includes('stretch') ||
        actionLower.includes('recovery')
      ) {
        return {
          kind: 'micro_event',
          microEvent: { type: 'micro_restorative_stretch', durationMinutes: focus.durationMin },
        };
      }
      if (
        actionLower.includes('热身') ||
        actionLower.includes('唤醒') ||
        actionLower.includes('warm up') ||
        actionLower.includes('激活')
      ) {
        return {
          kind: 'micro_event',
          microEvent: { type: 'micro_neuro_warmup', durationMinutes: focus.durationMin ?? 5 },
        };
      }
      return undefined;
    }

    case 'sleep_protection': {
      const timingLower = (focus.timing ?? '').toLowerCase();
      if (
        timingLower.includes('今晚') ||
        timingLower.includes('睡前') ||
        timingLower.includes('明天') ||
        timingLower.includes('未来')
      ) {
        const isHotShower = actionLower.includes('热水澡');
        return {
          kind: 'calendar',
          calendar: {
            title: titleForFocus(focus),
            timingLabel: focus.timing ?? '稍后',
            durationMinutes: focus.durationMin ?? (isHotShower ? 30 : 60),
          },
        };
      }
      if (
        actionLower.includes('温水澡') ||
        actionLower.includes('warm shower') ||
        actionLower.includes('洗澡')
      ) {
        return {
          kind: 'micro_event',
          microEvent: { type: 'micro_warm_shower', durationMinutes: focus.durationMin ?? 10 },
        };
      }
      if (
        actionLower.includes('微凉') ||
        actionLower.includes('cool shower') ||
        actionLower.includes('冷水淋浴')
      ) {
        return {
          kind: 'micro_event',
          microEvent: { type: 'micro_cool_shower', durationMinutes: focus.durationMin ?? 8 },
        };
      }
      if (
        actionLower.includes('降光') ||
        actionLower.includes('关屏') ||
        actionLower.includes('dim') ||
        actionLower.includes('褪黑素')
      ) {
        return {
          kind: 'micro_event',
          microEvent: { type: 'micro_screen_dimming', durationMinutes: focus.durationMin ?? 15 },
        };
      }
      if (
        actionLower.includes('冥想') ||
        actionLower.includes('meditation') ||
        actionLower.includes('正念')
      ) {
        return {
          kind: 'micro_event',
          microEvent: {
            type: 'micro_mindfulness_meditation',
            durationMinutes: focus.durationMin ?? 15,
          },
        };
      }
      if (
        actionLower.includes('肌肉放松') ||
        actionLower.includes('muscle relaxation') ||
        actionLower.includes('渐进')
      ) {
        return {
          kind: 'micro_event',
          microEvent: { type: 'micro_muscle_relaxation', durationMinutes: focus.durationMin ?? 10 },
        };
      }
      if (
        actionLower.includes('调暗') ||
        actionLower.includes('降低') ||
        actionLower.includes('呼吸') ||
        actionLower.includes('放松')
      ) {
        return {
          kind: 'micro_event',
          microEvent: { type: 'micro_sleep_wind_down', durationMinutes: focus.durationMin },
        };
      }
      return undefined;
    }

    case 'hydration':
    case 'medical_attention':
    case 'data_quality':
      return undefined;

    default:
      return undefined;
  }
}

function promiseForInteraction(interaction: ActionInteraction | undefined): string {
  if (!interaction) {
    return '我会记录你的选择并用于本次建议上下文';
  }
  switch (interaction.kind) {
    case 'micro_event':
      return '我会记录这个微行动并更新实时简报';
    case 'calendar':
      return '我会把它作为日程建议记录下来';
  }
}

function buildActionIntentCandidates(
  eventType: ReturnType<typeof normalizeHomepageEventType>,
  focusItems: RecommendedFocus[],
): ActionIntentCandidate[] {
  return focusItems.slice(0, 3).map((focus, index) => {
    const interaction = interactionForFocus(eventType, focus);
    return {
      id: `event_${eventType}_action_${index + 1}`,
      emoji: emojiForFocus(focus.category),
      title: titleForFocus(focus, eventType),
      description: describeFocus(focus),
      aiPromise: promiseForInteraction(interaction),
      productCapability: interaction ? 'contextual_followup' : 'record_choice',
      ...(interaction ? { interaction } : {}),
    };
  });
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

function titleForFocus(focus: RecommendedFocus, eventType?: HomepageSemanticEventType): string {
  switch (focus.category) {
    case 'movement_reset': {
      if (eventType === 'meal') {
        return '餐后轻走一下';
      }
      if (eventType === 'cardio_workout' || eventType === 'hiit_workout') {
        return '运动后慢走放松';
      }
      return '起身轻走活动';
    }
    case 'breathing_reset':
      return '做一组缓慢呼吸';
    case 'nutrition': {
      if (eventType === 'cardio_workout' || eventType === 'hiit_workout') {
        return '补充恢复营养';
      }
      return '补一份恢复营养';
    }
    case 'hydration':
      return '先小口补水';
    case 'training_adjustment': {
      const actionLower = focus.action.toLowerCase();
      if (
        actionLower.includes('有氧') ||
        actionLower.includes('心肺') ||
        actionLower.includes('cardio')
      ) {
        return '轻松有氧恢复';
      }
      if (
        actionLower.includes('拉伸') ||
        actionLower.includes('恢复') ||
        actionLower.includes('stretch') ||
        actionLower.includes('recovery')
      ) {
        return '做一组恢复拉伸';
      }
      return '把训练强度调保守';
    }
    case 'sleep_protection': {
      const timingLower = (focus.timing ?? '').toLowerCase();
      const actionLower = focus.action.toLowerCase();
      if (actionLower.includes('热水澡')) {
        return '睡前洗个热水澡';
      }
      if (timingLower.includes('今晚') || timingLower.includes('睡前')) {
        return '今晚提前放松准备入睡';
      }
      return '保护睡眠窗口';
    }
    case 'posture': {
      const actionLower = focus.action.toLowerCase();
      if (actionLower.includes('站') || actionLower.includes('站立')) {
        return '站起来活动一下';
      }
      return '调整坐姿放松身体';
    }
    case 'data_quality':
      return '补齐判断所需数据';
    case 'medical_attention':
      return '优先处理安全信号';
  }
}

function describeFocus(focus: RecommendedFocus): string {
  const schedule =
    focus.durationMin !== undefined ? `${focus.durationMin} min` : (focus.timing ?? '现在');
  return `${schedule}：${focus.action}。${focus.rationale}`;
}
