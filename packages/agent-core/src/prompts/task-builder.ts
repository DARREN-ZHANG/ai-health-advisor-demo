import { AgentTaskType, type Locale } from '@health-advisor/shared';
import type { AgentContext } from '../types/agent-context';
import type { PromptLoader, PromptName } from './prompt-loader';
import type { RuleEvaluationResult } from '../rules/types';
import type { TaskContextPacket } from '../context/context-packet';
import { renderTaskContextPacket } from './context-packet-renderer';
import { renderDurableMemoryFacts } from '../memory/durable-memory-context';
import { TASK_ROUTES } from '../routing/task-router';

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
    sections.push(`- ${t(locale, '当前模拟时间', 'Current simulated time')}${t(locale, '：', ': ')}${context.demoNow}`);
  }
  if (taskType === AgentTaskType.HOMEPAGE_SUMMARY) {
    sections.push(t(
      locale,
      '- 摘要长度控制在 220-420 字之间；完整卡片由 summary + actions 组成，整体阅读量约 300-500 字',
      '- Summary length must be between 150-300 words',
    ));
    sections.push(t(
      locale,
      '- 篇幅分配：当有最近事件时，summary 的核心（段落 2）必须以事件为主体，24h 状态和趋势仅作简短交叉验证；禁止逐项罗列各项个人参考水平指标',
      '- Space allocation: when recent events exist, summary paragraph 2 must center on events. 24h status and trends are brief cross-validation only; do not list every personal reference metric',
    ));
  } else {
    sections.push(t(
      locale,
      `- 摘要长度不超过 ${maxLen} 字`,
      `- Summary length must not exceed ${maxLen} characters`,
    ));
  }
  sections.push(t(
    locale,
    '- 输出格式必须为 JSON，包含 source、statusColor、summary、chartTokens 字段；microTips 可选',
    '- Output must be valid JSON with fields: source, statusColor, summary, chartTokens; microTips optional',
  ));
  sections.push(t(
    locale,
    '- 使用候选 action 时，必须完整保留其 interaction 字段（如有）；不得修改或臆造 interaction 内容',
    '- When using a candidate action, preserve its interaction field exactly if present; do not modify or invent interaction content',
  ));
  sections.push(t(
    locale,
    '- 不得臆造 calendar 或 micro_event 能力；仅当候选 action 明确提供 interaction 时才可输出对应 interaction',
    '- Do not invent calendar or micro_event capabilities; only output an interaction when the candidate action explicitly provides one',
  ));
  sections.push(t(
    locale,
    '- 单纯喝水（无走动）、单纯调温（无洗澡）、高刺激游戏类 action 不得分配 micro_event interaction；但"补水+走动"、"洗温水澡"、"冲微凉淋浴"等组合行为可以分配',
    '- Drinking water alone (without walking), temperature adjustment alone (without showering), and high-stimulus gaming actions must not be assigned a micro_event interaction; however, combined behaviors like "hydration walk", "warm shower", "cool shower" are allowed',
  ));

  // 使用 TaskContextPacket 渲染（如果可用）
  if (packet) {
    sections.push('');
    sections.push(renderTaskContextPacket(packet, locale, context.demoNow));
  } else {
    // 降级：保留基本数据窗口信息
    sections.push('');
    sections.push(t(locale, '## 数据窗口', '## Data Window'));
    sections.push(`- ${t(locale, '时间范围', 'Time range')}: ${context.dataWindow.start} ~ ${context.dataWindow.end}`);
    sections.push(`- ${t(locale, '记录数', 'Records')}: ${context.dataWindow.records.length}`);

    // 保留 advisor_chat 用户消息
    if (taskType === AgentTaskType.ADVISOR_CHAT && context.task.userMessage) {
      sections.push('');
      sections.push(t(locale, '## 用户问题', '## User Question'));
      sections.push(context.task.userMessage);
    }

    // 保留 visible chart hints
    if (taskType === AgentTaskType.ADVISOR_CHAT && context.task.visibleChartIds && context.task.visibleChartIds.length > 0) {
      sections.push('');
      sections.push(t(locale, '## 当前可见图表（提示）', '## Currently Visible Charts (Hints)'));
      sections.push(`- visibleChartHints: ${context.task.visibleChartIds.join(', ')}`);
    }
  }

  // 规则引擎 insights（兼容旧测试，后续迁移到 packet）
  if (rulesResult.insights.length > 0) {
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
      t(locale, `可引用的图表 token：${rulesResult.suggestedChartTokens.join(', ')}`,
        `Available chart tokens: ${rulesResult.suggestedChartTokens.join(', ')}`),
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
      const role = msg.role === 'user'
        ? t(locale, '用户', 'User')
        : t(locale, '助手', 'Assistant');
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
  sections.push(t(locale, '- source: 使用 "llm" 或 "fallback"', '- source: use "llm" or "fallback"'));
  sections.push(t(locale, '- statusColor: 使用 "good"、"warning"、"error" 之一', '- statusColor: one of "good", "warning", "error"'));

  // 输出格式
  sections.push('');
  sections.push(t(locale, '## 输出格式', '## Output Format'));
  sections.push(t(locale, '请严格按以下 JSON 格式输出：', 'Output strictly in the following JSON format:'));
  sections.push('```json');

  if (taskType === AgentTaskType.HOMEPAGE_SUMMARY) {
    sections.push('{');
    sections.push('  "source": "llm",');
    sections.push('  "statusColor": "good",');
    // summary 示例展示 \\n\\n 三段结构，引导 LLM 遵循分段格式
    sections.push(t(
      locale,
      '  "summary": "小明，刚刚检测到你完成了一次约30分钟的有氧运动！心率峰值持续了将近20分钟，说明这组运动强度不小，有氧系统被充分调动起来了。运动过程中心率经历了几个明显的上升-回落周期，很可能是间歇性训练节奏。运动后心率恢复速度不错，几分钟内回到了平时水平，心肺系统状态良好。从恢复指标看，昨晚的睡眠为这次运动提供了不错的底子。\\n\\n运动后记得补充水分，今天可以先缓一缓让身体好好恢复。你觉得呢？",',
      "  \"summary\": \"Ming, just detected you finished a 30-min cardio session! Heart rate peaked for nearly 20 minutes — solid intensity, your aerobic system was fully engaged. During the workout, heart rate went through several clear rise-recovery cycles, likely an interval training pattern. Post-workout recovery was good, heart rate returned to usual level within minutes. From recovery metrics, last night's sleep provided a solid foundation.\\n\\nRemember to hydrate after exercise, take it easy today for recovery. What do you think?\",",
    ));
    sections.push('  "chartTokens": ["CHART_TOKEN_1"],');
    sections.push(t(
      locale,
      '  "actions": [\n    {\n      "id": "action_1",\n      "emoji": "🚶",\n      "title": "要不要轻走一下",\n      "description": "现在起身走 10 分钟，让心率和注意力缓一缓",\n      "aiPromise": "我会记录你的选择并用于本次建议上下文",\n      "interaction": {\n        "kind": "micro_event",\n        "microEvent": {\n          "type": "micro_short_walk",\n          "durationMinutes": 10\n        }\n      }\n    }\n  ],',
      '  "actions": [\n    {\n      "id": "action_1",\n      "emoji": "🚶",\n      "title": "Take a light walk",\n      "description": "Stand up and walk for 10 minutes to ease your heart rate and focus load",\n      "aiPromise": "I will record your choice and use it in this advice context",\n      "interaction": {\n        "kind": "micro_event",\n        "microEvent": {\n          "type": "micro_short_walk",\n          "durationMinutes": 10\n        }\n      }\n    }\n  ],',
    ));
    sections.push(t(
      locale,
      '  "actionsSectionTitle": "今天可以这样调整"',
      '  "actionsSectionTitle": "A few options for today"',
    ));
    sections.push('}');
  } else {
    sections.push('{');
    sections.push('  "source": "llm",');
    sections.push('  "statusColor": "good",');
    sections.push(t(
      locale,
      '  "summary": "摘要文本",',
      '  "summary": "Summary text",',
    ));
    sections.push('  "chartTokens": ["CHART_TOKEN_1"],');
    sections.push(t(
      locale,
      '  "microTips": ["贴士1", "贴士2"]',
      '  "microTips": ["Tip 1", "Tip 2"]',
    ));
    sections.push('}');
  }

  sections.push('```');

  return sections.join('\n');
}

function buildAnalyticalContext(context: AgentContext, locale: Locale): string[] {
  const items: string[] = [];

  if (context.memory.latestHomepageBrief) {
    items.push(`${t(locale, '上次首页摘要', 'Last homepage brief')}: ${context.memory.latestHomepageBrief}`);
  }
  if (context.memory.latestViewSummary) {
    items.push(`${t(locale, '上次视图总结', 'Last view summary')}: ${context.memory.latestViewSummary}`);
  }
  if (context.memory.latestRuleSummary) {
    items.push(`${t(locale, '上次规则分析', 'Last rule analysis')}: ${context.memory.latestRuleSummary}`);
  }

  return items;
}
