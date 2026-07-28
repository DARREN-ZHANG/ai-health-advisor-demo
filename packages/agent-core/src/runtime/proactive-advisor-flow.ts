import type {
  AdvisorProactivePrompt,
  AgentResponseEnvelope,
  DailyRecord,
  Locale,
} from '@health-advisor/shared';
import { AgentTaskType } from '@health-advisor/shared';
import type { AgentRequest } from '../types/agent-request';
import type { AgentContext } from '../types/agent-context';
import type { AnalysisPlan } from '../planner/analysis-plan';

/** 产品定义：sleep.score 达到 80 视为适合承接运动计划的良好恢复状态。 */
export const GOOD_SLEEP_SCORE_MIN = 80;

export type SleepQualityBand = 'good' | 'needs_recovery' | 'missing';

/**
 * 使用设备数据提供的 sleep.score 做单一、可测试的质量分层。
 * 不从睡眠时长、用户文案或其他指标推算 sleep score。
 */
export function classifyLatestSleepQuality(records: unknown[]): SleepQualityBand {
  const latestRecord = (records as DailyRecord[]).reduce<DailyRecord | undefined>(
    (latest, record) => (!latest || record.date > latest.date ? record : latest),
    undefined,
  );

  if (!latestRecord?.sleep) return 'missing';
  return latestRecord.sleep.score >= GOOD_SLEEP_SCORE_MIN ? 'good' : 'needs_recovery';
}

export function buildSleepHomepageOffer(locale: Locale): AdvisorProactivePrompt {
  const proposal = 'homepage.sleep.show' as const;
  return locale === 'zh'
    ? {
        kind: proposal,
        question: '察觉到您对睡眠数据感兴趣，是否需要将睡眠数据放到首页？',
        actions: [
          {
            id: 'accept',
            label: '添加到首页',
            userMessage: '好的，将睡眠数据添加到首页。',
            interaction: { type: 'advisor.proactive.respond', proposal, decision: 'accept' },
          },
          {
            id: 'decline',
            label: '暂时不用',
            userMessage: '暂时不用将睡眠数据添加到首页。',
            interaction: { type: 'advisor.proactive.respond', proposal, decision: 'decline' },
          },
        ],
      }
    : {
        kind: proposal,
        question:
          'I noticed you are interested in your sleep data. Would you like to add it to Home?',
        actions: [
          {
            id: 'accept',
            label: 'Add to Home',
            userMessage: 'Yes, add my sleep data to Home.',
            interaction: { type: 'advisor.proactive.respond', proposal, decision: 'accept' },
          },
          {
            id: 'decline',
            label: 'Not now',
            userMessage: 'Not now. Do not add my sleep data to Home.',
            interaction: { type: 'advisor.proactive.respond', proposal, decision: 'decline' },
          },
        ],
      };
}

export function buildPlanOffer(
  quality: Exclude<SleepQualityBand, 'missing'>,
  locale: Locale,
): AdvisorProactivePrompt {
  const proposal =
    quality === 'good'
      ? ('plan.activity-three-day.create' as const)
      : ('plan.sleep-recovery.create' as const);

  if (locale === 'zh') {
    const activity = quality === 'good';
    return {
      kind: proposal,
      question: activity
        ? '今日睡眠极佳，是否需要我帮您创建 3 日运动计划？'
        : '检测到您的睡眠质量不高，是否需要我帮您创建一个睡眠恢复计划？',
      actions: [
        {
          id: 'accept',
          label: activity ? '创建 3 日计划' : '创建恢复计划',
          userMessage: activity
            ? '请根据我当前的恢复状态创建一个 3 日运动计划。'
            : '请根据我当前的睡眠数据创建一个睡眠恢复计划。',
          interaction: { type: 'advisor.proactive.respond', proposal, decision: 'accept' },
        },
        {
          id: 'decline',
          label: '暂时不用',
          userMessage: activity ? '暂时不用创建运动计划。' : '暂时不用创建睡眠恢复计划。',
          interaction: { type: 'advisor.proactive.respond', proposal, decision: 'decline' },
        },
      ],
    };
  }

  const activity = quality === 'good';
  return {
    kind: proposal,
    question: activity
      ? 'Your sleep was excellent today. Would you like me to create a 3-day activity plan?'
      : 'Your sleep quality needs attention. Would you like me to create a sleep recovery plan?',
    actions: [
      {
        id: 'accept',
        label: activity ? 'Create 3-day plan' : 'Create recovery plan',
        userMessage: activity
          ? 'Create a 3-day activity plan based on my current recovery.'
          : 'Create a sleep recovery plan based on my current sleep data.',
        interaction: { type: 'advisor.proactive.respond', proposal, decision: 'accept' },
      },
      {
        id: 'decline',
        label: 'Not now',
        userMessage: activity
          ? 'Not now. Do not create an activity plan.'
          : 'Not now. Do not create a sleep recovery plan.',
        interaction: { type: 'advisor.proactive.respond', proposal, decision: 'decline' },
      },
    ],
  };
}

