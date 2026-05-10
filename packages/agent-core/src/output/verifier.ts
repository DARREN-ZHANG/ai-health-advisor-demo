import type { AgentResponseEnvelope } from '@health-advisor/shared';
import type { AgentContext } from '../types/agent-context';
import type { RuleEvaluationResult } from '../rules/types';
import type { TaskContextPacket } from '../context/context-packet';
import type { QualityViolation, VerificationReport, ViolationSeverity } from './verification-report';

export interface VerifierInput {
  envelope: AgentResponseEnvelope;
  context: AgentContext;
  rulesResult: RuleEvaluationResult;
  packet: TaskContextPacket;
  parseResult: { success: boolean };
}

// ── 安全检测模式（与 safety-scorer.ts 保持一致） ──────────

const DIAGNOSIS_PATTERNS = [/确诊为/, /诊断为/, /患有/, /患了/];
const MEDICATION_PATTERNS = [/服用.*药/, /建议服药/, /用药方案/];
const MEDICATION_RECOMMENDATION_PATTERNS = [
  /建议(服用|吃|使用).{0,6}(药|片|剂|胶囊)/,
  /可以(服用|吃).{0,6}(药|片|剂|胶囊)/,
  /(建议|推荐).{0,4}用.{0,4}(改善|治疗|缓解)/,
  /自行服用/,
  /推荐.{0,4}(药|片|剂|胶囊)/,
];
const NEGATION_PREFIX_PATTERNS = [
  /没有.{0,4}必要/, /无需/, /不必/, /不建议/, /不需要/, /不要/, /严禁/, /禁止/,
];
const MEDICATION_REFUSAL_PATTERNS = [
  /不建议.{0,4}(自行|擅自)?(服用|吃|用药)/,
  /不要.{0,4}(自行|擅自)?(服用|吃|用药)/,
  /严禁.{0,6}(自行|擅自|无.{0,4}处方).{0,6}(服用|吃|用药)/,
  /请?咨询(医生|专业|医师)/,
  /需.{0,2}(咨询|遵医嘱|医生)/,
];
const TREATMENT_PROMISE_PATTERNS = [/保证恢复/, /一定会好/, /治愈/];
const DOCTOR_ADVICE_PATTERNS = [/就医/, /咨询医生/, /看医生/, /医院.*检查/, /及时就诊/];

// ── 缺失数据检测模式（与 missing-data-scorer.ts 保持一致） ──

const MISSING_METRIC_PATTERNS: Record<string, RegExp[]> = {
  hr: [/心率.*\d+\s*bpm/, /HR.*\d+/i],
  spo2: [/血氧.*\d+%/, /SpO2.*\d+/i],
  sleep: [/睡眠.*\d+(\.\d+)?\s*(小时|分钟)/],
  activity: [/步数.*\d+/, /运动.*\d+\s*分钟/],
  stress: [/压力.*\d+/, /压力负荷.*\d+/],
};

const INSUFFICIENT_DATA_PATTERNS = [
  /数据不足/, /暂无.*数据/, /无法.*评估/, /缺少.*数据/, /未收集到/, /没有足够/,
];

// ── 公开接口 ────────────────────────────────────────────

/** 运行全部验证规则，返回 VerificationReport。纯确定性代码，不依赖 LLM。 */
export function verifyOutput(input: VerifierInput): VerificationReport {
  const violations: QualityViolation[] = [];

  violations.push(...checkSafetyPatterns(input));
  violations.push(...checkMissingDataDisclosure(input));
  violations.push(...checkChartTokens(input));
  violations.push(...checkEvidenceConsistency(input));
  violations.push(...checkTaskRedlines(input));

  return buildReport(violations, input);
}

// ── 安全模式检查 ────────────────────────────────────────

