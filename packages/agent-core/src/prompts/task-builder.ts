import { AgentTaskType, type Locale } from '@health-advisor/shared';
import type { AgentContext } from '../types/agent-context';
import type { PromptLoader, PromptName } from './prompt-loader';
import type { RuleEvaluationResult } from '../rules/types';
import type { TaskContextPacket } from '../context/context-packet';
import { buildCustomerFacingEvidencePacket } from '../context/customer-facing-evidence';
import { renderTaskContextPacket } from './context-packet-renderer';
import { renderDurableMemoryFacts } from '../memory/durable-memory-context';
import { TASK_ROUTES } from '../routing/task-router';
// Task 4.1：homepage summary 长度的唯一来源
import { getHomepageLengthConfig } from '../policies/homepage-length-policy';

const TASK_PROMPT_MAP: Record<string, PromptName> = {
  [AgentTaskType.HOMEPAGE_SUMMARY]: 'homepage',
  [AgentTaskType.VIEW_SUMMARY]: 'view-summary',
  [AgentTaskType.ADVISOR_CHAT]: 'advisor-chat',
};

// 双语标签映射
function t(locale: Locale, zh: string, en: string): string {
  return locale === 'zh' ? zh : en;
}

export function buildTaskPrompt(
  context: AgentContext,
  loader: PromptLoader,
  rulesResult: RuleEvaluationResult,
  packet?: TaskContextPacket,
): string {
  const taskType = context.task.type;
  const locale = context.locale;
  const promptName = TASK_PROMPT_MAP[taskType];
  const taskTemplate = promptName ? loader.load(promptName) : '';

  const route = TASK_ROUTES[taskType];
  const maxLen = route?.maxSummaryLength ?? 200;

  const sections: string[] = [taskTemplate];

  // 拼接语言风格模板
  if (promptName && promptName !== 'system') {
    try {
      const styleTemplate = loader.loadStyle(promptName, locale);
      sections.push('');
      sections.push(styleTemplate);
    } catch {
      // style 文件不存在时静默跳过（向后兼容）
    }
  }

  // 任务约束
  sections.push('');
  sections.push(t(locale, '## 任务约束', '## Task Constraints'));
  // 注入当前模拟时间，让 LLM 明确知道"现在"是几点
  if (context.demoNow) {
    sections.push(
      `- ${t(locale, '当前模拟时间', 'Current simulated time')}${t(locale, '：', ': ')}${context.demoNow}`,
    );
  }
  if (taskType === AgentTaskType.HOMEPAGE_SUMMARY) {
    // Task 4.1：长度数字来自唯一策略模块，避免与 verifier/scorer 漂移
    const lengthConfig = getHomepageLengthConfig(locale);
    sections.push(
      t(
        locale,
        `- 摘要长度控制在 ${lengthConfig.min}-${lengthConfig.max} 字之间；完整卡片由 summary + actions 组成`,
        `- Summary length must be between ${lengthConfig.min}-${lengthConfig.max} words`,
      ),
    );
    sections.push(
      t(
        locale,
        '- 篇幅分配：当有最近事件时，summary 的核心（段落 2）必须以事件为主体，24h 状态和趋势仅作简短交叉验证；禁止逐项罗列各项个人参考水平指标',
        '- Space allocation: when recent events exist, summary paragraph 2 must center on events. 24h status and trends are brief cross-validation only; do not list every personal reference metric',
      ),
    );
  } else {
    sections.push(
      t(
        locale,
        `- 摘要长度不超过 ${maxLen} 字`,
        `- Summary length must not exceed ${maxLen} characters`,
      ),
    );
  }
  sections.push(
    t(
      locale,
      '- 输出格式必须为 JSON，包含 source、statusColor、summary、chartTokens 字段；microTips 可选',
      '- Output must be valid JSON with fields: source, statusColor, summary, chartTokens; microTips optional',
    ),
  );
  sections.push(
    t(
      locale,
      '- 使用候选 action 时，必须完整保留其 interaction 字段（如有）；不得修改或臆造 interaction 内容',
      '- When using a candidate action, preserve its interaction field exactly if present; do not modify or invent interaction content',
    ),
  );
  sections.push(
    t(
      locale,
      '- 不得臆造 calendar 或 micro_event 能力；仅当候选 action 明确提供 interaction 时才可输出对应 interaction',
      '- Do not invent calendar or micro_event capabilities; only output an interaction when the candidate action explicitly provides one',
    ),
  );
  sections.push(
    t(
      locale,
      '- 单纯喝水（无走动）、单纯调温（无洗澡）、高刺激游戏类 action 不得分配 micro_event interaction；但"补水+走动"、"洗温水澡"、"冲微凉淋浴"等组合行为可以分配',
      '- Drinking water alone (without walking), temperature adjustment alone (without showering), and high-stimulus gaming actions must not be assigned a micro_event interaction; however, combined behaviors like "hydration walk", "warm shower", "cool shower" are allowed',
    ),
  );
  sections.push(
    t(
      locale,
      '- 所有客户可见数值必须原样使用公开上下文给出的值和单位；睡眠时长始终使用 h，禁止换算回 min、混用单位或自行换算',
      '- Preserve every customer-facing value and unit exactly as provided by the public context. Sleep durations must remain in h; do not convert them back to min, mix units, or perform additional conversions',
    ),
  );
  if (taskType === AgentTaskType.HOMEPAGE_SUMMARY) {
    sections.push(
      t(
        locale,
        '- futureSuggestions 的 action.id 不得与 actions 中任何 id 重复；timePoint 必须晚于当前模拟时间且 ≤ 23:59；不得在 summary 中提及 futureSuggestions 内容',
        '- futureSuggestions action ids must not collide with any actions ids; timePoint must be later than the current simulated time and ≤ 23:59; do not mention futureSuggestions content in summary',
      ),
    );
  }

  // 使用 TaskContextPacket 渲染（如果可用）
  // Task 3.1：先投影为客户可见包，再渲染；内部 packet 不直接进入 prompt
  if (packet) {
    const customerPacket = buildCustomerFacingEvidencePacket(packet, locale);
    sections.push('');
    sections.push(renderTaskContextPacket(customerPacket, locale, context.demoNow));
  } else {
    // 降级：保留基本数据窗口信息
    sections.push('');
    sections.push(t(locale, '## 数据窗口', '## Data Window'));
    sections.push(
      `- ${t(locale, '时间范围', 'Time range')}: ${context.dataWindow.start} ~ ${context.dataWindow.end}`,
    );
    sections.push(`- ${t(locale, '记录数', 'Records')}: ${context.dataWindow.records.length}`);

    // 保留 advisor_chat 用户消息
    if (taskType === AgentTaskType.ADVISOR_CHAT && context.task.userMessage) {
      sections.push('');
      sections.push(t(locale, '## 用户问题', '## User Question'));
      sections.push(context.task.userMessage);
    }

    // 保留 visible chart hints
    if (
      taskType === AgentTaskType.ADVISOR_CHAT &&
      context.task.visibleChartIds &&
      context.task.visibleChartIds.length > 0
    ) {
      sections.push('');
      sections.push(t(locale, '## 当前可见图表（提示）', '## Currently Visible Charts (Hints)'));
      sections.push(`- visibleChartHints: ${context.task.visibleChartIds.join(', ')}`);
    }
  }

  // 规则引擎 insights（兼容旧测试，后续迁移到 packet）
  if (!packet && rulesResult.insights.length > 0) {
    sections.push('');
    sections.push(t(locale, '## 预处理信号', '## Pre-processed Signals'));
    for (const insight of rulesResult.insights) {
      sections.push(`- [${insight.severity}] ${insight.message}`);
    }
  }

  // 建议的 chart tokens
  if (rulesResult.suggestedChartTokens.length > 0) {
    sections.push('');
    sections.push(t(locale, '## 建议关联图表', '## Suggested Charts'));
    sections.push(
      t(
        locale,
        `可引用的图表 token：${rulesResult.suggestedChartTokens.join(', ')}`,
        `Available chart tokens: ${rulesResult.suggestedChartTokens.join(', ')}`,
      ),
    );
  }

  // 持久化记忆（用户已确认的事实）
  const durableMemoryContext = renderDurableMemoryFacts(context.memory.durableFacts, locale);
  if (durableMemoryContext.length > 0) {
    sections.push('');
    sections.push(...durableMemoryContext);
  }

  // 对话记忆（如果 packet 未提供，或作为补充）
  if (!packet && context.memory.recentMessages.length > 0) {
    sections.push('');
    sections.push(t(locale, '## 对话历史', '## Conversation History'));
    for (const msg of context.memory.recentMessages) {
      const role = msg.role === 'user' ? t(locale, '用户', 'User') : t(locale, '助手', 'Assistant');
      sections.push(`- ${role}${t(locale, '：', ': ')}${msg.text}`);
    }
  }

  // analytical memory
  const analyticalContext = buildAnalyticalContext(context, locale);
  if (analyticalContext.length > 0) {
    sections.push('');
    sections.push(t(locale, '## 派生分析缓存', '## Derived Analysis Cache'));
    for (const item of analyticalContext) {
      sections.push(`- ${item}`);
    }
  }

  // 输出约束
  sections.push('');
  sections.push(t(locale, '## 输出字段说明', '## Output Field Description'));
  sections.push(
    t(locale, '- source: 使用 "llm" 或 "fallback"', '- source: use "llm" or "fallback"'),
  );
  sections.push(
    t(
      locale,
      '- statusColor: 使用 "good"、"warning"、"error" 之一',
      '- statusColor: one of "good", "warning", "error"',
    ),
  );

  // 输出格式
  sections.push('');
  sections.push(t(locale, '## 输出格式', '## Output Format'));
  sections.push(
    t(locale, '请严格按以下 JSON 格式输出：', 'Output strictly in the following JSON format:'),
  );
  sections.push('```json');

  if (taskType === AgentTaskType.HOMEPAGE_SUMMARY) {
    sections.push('{');
    sections.push('  "source": "llm",');
    sections.push('  "statusColor": "good",');
    // summary 示例展示 \\n\\n 三段结构，引导 LLM 遵循分段格式
    sections.push(
      t(
        locale,
        '  "summary": "小明，刚刚检测到你完成了一次约30分钟的有氧运动！心率峰值持续了将近20分钟，说明这组运动强度不小，有氧系统被充分调动起来了。运动过程中心率经历了几个明显的上升-回落周期，很可能是间歇性训练节奏。运动后心率恢复速度不错，几分钟内回到了平时水平，心肺系统状态良好。从恢复指标看，昨晚的睡眠为这次运动提供了不错的底子。\\n\\n运动后记得补充水分，今天可以先缓一缓让身体好好恢复。你觉得呢？",',
        '  "summary": "Ming, just detected you finished a 30-min cardio session! Heart rate peaked for nearly 20 minutes — solid intensity, your aerobic system was fully engaged. During the workout, heart rate went through several clear rise-recovery cycles, likely an interval training pattern. Post-workout recovery was good, heart rate returned to usual level within minutes. From recovery metrics, last night\'s sleep provided a solid foundation.\\n\\nRemember to hydrate after exercise, take it easy today for recovery. What do you think?",',
      ),
    );
    sections.push('  "chartTokens": ["CHART_TOKEN_1"],');
    sections.push(
      t(
        locale,
        '  "actions": [\n    {\n      "id": "action_1",\n      "emoji": "💧",\n      "title": "先小口补水",\n      "description": "运动后小口补水，帮助身体平稳恢复",\n      "aiPromise": "我会记录你的选择并用于本次建议上下文"\n    },\n    {\n      "id": "action_2",\n      "emoji": "🧘",\n      "title": "做组恢复拉伸",\n      "description": "用 5 分钟轻柔拉伸放松紧张肌群",\n      "aiPromise": "我会记录你的选择并用于本次建议上下文"\n    }\n  ],',
        '  "actions": [\n    {\n      "id": "action_1",\n      "emoji": "💧",\n      "title": "Have some water",\n      "description": "Sip water after exercise to support a steady recovery",\n      "aiPromise": "I will record your choice and use it in this advice context"\n    },\n    {\n      "id": "action_2",\n      "emoji": "🧘",\n      "title": "Do a recovery stretch",\n      "description": "Use five minutes of gentle stretching to relax tense muscles",\n      "aiPromise": "I will record your choice and use it in this advice context"\n    }\n  ],',
      ),
    );
    sections.push(
      t(
        locale,
        '  "actionsSectionTitle": "今天可以这样调整"',
        '  "actionsSectionTitle": "A few options for today"',
      ),
    );
    sections.push(
      t(
        locale,
        '  "futureSuggestions": [\n    {\n      "timePoint": "15:30",\n      "predictedState": "下午 HRV 通常会出现一个小低谷，叠加今天咖啡因摄入较晚",\n      "rationale": "今天已记录 2 杯咖啡，最近一杯在 13:00 之后",\n      "action": {\n        "id": "future_break_15",\n        "emoji": "🧘",\n        "title": "到 15:20 做几次正念呼吸",\n        "description": "提前 10 分钟做 3 分钟缓慢呼吸，缓解交感神经负担",\n        "aiPromise": "我会记录你的选择并用于本次建议上下文",\n        "interaction": {\n          "kind": "micro_event",\n          "microEvent": {\n            "type": "micro_deep_breathing",\n            "durationMinutes": 3\n          }\n        }\n      }\n    }\n  ]',
        '  "futureSuggestions": [\n    {\n      "timePoint": "15:30",\n      "predictedState": "Afternoon HRV usually dips here, compounded by today\'s late caffeine intake",\n      "rationale": "Two caffeine intakes logged today, the latest after 13:00",\n      "action": {\n        "id": "future_break_15",\n        "emoji": "🧘",\n        "title": "Try mindful breathing around 15:20",\n        "description": "Do 3 minutes of slow breathing 10 minutes ahead of the dip",\n        "aiPromise": "I will record your choice and use it in this advice context",\n        "interaction": {\n          "kind": "micro_event",\n          "microEvent": {\n            "type": "micro_deep_breathing",\n            "durationMinutes": 3\n          }\n        }\n      }\n    }\n  ]',
      ),
    );
    sections.push('}');
  } else if (taskType === AgentTaskType.ADVISOR_CHAT) {
    sections.push('{');
    sections.push('  "source": "llm",');
    sections.push('  "statusColor": "good",');
    sections.push(
      t(
        locale,
        '  "summary": "用户请求的计划已准备好",',
        '  "summary": "The requested plan is ready",',
      ),
    );
    sections.push('  "chartTokens": [],');
    sections.push('  "microTips": [],');
    sections.push('  "planDraft": {');
    sections.push(t(locale, '    "title": "7天恢复计划",', '    "title": "7-Day Recovery Plan",'));
    sections.push(
      t(
        locale,
        '    "summary": "根据用户目标制定的可执行计划总览",',
        '    "summary": "An actionable plan overview based on the user goal",',
      ),
    );
    sections.push('    "groups": [');
    sections.push('      {');
    sections.push(t(locale, '        "title": "第 1 天",', '        "title": "Day 1",'));
    sections.push('        "tasks": [');
    sections.push('          {');
    sections.push(t(locale, '            "title": "任务标题",', '            "title": "Task title",'));
    sections.push(
      t(
        locale,
        '            "description": "具体且安全的执行说明",',
        '            "description": "Specific and safe instructions",',
      ),
    );
    sections.push(
      t(
        locale,
        '            "suggestedTimeOfDay": "晚间",',
        '            "suggestedTimeOfDay": "Evening",',
      ),
    );
    sections.push('            "estimatedMinutes": 10');
    sections.push('          }');
    sections.push('        ]');
    sections.push('      }');
    sections.push('    ]');
    sections.push('  }');
    sections.push('}');
  } else {
    sections.push('{');
    sections.push('  "source": "llm",');
    sections.push('  "statusColor": "good",');
    sections.push(t(locale, '  "summary": "摘要文本",', '  "summary": "Summary text",'));
    sections.push('  "chartTokens": ["CHART_TOKEN_1"],');
    sections.push(
      t(locale, '  "microTips": ["贴士1", "贴士2"]', '  "microTips": ["Tip 1", "Tip 2"]'),
    );
    sections.push('}');
  }

  sections.push('```');
  if (taskType === AgentTaskType.ADVISOR_CHAT) {
    sections.push(
      t(
        locale,
        '满足计划请求时必须追加 planDraft，并将 chartTokens 与 microTips 设为空数组；计划响应是独立形态，不得混入额外健康分析、趋势图表或贴士。需要继续澄清或不是计划请求时，必须从 JSON 中完整省略 planDraft 字段。',
        'When the plan request is sufficiently specified, planDraft is required and chartTokens and microTips must be empty arrays. A plan response is a standalone response mode: do not mix in extra health analysis, trend charts, or tips. Omit the entire planDraft field when clarification is still needed or the request is not for a plan.',
      ),
    );
  }

  return sections.join('\n');
}

function buildAnalyticalContext(context: AgentContext, locale: Locale): string[] {
  const items: string[] = [];

  if (context.memory.latestHomepageBrief) {
    items.push(
      `${t(locale, '上次首页摘要', 'Last homepage brief')}: ${context.memory.latestHomepageBrief}`,
    );
  }
  if (context.memory.latestViewSummary) {
    items.push(
      `${t(locale, '上次视图总结', 'Last view summary')}: ${context.memory.latestViewSummary}`,
    );
  }
  if (context.memory.latestRuleSummary) {
    items.push(
      `${t(locale, '上次规则分析', 'Last rule analysis')}: ${context.memory.latestRuleSummary}`,
    );
  }

  return items;
}
