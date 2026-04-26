import type { QuestionIntentPacket } from './context-packet';

// ────────────────────────────────────────────
// 意图规则表
// ────────────────────────────────────────────

interface IntentRule {
  name: string;
  condition: (msg: string) => boolean;
  output: Partial<QuestionIntentPacket>;
}

const INTENT_RULES: IntentRule[] = [
  // metric focus
  {
    name: 'focus_sleep',
    condition: (msg) => /睡|眠|sleep|rest/i.test(msg),
    output: { metricFocus: ['sleep'] },
  },
  {
    name: 'focus_hrv',
    condition: (msg) => /hrv|心率变异|变异性/i.test(msg),
    output: { metricFocus: ['hrv'] },
  },
  {
    name: 'focus_hr',
    condition: (msg) => /心率|心跳|heart rate|resting/i.test(msg) && !/hrv|变异/i.test(msg),
    output: { metricFocus: ['resting-hr'] },
  },
  {
    name: 'focus_activity',
    condition: (msg) => /运动|活动|步|跑|走|跑|exercise|run|walk|steps|activity/i.test(msg),
    output: { metricFocus: ['activity'] },
  },
  {
    name: 'focus_stress',
    condition: (msg) => /压力|stress|焦虑|紧张/i.test(msg),
    output: { metricFocus: ['stress'] },
  },
  {
    name: 'focus_spo2',
    condition: (msg) => /血氧|spo2|oxygen/i.test(msg),
    output: { metricFocus: ['spo2'] },
  },

  // time scope
  {
    name: 'time_today',
    condition: (msg) => /今天|今日|today|现在|目前/i.test(msg),
    output: { timeScope: 'today' },
  },
  {
    name: 'time_yesterday',
    condition: (msg) => /昨天|昨晚|昨夜|yesterday|last night/i.test(msg),
    output: { timeScope: 'yesterday' },
  },
  {
    name: 'time_week',
    condition: (msg) => /这.?周|本周|最近|最近一周|week|recent/i.test(msg),
    output: { timeScope: 'week' },
  },
  {
    name: 'time_month',
    condition: (msg) => /这个月|本月|month/i.test(msg),
    output: { timeScope: 'month' },
  },

  // action intent
  {
    name: 'intent_exercise',
    condition: (msg) => /能.?运动|能.?跑|能.?锻炼|可以运动|可以跑|适合运动|能否锻炼/i.test(msg),
    output: { actionIntent: 'exercise_readiness', riskLevel: 'safety_boundary' },
  },
  {
    name: 'intent_chart',
    condition: (msg) => /图|图表|chart|graph|说明|解释|什么意思|怎么看/i.test(msg),
    output: { actionIntent: 'explain_chart' },
  },
  {
    name: 'intent_why',
    condition: (msg) => /为什么|为何|怎么回事|原因|why|how come/i.test(msg),
    output: { actionIntent: 'ask_why' },
  },
  {
    name: 'intent_status',
    condition: (msg) => /状态|怎样|如何|summary|情况|好不好|正常|异常/i.test(msg),
    output: { actionIntent: 'status_summary' },
  },
];

// ────────────────────────────────────────────
// 解析用户问题意图
// ────────────────────────────────────────────

export function parseQuestionIntent(userMessage: string): QuestionIntentPacket {
  const msg = userMessage.toLowerCase();

  const metricFocus = new Set<string>();
  let timeScope: QuestionIntentPacket['timeScope'] = 'unknown';
  let actionIntent: QuestionIntentPacket['actionIntent'] = 'general';
  let riskLevel: QuestionIntentPacket['riskLevel'] = 'general';

  for (const rule of INTENT_RULES) {
    if (rule.condition(msg)) {
      if (rule.output.metricFocus) {
        for (const m of rule.output.metricFocus) {
          metricFocus.add(m);
        }
      }
      if (rule.output.timeScope) timeScope = rule.output.timeScope;
      if (rule.output.actionIntent) actionIntent = rule.output.actionIntent;
      if (rule.output.riskLevel) riskLevel = rule.output.riskLevel;
    }
  }

  // 默认：如果没有识别到 metric focus，但问题很宽泛，标记为 general
  if (metricFocus.size === 0 && actionIntent === 'general') {
    // 保持空数组，表示未聚焦特定指标
  }

  return {
    metricFocus: Array.from(metricFocus),
    timeScope,
    actionIntent,
    riskLevel,
  };
}
