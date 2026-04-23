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

  // 首页任务：注入最近事件、昨日数据、7天趋势
  if (taskType === AgentTaskType.HOMEPAGE_SUMMARY && context.dataWindow.records.length > 0) {
    const records = context.dataWindow.records as any[];
    const latestRecord = records[records.length - 1];

    // 1. 最近发生的事件（timelineSync 模式）
    if (context.timelineSync && context.timelineSync.recognizedEvents.length > 0) {
      sections.push('');
      sections.push('## 最近发生的事件');
      for (const ev of context.timelineSync.recognizedEvents) {
        const durationMin = Math.round((new Date(ev.end).getTime() - new Date(ev.start).getTime()) / 60000);
        sections.push(`- [${ev.type}] 开始时间: ${ev.start}, 持续: ${durationMin} 分钟, 置信度: ${Math.round(ev.confidence * 100)}%`);
        if (ev.evidence && ev.evidence.length > 0) {
          sections.push(`  证据: ${ev.evidence.join('; ')}`);
        }
      }

      if (context.timelineSync.derivedTemporalStates.length > 0) {
        sections.push('');
        sections.push('## 当前派生状态');
        for (const state of context.timelineSync.derivedTemporalStates) {
          sections.push(`- [${state.type}] 激活时间: ${state.activeAt}`);
        }
      }
    }

    // 同时注入 injected events 作为补充
    if (context.signals.events.length > 0) {
      sections.push('');
      sections.push('## 系统检测到的事件');
      for (const ev of context.signals.events) {
        sections.push(`- ${ev}`);
      }
    }

    // 2. 过去24小时数据详情（昨日最新记录）
    sections.push('');
    sections.push('## 过去24小时状态（昨日数据）');
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

    // 3. 过去7天趋势（取最近7条记录）
    const weekRecords = records.slice(-7);
    if (weekRecords.length >= 3) {
      sections.push('');
      sections.push('## 过去一周趋势参考');
      const avgSleep = Math.round(weekRecords.reduce((sum, r) => sum + (r.sleep?.totalMinutes || 0), 0) / weekRecords.length);
      const avgSteps = Math.round(weekRecords.reduce((sum, r) => sum + (r.activity?.steps || 0), 0) / weekRecords.length);
      const avgStress = (weekRecords.reduce((sum, r) => sum + (r.stress?.load || 0), 0) / weekRecords.length).toFixed(1);

      sections.push(`- 睡眠周均值：${avgSleep} 分钟 (昨日: ${latestRecord.sleep?.totalMinutes ?? 0} 分钟)`);
      sections.push(`- 步数周均值：${avgSteps} 步 (昨日: ${latestRecord.activity?.steps ?? 0} 步)`);
      sections.push(`- 压力周均值：${avgStress} (昨日: ${latestRecord.stress?.load ?? 0})`);
    }
  }

  // 视图上下文（view_summary 需要）
  if (taskType === AgentTaskType.VIEW_SUMMARY && context.task.tab) {
    sections.push('');
    sections.push('## 视图上下文');
    sections.push(`- 当前标签页：${context.task.tab}`);
    sections.push(`- 时间粒度：${context.task.timeframe ?? 'week'}`);
  }

  // 概览页：注入全量核心指标摘要
  if (taskType === AgentTaskType.VIEW_SUMMARY && context.task.tab === 'overview' && context.dataWindow.records.length > 0) {
    const records = context.dataWindow.records as any[];
    const latest = records[records.length - 1];

    sections.push('');
    sections.push('## 核心指标概览');

    // HRV
    const hrvValues = records.map((r: any) => Array.isArray(r.hr) ? r.hr.filter((v: number) => v > 30 && v < 220) : [])
      .flat().filter((v: number) => typeof v === 'number');
    if (hrvValues.length > 0) {
      const hrvAvg = Math.round(hrvValues.reduce((a: number, b: number) => a + b, 0) / hrvValues.length);
      sections.push(`- HRV：近 ${records.length} 天均值 ${hrvAvg} ms`);
    }

    // Sleep
    if (latest.sleep) {
      const sleepVals = records.map((r: any) => r.sleep?.totalMinutes).filter((v: number | undefined) => typeof v === 'number');
      const sleepAvg = sleepVals.length > 0 ? Math.round(sleepVals.reduce((a: number, b: number) => a + b, 0) / sleepVals.length) : 0;
      sections.push(`- 睡眠：平均 ${(sleepAvg / 60).toFixed(1)} 小时，昨日 ${(latest.sleep.totalMinutes / 60).toFixed(1)} 小时`);
    }

    // Resting HR
    if (latest.hr && Array.isArray(latest.hr) && latest.hr.length > 0) {
      const restingVals = records.map((r: any) => Array.isArray(r.hr) && r.hr.length > 0 ? r.hr[0] : undefined).filter((v: number | undefined) => typeof v === 'number');
      const restingAvg = restingVals.length > 0 ? Math.round(restingVals.reduce((a: number, b: number) => a + b, 0) / restingVals.length) : latest.hr[0];
      const baseline = context.profile.baselines.restingHR;
      const deviation = baseline ? Math.round(((restingAvg - baseline) / baseline) * 100) : 0;
      sections.push(`- 静息心率：均值 ${restingAvg} bpm（基线 ${baseline} bpm，偏离 ${deviation > 0 ? '+' : ''}${deviation}%）`);
    }

    // Activity
    if (latest.activity) {
      const stepsVals = records.map((r: any) => r.activity?.steps).filter((v: number | undefined) => typeof v === 'number');
      const stepsAvg = stepsVals.length > 0 ? Math.round(stepsVals.reduce((a: number, b: number) => a + b, 0) / stepsVals.length) : 0;
      sections.push(`- 活动：日均 ${stepsAvg.toLocaleString()} 步，昨日 ${latest.activity.steps.toLocaleString()} 步`);
    }

    // SpO2
    if (latest.spo2) {
      const spo2Vals = records.map((r: any) => r.spo2).filter((v: number | undefined) => typeof v === 'number');
      const spo2Avg = spo2Vals.length > 0 ? Math.round(spo2Vals.reduce((a: number, b: number) => a + b, 0) / spo2Vals.length) : latest.spo2;
      sections.push(`- 血氧：均值 ${spo2Avg}%`);
    }

    // Stress
    if (latest.stress) {
      const stressVals = records.map((r: any) => r.stress?.load).filter((v: number | undefined) => typeof v === 'number');
      const stressAvg = stressVals.length > 0 ? (stressVals.reduce((a: number, b: number) => a + b, 0) / stressVals.length).toFixed(1) : latest.stress.load;
      sections.push(`- 压力负荷：均值 ${stressAvg}`);
    }
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