function checkSafetyPatterns(input: VerifierInput): QualityViolation[] {
  const text = buildMatchText(input.envelope);
  const violations: QualityViolation[] = [];

  // 诊断语言
  violations.push(
    checkPatterns('safety:diagnosis', text, DIAGNOSIS_PATTERNS, 'hard', '诊断语言'),
  );

  // 药物建议
  violations.push(
    checkPatterns('safety:medication', text, MEDICATION_PATTERNS, 'hard', '药物建议'),
  );

  // 明确药物推荐（排除拒绝表达）
  violations.push(checkMedicationRecommendation(text));

  // 治疗承诺
  violations.push(
    checkPatterns('safety:treatment_promise', text, TREATMENT_PROMISE_PATTERNS, 'hard', '治疗承诺'),
  );

  // critical 状态要求就医建议
  if (input.envelope.statusColor === 'error') {
    const hasAdvice = DOCTOR_ADVICE_PATTERNS.some((p) => p.test(text));
    violations.push({
      ruleId: 'safety:doctor_advice_critical',
      severity: 'hard',
      passed: hasAdvice,
      message: hasAdvice
        ? 'critical 状态下已包含就医建议'
        : 'critical 状态下缺少就医建议',
    });
  }

  return violations;
}

// ── 缺失数据披露检查 ────────────────────────────────────

function checkMissingDataDisclosure(input: VerifierInput): QualityViolation[] {
  const text = buildMatchText(input.envelope);
  const violations: QualityViolation[] = [];
  const missingMetrics = input.context.dataWindow.missingFields;

  // 缺失指标不得出现具体数值 claim
  for (const field of missingMetrics) {
    const metricKey = fieldToMetricKey(field);
    const patterns = MISSING_METRIC_PATTERNS[metricKey];
    if (!patterns) continue;

    const matched = patterns.filter((p) => p.test(text));
    const passed = matched.length === 0;
    violations.push({
      ruleId: `missing-data:no_claim:${metricKey}`,
      severity: 'hard',
      passed,
      message: passed
        ? `缺失指标 "${metricKey}" 未出现具体数值 claim`
        : `缺失指标 "${metricKey}" 出现了具体数值 claim`,
      details: passed ? undefined : { metric: metricKey, matchedPatterns: matched.map((r) => r.source) },
    });
  }

  // 有缺失数据时应披露数据不足
  if (missingMetrics.length > 0) {
    const hasDisclosure = INSUFFICIENT_DATA_PATTERNS.some((p) => p.test(text));
    violations.push({
      ruleId: 'missing-data:insufficient_disclosure',
      severity: 'soft',
      passed: hasDisclosure,
      message: hasDisclosure
        ? '已披露数据不足'
        : '存在缺失数据但未披露数据不足',
    });
  }

  return violations;
}

// ── Chart Token 检查 ───────────────────────────────────

function checkChartTokens(input: VerifierInput): QualityViolation[] {
  const tokens = input.envelope.chartTokens as string[];
  const visibleChartTokens = input.packet.visibleCharts
    .map((c) => c.chartToken)
    .filter((t): t is string => typeof t === 'string');

  const violations: QualityViolation[] = [];

  // 检查非字符串 token
  const invalid = tokens.filter((t) => typeof t !== 'string' || t.length === 0);

  // 如果有可见 chart 白名单，检查是否引用了白名单外的 token
  if (visibleChartTokens.length > 0) {
    const allowedSet = new Set(visibleChartTokens);
    const outOfScope = tokens.filter((t) => typeof t === 'string' && !allowedSet.has(t));
    invalid.push(...outOfScope);
  }

  if (invalid.length > 0) {
    violations.push({
      ruleId: 'chart_tokens:invalid',
      severity: 'hard',
      passed: false,
      message: `发现非法 chart token: ${invalid.join(', ')}`,
      details: { invalid },
    });
  } else {
    violations.push({
      ruleId: 'chart_tokens:valid',
      severity: 'soft',
      passed: true,
      message: '所有 chart token 合法',
    });
  }

  return violations;
}

// ── 证据一致性检查 ─────────────────────────────────────

function checkEvidenceConsistency(input: VerifierInput): QualityViolation[] {
  // 运行时基于 packet.evidence 检查重要建议是否能关联到证据
  const violations: QualityViolation[] = [];
  const evidence = input.packet.evidence;

  // 如果完全没有证据但输出包含具体数值建议，标记为 soft
  if (evidence.length === 0 && hasNumericClaims(input.envelope)) {
    violations.push({
      ruleId: 'evidence:missing_evidence_for_claims',
      severity: 'soft',
      passed: false,
      message: '输出包含数值声明但无可追溯证据',
    });
  }

  return violations;
}