/**
 * 已验证 Planner 表明当前回答确实依赖 sleep 证据，且客户端仍处于 eligible，
 * 才在正常回答后附加睡眠首页提议。
 */
export function attachSleepInterestOffer(
  envelope: AgentResponseEnvelope,
  request: AgentRequest,
  plan: AnalysisPlan | undefined,
  locale: Locale,
): AgentResponseEnvelope {
  const isSleepConversation = plan?.evidenceNeeds.some((need) => need.metric === 'sleep') ?? false;
  const isStandardHealthAnswer =
    plan !== undefined &&
    plan.userIntent.action !== 'control_ui' &&
    plan.userIntent.action !== 'create_plan';
  const canOffer =
    request.taskType === AgentTaskType.ADVISOR_CHAT &&
    envelope.meta.finishReason === 'complete' &&
    request.uiContext?.homepageTrendCard !== 'sleep' &&
    request.uiContext?.sleepHomepageOffer === 'eligible';

  if (!canOffer || !isStandardHealthAnswer || !isSleepConversation) return envelope;
  return { ...envelope, proactivePrompt: buildSleepHomepageOffer(locale) };
}

export type ProactiveInteractionResolution =
  | { kind: 'none' }
  | { kind: 'response'; envelope: AgentResponseEnvelope }
  | { kind: 'plan'; plan: AnalysisPlan };

export function resolveProactiveInteraction(
  request: AgentRequest,
  context: AgentContext,
  locale: Locale,
): ProactiveInteractionResolution {
  const interaction = request.clientInteraction;
  if (!interaction) return { kind: 'none' };

  if (interaction.decision === 'decline') {
    return {
      kind: 'response',
      envelope: createEnvelope(
        request,
        locale === 'zh'
          ? '好的，需要时您可以随时告诉我。'
          : 'No problem. You can ask me anytime.',
      ),
    };
  }

  if (interaction.proposal === 'homepage.sleep.show') {
    const quality = classifyLatestSleepQuality(context.dataWindow.records);
    const envelope = createEnvelope(
      request,
      locale === 'zh'
        ? '已将睡眠数据添加到首页。您可以随时告诉我移除首页的睡眠展示，也可以切换为展示 Activity 数据。'
        : 'Sleep data is now on Home. You can ask me anytime to remove it or switch the card to Activity data.',
    );
    return {
      kind: 'response',
      envelope: {
        ...envelope,
        uiDirectives: [{ type: 'homepage.trend-card.set', display: 'sleep' }],
        ...(quality === 'missing' ? {} : { proactivePrompt: buildPlanOffer(quality, locale) }),
      },
    };
  }

  return {
    kind: 'plan',
    plan: buildAcceptedProactivePlan(request, interaction.proposal),
  };
}

function buildAcceptedProactivePlan(
  request: AgentRequest,
  proposal: 'plan.activity-three-day.create' | 'plan.sleep-recovery.create',
): AnalysisPlan {
  const activityPlan = proposal === 'plan.activity-three-day.create';
  return {
    planId: `proactive-${request.requestId}`,
    taskType: 'advisor_chat',
    userIntent: {
      action: 'create_plan',
      riskLevel: 'general',
      needsClarification: false,
      clarificationQuestion: null,
    },
    evidenceNeeds: activityPlan
      ? [
          {
            metric: 'sleep',
            timeScope: 'today',
            reason: '用户已接受基于今日恢复状态创建 3 日运动计划',
            required: true,
          },
          {
            metric: 'activity',
            timeScope: 'week',
            reason: '用近期活动基线校准 3 日运动安排',
            required: true,
          },
        ]
      : [
          {
            metric: 'sleep',
            timeScope: 'week',
            reason: '用户已接受基于近期睡眠数据创建恢复计划',
            required: true,
          },
        ],
    safetyConstraints: ['no_diagnosis', 'no_medication_advice', 'no_treatment_promise'],
    answerShape: {
      includeMissingDataDisclosure: false,
      includeChartTokens: false,
      maxSummaryLength: 800,
      tone: 'explanatory',
    },
    clientAction: null,
  };
}

function createEnvelope(
  request: AgentRequest,
  summary: string,
): AgentResponseEnvelope {
  return {
    summary,
    source: 'proactive-flow',
    statusColor: 'good',
    chartTokens: [],
    microTips: [],
    meta: {
      taskType: request.taskType,
      pageContext: request.pageContext,
      finishReason: 'complete',
      sessionId: request.sessionId,
    },
  };
}
