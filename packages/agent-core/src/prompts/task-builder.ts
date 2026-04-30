import { AgentTaskType, type Locale } from '@health-advisor/shared';
import type { AgentContext } from '../types/agent-context';
import type { PromptLoader, PromptName } from './prompt-loader';
import type { RuleEvaluationResult } from '../rules/types';
import type { TaskContextPacket } from '../context/context-packet';
import { renderTaskContextPacket } from './context-packet-renderer';
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
  if (taskType === AgentTaskType.HOMEPAGE_SUMMARY) {
    sections.push(t(
      locale,
      `- 摘要长度严格控制在 80-${maxLen} 字之间`,
      `- Summary length must be strictly between 80-${maxLen} words`,
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
    '- 输出格式必须为 JSON，包含 source、statusColor、summary、chartTokens、microTips 字段',
    '- Output must be valid JSON with fields: source, statusColor, summary, chartTokens, microTips',
  ));

  // 使用 TaskContextPacket 渲染（如果可用）
  if (packet) {
    sections.push('');
    sections.push(renderTaskContextPacket(packet, locale));
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
    sections.push(t(locale, '## 历史分析参考', '## Historical Analysis Reference'));
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