// ── Task 级别红线 ──────────────────────────────────────

function checkTaskRedlines(input: VerifierInput): QualityViolation[] {
  const violations: QualityViolation[] = [];
  const taskType = input.context.task.type;

  // Homepage 字数红线
  if (taskType === 'homepage_summary') {
    const summary = input.envelope.summary;
    if (summary.length > 500) {
      violations.push({
        ruleId: 'task:homepage_length',
        severity: 'soft',
        passed: false,
        message: `Homepage summary 超过 500 字（${summary.length}）`,
        details: { length: summary.length },
      });
    }
  }

  // 解析失败红线
  if (!input.parseResult.success) {
    violations.push({
      ruleId: 'task:parse_failure',
      severity: 'hard',
      passed: false,
      message: '模型输出解析失败',
    });
  }

  return violations;
}

// ── 工具函数 ──────────────────────────────────────────

function buildMatchText(envelope: AgentResponseEnvelope): string {
  const parts = [envelope.summary];
  if (envelope.microTips.length > 0) {
    parts.push(envelope.microTips.join('\n'));
  }
  return parts.join('\n');
}

function checkPatterns(
  ruleId: string,
  text: string,
  patterns: RegExp[],
  severity: ViolationSeverity,
  description: string,
): QualityViolation {
  const matched = patterns
    .map((p) => p.source)
    .filter((source) => new RegExp(source).test(text));
  const passed = matched.length === 0;
  return {
    ruleId,
    severity,
    passed,
    message: passed ? `未检测到${description}` : `检测到${description}`,
    details: passed ? undefined : { matchedPatterns: matched },
  };
}

function checkMedicationRecommendation(text: string): QualityViolation {
  const lines = text.split(/[。\n；;]/);
  const hits: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // 排除拒绝/警示表达
    if (MEDICATION_REFUSAL_PATTERNS.some((p) => p.test(trimmed))) continue;
    // 排除否定前缀
    if (NEGATION_PREFIX_PATTERNS.some((p) => p.test(trimmed))) continue;

    const matched = MEDICATION_RECOMMENDATION_PATTERNS.filter((p) => p.test(trimmed));
    if (matched.length > 0) hits.push(trimmed);
  }

  const passed = hits.length === 0;
  return {
    ruleId: 'safety:medication_recommendation',
    severity: 'hard',
    passed,
    message: passed
      ? '未检测到药物推荐表达'
      : `检测到药物推荐: ${hits.join('; ')}`,
    details: passed ? undefined : { recommendationHits: hits },
  };
}

/** 将 missingField 映射到 metric key */
function fieldToMetricKey(field: string): string {
  if (field.includes('hr') || field.includes('heart')) return 'hr';
  if (field.includes('spo2') || field.includes('oxygen')) return 'spo2';
  if (field.includes('sleep')) return 'sleep';
  if (field.includes('activity') || field.includes('step')) return 'activity';
  if (field.includes('stress')) return 'stress';
  return field;
}

/** 检查输出是否包含数值声明（用于证据一致性检查） */
function hasNumericClaims(envelope: AgentResponseEnvelope): boolean {
  const text = buildMatchText(envelope);
  return /\d+(\.\d+)?\s*(bpm|%|分钟|小时|步|mmol)/.test(text);
}

function buildReport(violations: QualityViolation[], input: VerifierInput): VerificationReport {
  const passed = violations.filter((v) => v.passed).length;
  const failed = violations.filter((v) => !v.passed).length;
  const hardFailures = violations.filter((v) => !v.passed && v.severity === 'hard').length;

  return {
    envelope: structuredClone(input.envelope),
    context: {
      taskType: input.context.task.type,
      missingData: input.context.dataWindow.missingFields,
      visibleCharts: input.packet.visibleCharts.map((c) => c.chartToken),
      ruleInsights: input.rulesResult.insights.map((i) => i.message),
    },
    violations,
    summary: {
      total: violations.length,
      passed,
      failed,
      hardFailures,
    },
    verifiedAt: new Date().toISOString(),
  };
}
