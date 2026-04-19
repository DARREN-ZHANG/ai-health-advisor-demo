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
  // 首页晨报需要字数区间约束（PRD: 80-120 字）
  if (taskType === AgentTaskType.HOMEPAGE_SUMMARY) {
    sections.push(`- 摘要长度严格控制在 80-${maxLen} 字之间`);
  } else {
    sections.push(`- 摘要长度不超过 ${maxLen} 字`);
  }
  sections.push(`- 输出格式必须为 JSON，包含 source、statusColor、summary、chartTokens、microTips 字段`);

  // 数据窗口
  sections.push('');
  sections.push('## 数据窗口');
  sections.push(`- 时间范围：${context.dataWindow.start} ~ ${context.dataWindow.end}`);
  sections.push(`- 记录数：${context.dataWindow.records.length}`);

  // 首页任务：注入昨日（最新一条）记录的具体数据与 14 天历史趋势分析
  if (taskType === AgentTaskType.HOMEPAGE_SUMMARY && context.dataWindow.records.length > 0) {
    const records = context.dataWindow.records as any[];
    const latestRecord = records[records.length - 1];

    // 1. 昨日数据详情
    sections.push('');
    sections.push('## 昨日数据');
    sections.push(`- 日期：${latestRecord.date ?? '未知'}`);
    if (latestRecord.hr && Array.isArray(latestRecord.hr)) {
      const avg = Math.round(latestRecord.hr.reduce((a: number, b: number) => a + b, 0) / latestRecord.hr.length);
      sections.push(`- 心率：均值 ${avg} bpm`);
    }
    if (latestRecord.sleep) {
      sections.push(`- 睡眠：${latestRecord.sleep.totalMinutes} 分钟`);
      sections.push(`  - 深睡 ${latestRecord.sleep.stages?.deep ?? 0} 分钟 / REM ${latestRecord.sleep.stages?.rem ?? 0} 分钟`);
    }
    if (latestRecord.activity) {
      sections.push(`- 运动：${latestRecord.activity.steps} 步，${latestRecord.activity.activeMinutes} 分钟`);
    }
    if (latestRecord.stress) {
      sections.push(`- 压力负荷：${latestRecord.stress.load}`);
    }

    // 2. 14 天趋势分析
    sections.push('');
    sections.push('## 14 天趋势参考 (均值 vs 昨日)');
    const avgSleep = Math.round(records.reduce((sum, r) => sum + (r.sleep?.totalMinutes || 0), 0) / records.length);
    const avgSteps = Math.round(records.reduce((sum, r) => sum + (r.activity?.steps || 0), 0) / records.length);
    const avgStress = (records.reduce((sum, r) => sum + (r.stress?.load || 0), 0) / records.length).toFixed(1);

    sections.push(`- 睡眠均值：${avgSleep} 分钟 (昨日偏移: ${latestRecord.sleep?.totalMinutes - avgSleep} 分钟)`);
    sections.push(`- 步数均值：${avgSteps} 步 (昨日偏移: ${latestRecord.activity?.steps - avgSteps} 步)`);
    sections.push(`- 压力均值：${avgStress} (昨日偏移: ${(latestRecord.stress?.load - Number(avgStress)).toFixed(1)})`);

    // 3. 图表联动指令
    sections.push('');
    sections.push('## 图表联动规则');
    sections.push('- 若发现睡眠异常，必须在 chartTokens 中包含 "SLEEP_7DAYS"');
    sections.push('- 若发现运动不足或过量，必须包含 "ACTIVITY_7DAYS"');
    sections.push('- 若发现压力过载或 HRV 异常，必须包含 "HRV_7DAYS" 或 "STRESS_LOAD_7DAYS"');
  }

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

  if (taskType === AgentTaskType.ADVISOR_CHAT && context.task.smartPromptId) {
    sections.push('');
    sections.push('## Smart Prompt');
    sections.push(`- smartPromptId: ${context.task.smartPromptId}`);
  }

  if (taskType === AgentTaskType.ADVISOR_CHAT && context.task.visibleChartIds && context.task.visibleChartIds.length > 0) {
    sections.push('');
    sections.push('## 当前可见图表');
    sections.push(`- visibleChartIds: ${context.task.visibleChartIds.join(', ')}`);
  }

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
