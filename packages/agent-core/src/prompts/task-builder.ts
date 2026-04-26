import { AgentTaskType } from '@health-advisor/shared';
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

export function buildTaskPrompt(
  context: AgentContext,
  loader: PromptLoader,
  rulesResult: RuleEvaluationResult,
  packet?: TaskContextPacket,
): string {
  const taskType = context.task.type;
  const promptName = TASK_PROMPT_MAP[taskType];
  const taskTemplate = promptName ? loader.load(promptName) : '';

  const route = TASK_ROUTES[taskType];
  const maxLen = route?.maxSummaryLength ?? 200;

  const sections: string[] = [taskTemplate];

  // 任务约束
  sections.push('');
  sections.push('## 任务约束');
  if (taskType === AgentTaskType.HOMEPAGE_SUMMARY) {
    sections.push(`- 摘要长度严格控制在 80-${maxLen} 字之间`);
  } else {
    sections.push(`- 摘要长度不超过 ${maxLen} 字`);
  }
  sections.push(`- 输出格式必须为 JSON，包含 source、statusColor、summary、chartTokens、microTips 字段`);

  // 使用 TaskContextPacket 渲染（如果可用）
  if (packet) {
    sections.push('');
    sections.push(renderTaskContextPacket(packet));
  } else {
    // 降级：保留基本数据窗口信息
    sections.push('');
    sections.push('## 数据窗口');
    sections.push(`- 时间范围：${context.dataWindow.start} ~ ${context.dataWindow.end}`);
    sections.push(`- 记录数：${context.dataWindow.records.length}`);

    // 保留 advisor_chat 用户消息
    if (taskType === AgentTaskType.ADVISOR_CHAT && context.task.userMessage) {
      sections.push('');
      sections.push('## 用户问题');
      sections.push(context.task.userMessage);
    }

    // 保留 visible chart hints
    if (taskType === AgentTaskType.ADVISOR_CHAT && context.task.visibleChartIds && context.task.visibleChartIds.length > 0) {
      sections.push('');
      sections.push('## 当前可见图表（提示）');
      sections.push(`- visibleChartHints: ${context.task.visibleChartIds.join(', ')}`);
    }
  }

  // 规则引擎 insights（兼容旧测试，后续迁移到 packet）
  if (rulesResult.insights.length > 0) {
    sections.push('');
    sections.push('## 预处理信号');
    for (const insight of rulesResult.insights) {
      sections.push(`- [${insight.severity}] ${insight.message}`);
    }
  }

  // 建议的 chart tokens
  if (rulesResult.suggestedChartTokens.length > 0) {
    sections.push('');
    sections.push('## 建议关联图表');
    sections.push(`可引用的图表 token：${rulesResult.suggestedChartTokens.join(', ')}`);
  }

  // 对话记忆（如果 packet 未提供，或作为补充）
  if (!packet && context.memory.recentMessages.length > 0) {
    sections.push('');
    sections.push('## 对话历史');
    for (const msg of context.memory.recentMessages) {
      sections.push(`- ${msg.role === 'user' ? '用户' : '助手'}：${msg.text}`);
    }
  }

  // analytical memory
  const analyticalContext = buildAnalyticalContext(context);
  if (analyticalContext.length > 0) {
    sections.push('');
    sections.push('## 历史分析参考');
    for (const item of analyticalContext) {
      sections.push(`- ${item}`);
    }
  }

  // 输出约束
  sections.push('');
  sections.push('## 输出字段说明');
  sections.push('- source: 使用 "llm" 或 "fallback"');
  sections.push('- statusColor: 使用 "good"、"warning"、"error" 之一');

  // 输出格式
  sections.push('');
  sections.push('## 输出格式');
  sections.push('请严格按以下 JSON 格式输出：');
  sections.push('```json');
  sections.push('{');
  sections.push('  "source": "llm",');
  sections.push('  "statusColor": "good",');
  sections.push('  "summary": "摘要文本",');
  sections.push('  "chartTokens": ["CHART_TOKEN_1"],');
  sections.push('  "microTips": ["贴士1", "贴士2"]');
  sections.push('}');
  sections.push('```');

  return sections.join('\n');
}

function buildAnalyticalContext(context: AgentContext): string[] {
  const items: string[] = [];

  if (context.memory.latestHomepageBrief) {
    items.push(`上次首页摘要：${context.memory.latestHomepageBrief}`);
  }
  if (context.memory.latestViewSummary) {
    items.push(`上次视图总结：${context.memory.latestViewSummary}`);
  }
  if (context.memory.latestRuleSummary) {
    items.push(`上次规则分析：${context.memory.latestRuleSummary}`);
  }

  return items;
}
