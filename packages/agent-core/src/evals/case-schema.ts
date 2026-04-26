import { z } from 'zod';
import {
  AgentTaskTypeSchema,
  PageContextSchema,
} from '@health-advisor/shared';
import { AgentRequestSchema } from '../types/agent-request';

// ── 基础枚举 Schema ──────────────────────────────────

const EvalSuiteSchema = z.enum(['smoke', 'core', 'regression']);
const EvalCategorySchema = z.enum(['homepage', 'view-summary', 'advisor-chat', 'cross-cutting']);
const EvalPrioritySchema = z.enum(['P0', 'P1', 'P2']);

// ── Setup Schema ─────────────────────────────────────

const AgentEvalSetupSchema = z.object({
  profileId: z.string().min(1),

  memory: z
    .object({
      sessionMessages: z
        .array(
          z.object({
            role: z.enum(['user', 'assistant']),
            text: z.string().min(1),
            createdAt: z.number().optional(),
          }),
        )
        .optional(),
      analytical: z
        .object({
          latestHomepageBrief: z.string().optional(),
          latestViewSummaryByScope: z.record(z.string(), z.string()).optional(),
          latestRuleSummary: z.string().optional(),
        })
        .optional(),
    })
    .optional(),

  overrides: z
    .array(
      z.object({
        metric: z.string().min(1),
        value: z.unknown(),
        dateRange: z
          .object({
            start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
            end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          })
          .optional(),
      }),
    )
    .optional(),

  injectedEvents: z
    .array(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        type: z.string().min(1),
        data: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .optional(),

  timeline: z
    .object({
      performSync: z.enum(['app_open', 'manual_refresh']).optional(),
      appendSegments: z
        .array(
          z.object({
            segmentType: z.string().min(1),
            params: z.record(z.union([z.number(), z.string(), z.boolean()])).optional(),
            offsetMinutes: z.number().optional(),
            durationMinutes: z.number().optional(),
            advanceClock: z.boolean().optional(),
          }),
        )
        .optional(),
    })
    .optional(),

  referenceDate: z.string().optional(),

  modelFixture: z
    .object({
      mode: z.enum(['fake-json', 'fake-invalid-json', 'fake-invalid-output', 'fake-timeout', 'real-provider']),
      content: z.string().optional(),
    })
    .optional(),
});

// ── Expectations Schema ──────────────────────────────

const ProtocolExpectationSchema = z.object({
  requireValidEnvelope: z.boolean().optional(),
  expectedSource: z.enum(['llm', 'fallback', 'rule']).optional(),
  expectedFinishReason: z.enum(['complete', 'fallback', 'timeout']).optional(),
});

const SummaryExpectationSchema = z.object({
  length: z
    .object({
      min: z.number().int().min(0).optional(),
      max: z.number().int().min(0).optional(),
    })
    .optional(),
  mustMention: z.array(z.string().min(1)).optional(),
  mustMentionAny: z.array(z.array(z.string().min(1))).optional(),
  mustNotMention: z.array(z.string().min(1)).optional(),
  requiredPatterns: z.array(z.string().min(1)).optional(),
  forbiddenPatterns: z.array(z.string().min(1)).optional(),
});

const StatusExpectationSchema = z.object({
  expectedStatusColor: z.enum(['good', 'warning', 'error']).optional(),
  allowedStatusColors: z.array(z.enum(['good', 'warning', 'error'])).optional(),
});

const ChartTokensExpectationSchema = z.object({
  required: z.array(z.string().min(1)).optional(),
  requiredAny: z.array(z.array(z.string().min(1))).optional(),
  allowed: z.array(z.string().min(1)).optional(),
  forbidden: z.array(z.string().min(1)).optional(),
  maxCount: z.number().int().min(0).optional(),
});

const MicroTipsExpectationSchema = z.object({
  minCount: z.number().int().min(0).optional(),
  maxCount: z.number().int().min(0).optional(),
  requiredPatterns: z.array(z.string().min(1)).optional(),
  forbiddenPatterns: z.array(z.string().min(1)).optional(),
  requireActionableTiming: z.boolean().optional(),
});

const MissingDataExpectationSchema = z.object({
  missingMetrics: z.array(z.string().min(1)),
  mustDiscloseInsufficientData: z.boolean().optional(),
  forbiddenClaimPatterns: z.array(z.string().min(1)).optional(),
});

const EvidenceExpectationSchema = z
  .object({
    requiredFacts: z
      .array(
        z
          .object({
            id: z.string().min(1),
            metric: z.string().optional(),
            eventType: z.string().optional(),
            value: z.union([z.number(), z.string()]).optional(),
            unit: z.string().optional(),
            mentionPatterns: z.array(z.string().min(1)).optional(),
          })
          // requiredFacts 中必须提供 mentionPatterns
          .refine((fact) => fact.mentionPatterns !== undefined && fact.mentionPatterns.length > 0, {
            message: 'requiredFacts 中每条 fact 必须提供非空的 mentionPatterns',
          }),
      )
      .optional(),
    forbiddenFacts: z
      .array(
        z.object({
          id: z.string().min(1),
          mentionPatterns: z.array(z.string().min(1)),
        }),
      )
      .optional(),
  })
  .optional();

const SafetyExpectationSchema = z.object({
  forbidDiagnosis: z.boolean().optional(),
  forbidMedication: z.boolean().optional(),
  forbidTreatmentPromise: z.boolean().optional(),
  requireDoctorAdviceWhenCritical: z.boolean().optional(),
  forbiddenPatterns: z.array(z.string().min(1)).optional(),
});

const MemoryExpectationSchema = z.object({
  mustUsePreviousTurn: z.boolean().optional(),
  requiredMemoryPatterns: z.array(z.string().min(1)).optional(),
  forbiddenLeakPatterns: z.array(z.string().min(1)).optional(),
});

const HomepageTaskExpectationSchema = z
  .object({
    requireRecentEventFirst: z.boolean().optional(),
    recentEventPatterns: z.array(z.string().min(1)).optional(),
    require24hCrossAnalysis: z.boolean().optional(),
    crossAnalysisPatterns: z
      .object({
        event: z.array(z.string().min(1)).optional(),
        metric: z.array(z.string().min(1)).optional(),
      })
      .optional(),
    requireWeeklyTrendOptional: z.boolean().optional(),
  })
  // requireRecentEventFirst 为 true 时，recentEventPatterns 必须非空
  .refine(
    (data) =>
      !data.requireRecentEventFirst ||
      (data.recentEventPatterns !== undefined && data.recentEventPatterns.length > 0),
    {
      message:
        'requireRecentEventFirst 为 true 时，recentEventPatterns 必须提供且非空',
    },
  )
  // require24hCrossAnalysis 为 true 时，crossAnalysisPatterns.event 与 metric 必须非空
  .refine(
    (data) =>
      !data.require24hCrossAnalysis ||
      (data.crossAnalysisPatterns?.event !== undefined &&
        data.crossAnalysisPatterns.event.length > 0 &&
        data.crossAnalysisPatterns?.metric !== undefined &&
        data.crossAnalysisPatterns.metric.length > 0),
    {
      message:
        'require24hCrossAnalysis 为 true 时，crossAnalysisPatterns.event 与 crossAnalysisPatterns.metric 必须提供且非空',
    },
  );

const ViewSummaryTaskExpectationSchema = z
  .object({
    requiredTab: z.string().min(1).optional(),
    forbidOtherTabs: z.array(z.string().min(1)).optional(),
    requiredTabPatterns: z.array(z.string().min(1)).optional(),
  })
  // requiredTab 存在时，必须提供 requiredTabPatterns
  .refine(
    (data) =>
      data.requiredTab === undefined ||
      (data.requiredTabPatterns !== undefined && data.requiredTabPatterns.length > 0),
    {
      message:
        'requiredTab 存在时，必须提供非空的 requiredTabPatterns',
    },
  );

const AdvisorChatTaskExpectationSchema = z
  .object({
    requiredTimeScope: z.enum(['day', 'week', 'month', 'year', 'custom']).optional(),
    requiredTimeScopePatterns: z.array(z.string().min(1)).optional(),
    mustAnswerUserQuestion: z.boolean().optional(),
    answerPatterns: z.array(z.string().min(1)).optional(),
  })
  // requiredTimeScope 存在时，requiredTimeScopePatterns 必须非空
  .refine(
    (data) =>
      data.requiredTimeScope === undefined ||
      (data.requiredTimeScopePatterns !== undefined &&
        data.requiredTimeScopePatterns.length > 0),
    {
      message:
        'requiredTimeScope 存在时，requiredTimeScopePatterns 必须提供且非空',
    },
  )
  // mustAnswerUserQuestion 为 true 时，answerPatterns 必须非空
  .refine(
    (data) =>
      !data.mustAnswerUserQuestion ||
      (data.answerPatterns !== undefined && data.answerPatterns.length > 0),
    {
      message:
        'mustAnswerUserQuestion 为 true 时，answerPatterns 必须提供且非空',
    },
  );

const TaskSpecificExpectationSchema = z.object({
  homepage: HomepageTaskExpectationSchema.optional(),
  viewSummary: ViewSummaryTaskExpectationSchema.optional(),
  advisorChat: AdvisorChatTaskExpectationSchema.optional(),
});

const AgentEvalExpectationsSchema = z.object({
  protocol: ProtocolExpectationSchema.optional(),
  summary: SummaryExpectationSchema.optional(),
  status: StatusExpectationSchema.optional(),
  chartTokens: ChartTokensExpectationSchema.optional(),
  microTips: MicroTipsExpectationSchema.optional(),
  missingData: MissingDataExpectationSchema.optional(),
  evidence: EvidenceExpectationSchema.optional(),
  safety: SafetyExpectationSchema.optional(),
  memory: MemoryExpectationSchema.optional(),
  taskSpecific: TaskSpecificExpectationSchema.optional(),
});

// ── 顶层 AgentEvalCase Schema ────────────────────────

export const AgentEvalCaseSchema = z
  .object({
    id: z.string().min(1, 'case id 必须非空'),
    title: z.string().min(1),
    suite: EvalSuiteSchema,
    category: EvalCategorySchema,
    priority: EvalPrioritySchema,
    tags: z.array(z.string()).default([]),
    setup: AgentEvalSetupSchema,
    request: AgentRequestSchema,
    expectations: AgentEvalExpectationsSchema,
  })
  // request.profileId 必须与 setup.profileId 一致
  .refine((data) => data.request.profileId === data.setup.profileId, {
    message: 'request.profileId 必须与 setup.profileId 一致',
    path: ['request', 'profileId'],
  })
  // request.pageContext.profileId 必须与 setup.profileId 一致
  .refine((data) => data.request.pageContext.profileId === data.setup.profileId, {
    message: 'request.pageContext.profileId 必须与 setup.profileId 一致',
    path: ['request', 'pageContext', 'profileId'],
  });

// ── 导出解析函数 ──────────────────────────────────────

/** 解析并校验 AgentEvalCase，成功返回数据，失败抛出 ZodError */
export function parseAgentEvalCase(input: unknown) {
  return AgentEvalCaseSchema.parse(input);
}
