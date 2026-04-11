import { AgentTaskType } from '@health-advisor/shared';
import type { AgentContext } from '../types/agent-context';
import type { PromptLoader, PromptName } from './prompt-loader';
import type { RuleEvaluationResult } from '../rules/types';
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
  sections.push(`- 摘要长度不超过 ${maxLen} 字`);
  sections.push(`- 输出格式必须为 JSON，包含 summary、chartTokens、microTips 字段`);

  // 数据窗口
  sections.push('');
  sections.push('## 数据窗口');
  sections.push(`- 时间范围：${context.dataWindow.start} ~ ${context.dataWindow.end}`);
  sections.push(`- 记录数：${context.dataWindow.records.length}`);

  // 视图上下文（view_summary 需要）
  if (taskType === AgentTaskType.VIEW_SUMMARY && context.task.tab) {
    sections.push('');
    sections.push('## 视图上下文');
    sections.push(`- 当前标签页：${context.task.tab}`);
    sections.push(`- 时间粒度：${context.task.timeframe ?? 'week'}`);
  }

  // 规则引擎 insights
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

  // 对话记忆
  if (context.memory.recentMessages.length > 0) {
    sections.push('');
    sections.push('## 对话历史');
    for (const msg of context.memory.recentMessages) {
      sections.push(`- ${msg.role === 'user' ? '用户' : '助手'}：${msg.text}`);
    }
  }

  // analytical memory：之前的分析结果作为参考上下文
  const analyticalContext = buildAnalyticalContext(context);
  if (analyticalContext.length > 0) {
    sections.push('');
    sections.push('## 历史分析参考');
    for (const item of analyticalContext) {
      sections.push(`- ${item}`);
    }
  }

  // 用户消息（advisor_chat）
  if (taskType === AgentTaskType.ADVISOR_CHAT && context.task.userMessage) {
    sections.push('');
    sections.push('## 用户问题');
    sections.push(context.task.userMessage);
  }

  // 输出格式
  sections.push('');
  sections.push('## 输出格式');
  sections.push('请严格按以下 JSON 格式输出：');
  sections.push('```json');
  sections.push('{');
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
