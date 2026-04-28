import type {
  TaskContextPacket,
  TaskPacket,
  UserContextPacket,
  DataWindowPacket,
  MissingDataItem,
  EvidenceFact,
  VisibleChartPacket,
  HomepageContextPacket,
  ViewSummaryContextPacket,
  AdvisorChatContextPacket,
  MetricSummary,
} from '../context/context-packet';
import { AgentTaskType, ChartTokenId, type DataTab } from '@health-advisor/shared';

const HOMEPAGE_INTERPRETATION_ONLY_METRICS = new Set(['hrv', 'spo2', 'resting_hr', 'resting-hr']);

// ────────────────────────────────────────────
// 主入口
// ────────────────────────────────────────────

export function renderTaskContextPacket(packet: TaskContextPacket): string {
  const sections: string[] = [];
  const isHomepage = packet.task.type === AgentTaskType.HOMEPAGE_SUMMARY;

  sections.push(renderTaskPacket(packet.task));
  sections.push(renderUserContext(packet.userContext, isHomepage));
  sections.push(renderDataWindow(packet.dataWindow));
  sections.push(renderMissingData(packet.missingData));
  sections.push(renderVisibleCharts(packet.visibleCharts, isHomepage));
  sections.push(renderEvidence(packet.evidence, isHomepage));

  if (packet.homepage) sections.push(renderHomepage(packet.homepage));
  if (packet.viewSummary) sections.push(renderViewSummary(packet.viewSummary));
  if (packet.advisorChat) sections.push(renderAdvisorChat(packet.advisorChat));

  return sections.filter(Boolean).join('\n\n');
}

// ────────────────────────────────────────────
// Task
// ────────────────────────────────────────────

function renderTaskPacket(task: TaskPacket): string {
  const lines = ['## 任务上下文'];
  lines.push(`- 任务类型：${task.type}`);
  lines.push(`- 当前页面：${task.page}`);
  if (task.tab) lines.push(`- 当前标签：${task.tab}`);
  if (task.timeframe) lines.push(`- 时间粒度：${task.timeframe}`);
  if (task.dateRange) lines.push(`- 日期范围：${task.dateRange.start} ~ ${task.dateRange.end}`);
  if (task.userMessage) lines.push(`- 用户消息：${task.userMessage}`);
  if (task.smartPromptId) lines.push(`- Smart Prompt：${task.smartPromptId}`);
  return lines.join('\n');
}

// ────────────────────────────────────────────
// User Context
// ────────────────────────────────────────────

function renderUserContext(user: UserContextPacket, isHomepage: boolean): string {
  const lines = ['## 用户信息'];
  lines.push(`- 姓名：${user.name}`);
  lines.push(`- 年龄：${user.age}`);
  if (user.tags.length > 0) lines.push(`- 标签：${user.tags.join('、')}`);
  lines.push('');
  lines.push('## 个人参考水平（内部分析用，不要原样写给用户）');
  if (isHomepage) {
    lines.push('- 静息心率通常水平：仅用于内部状态判定，首页简报禁止输出具体数值或相对关系');
    lines.push('- HRV 通常水平：仅用于内部恢复解读，首页简报禁止输出具体数值或相对关系');
    lines.push('- SpO2 参考水平：仅用于内部风险判断，首页简报禁止输出具体数值或相对关系');
  } else {
    lines.push(`- 静息心率通常水平：${user.baselines.restingHR} bpm`);
    lines.push(`- HRV 通常水平：${user.baselines.hrv} ms`);
    lines.push(`- SpO2 参考水平：${user.baselines.spo2}%`);
  }
  lines.push(`- 平均睡眠：${user.baselines.avgSleepMinutes} 分钟`);
  lines.push(`- 平均步数：${user.baselines.avgSteps} 步`);
  return lines.join('\n');
}

// ────────────────────────────────────────────
// Data Window
// ────────────────────────────────────────────

function renderDataWindow(dw: DataWindowPacket): string {
  const lines = ['## 数据窗口'];
  lines.push(`- 时间范围：${dw.start} ~ ${dw.end}`);
  lines.push(`- 记录数：${dw.recordCount}`);
  lines.push(`- 数据完整度：${dw.completenessPct}%`);
  return lines.join('\n');
}

// ────────────────────────────────────────────
// Missing Data
// ────────────────────────────────────────────

function renderMissingData(items: MissingDataItem[]): string {
  if (items.length === 0) {
    return '## 数据质量\n\n当前数据窗口内各指标数据完整。';
  }

  const lines = ['## 数据质量约束'];
  for (const item of items) {
    lines.push(`- ${item.metric} 在 ${item.scope} 缺失 ${item.missingCount}/${item.totalCount}`);
    if (item.lastAvailableDate) {
      lines.push(`  - 最近可用日期：${item.lastAvailableDate}`);
    }
    lines.push(`  - 影响：${item.impact}`);
    if (item.requiredDisclosure) {
      lines.push(`  - 披露要求：${item.requiredDisclosure}`);
    }
  }
  return lines.join('\n');
}

// ────────────────────────────────────────────
// Visible Charts
// ────────────────────────────────────────────

function renderVisibleCharts(charts: VisibleChartPacket[], isHomepage: boolean): string {
  if (charts.length === 0) return '';

  const lines = ['## 可见图表'];
  for (const chart of charts) {
    lines.push(`- ${chart.chartToken} (${chart.metric}, ${chart.timeframe})`);
    lines.push(renderMetricSummary(chart.dataSummary, '  ', {
      interpretationOnly: isHomepage && isHomepageInterpretationOnlyMetric(chart.metric),
    }));
  }
  return lines.join('\n');
}

// ────────────────────────────────────────────
// Evidence
// ────────────────────────────────────────────

function renderEvidence(evidence: EvidenceFact[], isHomepage: boolean): string {
  if (evidence.length === 0) return '';

  const lines = ['## Evidence Facts'];
  for (const fact of evidence) {
    const parts: string[] = [`- ${fact.id}:`];
    parts.push(`source=${fact.source}`);
    if (fact.dateRange) parts.push(`${fact.dateRange.start}~${fact.dateRange.end}`);
    if (fact.metric) parts.push(`metric=${fact.metric}`);
    if (fact.value !== undefined && !(isHomepage && isHomepageInterpretationOnlyMetric(fact.metric))) {
      parts.push(`value=${fact.value}${fact.unit ?? ''}`);
    }
    parts.push(`derivation=${fact.derivation}`);
    lines.push(parts.join(', '));
  }
  return lines.join('\n');
}

// ────────────────────────────────────────────
// Homepage
// ────────────────────────────────────────────

function renderHomepage(homepage: HomepageContextPacket): string {
  const lines: string[] = [];

  // Recent events
  if (homepage.recentEvents.length > 0) {
    lines.push('## 最近发生的事件');
    for (const ev of homepage.recentEvents) {
      if (ev.start && ev.end) {
        lines.push(`- [${ev.type}] 开始: ${ev.start}, 持续: ${ev.durationMin} 分钟, 置信度: ${Math.round(ev.confidence * 100)}%`);
      } else {
        lines.push(`- [${ev.type}] ${ev.type}`);
      }
    }
  }

  // Latest 24h
  lines.push('## 过去24小时状态');
  lines.push(`- 日期：${homepage.latest24h.date}`);
  for (const m of homepage.latest24h.metrics) {
    if (m.status === 'missing') {
      lines.push(`- ${m.metric}：数据缺失`);
    } else if (isHomepageInterpretationOnlyMetric(m.metric)) {
      lines.push(`- ${m.metric}：${formatLatest24hStatus(m.status)}，用于解读状态与建议，不输出具体数值或参考关系`);
    } else {
      const parts: string[] = [`- ${m.metric}：${m.value}${m.unit}`];
      if (m.baseline !== undefined && m.deltaPctVsBaseline !== undefined) {
        const sign = m.deltaPctVsBaseline > 0 ? '+' : '';
        parts.push(`（相对平时 ${sign}${m.deltaPctVsBaseline}%）`);
      }
      if (m.status === 'attention') parts.push('[注意]');
      lines.push(parts.join(''));
    }
  }

  // Trend 7d
  if (homepage.trend7d.length > 0) {
    lines.push('## 过去一周趋势');
    for (const t of homepage.trend7d) {
      lines.push(renderMetricSummary(t, '- ', {
        interpretationOnly: isHomepageInterpretationOnlyMetric(t.metric),
      }));
    }
  }

  // Rules insights
  if (homepage.rulesInsights.length > 0) {
    lines.push('## 预处理信号');
    for (const insight of homepage.rulesInsights) {
      lines.push(`- [${insight.severity}] ${insight.message}`);
    }
  }

  // Suggested chart tokens
  if (homepage.suggestedChartTokens.length > 0) {
    lines.push('## 建议关联图表');
    lines.push(`可引用的图表 token：${homepage.suggestedChartTokens.join(', ')}`);
  }

  return lines.join('\n');
}

// ────────────────────────────────────────────
// View Summary
// ────────────────────────────────────────────

function renderViewSummary(vs: ViewSummaryContextPacket): string {
  const lines: string[] = [];

  lines.push('## 视图上下文');
  lines.push(`- 当前标签页：${vs.tab}`);
  lines.push(`- 时间粒度：${vs.timeframe}`);

  if (vs.selectedMetric) {
    lines.push('');
    lines.push('## 选中指标详情');
    lines.push(`- chartToken: ${getChartTokenForTab(vs.tab) ?? 'N/A'}`);
    lines.push(renderMetricSummary(vs.selectedMetric, '- '));
  }

  if (vs.overviewMetrics && vs.overviewMetrics.length > 0) {
    lines.push('');
    lines.push('## 核心指标概览');
    for (const m of vs.overviewMetrics) {
      lines.push(renderMetricSummary(m, '- '));
    }
  }

  if (vs.rulesInsights.length > 0) {
    lines.push('');
    lines.push('## 预处理信号');
    for (const insight of vs.rulesInsights) {
      lines.push(`- [${insight.severity}] ${insight.message}`);
    }
  }

  if (vs.suggestedChartTokens.length > 0) {
    lines.push('');
    lines.push('## 建议关联图表');
    lines.push(`可引用的图表 token：${vs.suggestedChartTokens.join(', ')}`);
  }

  return lines.join('\n');
}

// ────────────────────────────────────────────
// Advisor Chat
// ────────────────────────────────────────────

function renderAdvisorChat(chat: AdvisorChatContextPacket): string {
  const lines: string[] = [];

  lines.push('## 用户问题');
  lines.push(chat.userMessage);

  lines.push('');
  lines.push('## 问题意图');
  lines.push(`- 关注指标：${chat.questionIntent.metricFocus.join(', ') || '未聚焦特定指标'}`);
  lines.push(`- 时间范围：${chat.questionIntent.timeScope}`);
  lines.push(`- 意图类型：${chat.questionIntent.actionIntent}`);
  lines.push(`- 风险等级：${chat.questionIntent.riskLevel}`);

  lines.push('');
  lines.push('## 当前页面');
  lines.push(`- 页面：${chat.currentPage.page}`);
  if (chat.currentPage.tab) lines.push(`- 标签：${chat.currentPage.tab}`);
  if (chat.currentPage.timeframe) lines.push(`- 时间粒度：${chat.currentPage.timeframe}`);
  if (chat.currentPage.visibleChartTokens.length > 0) {
    lines.push(`- 可见图表：${chat.currentPage.visibleChartTokens.join(', ')}`);
  }

  if (chat.relevantFacts.length > 0) {
    lines.push('');
    lines.push('## 相关事实');
    for (const fact of chat.relevantFacts) {
      lines.push(`- [${fact.factType}] ${fact.label}`);
      lines.push(`  ${fact.summary}`);
    }
  }

  if (chat.recentConversation.length > 0) {
    lines.push('');
    lines.push('## 对话历史');
    for (const msg of chat.recentConversation) {
      lines.push(`- ${msg.role === 'user' ? '用户' : '助手'}：${msg.text}`);
    }
  }

  lines.push('');
  lines.push('## 回答约束');
  for (const c of chat.constraints) {
    lines.push(`- ${c.description}`);
  }

  return lines.join('\n');
}

// ────────────────────────────────────────────
// MetricSummary 渲染（公共辅助）
// ────────────────────────────────────────────

function renderMetricSummary(
  ms: MetricSummary,
  prefix: string = '',
  options: { interpretationOnly?: boolean } = {},
): string {
  const parts: string[] = [];
  parts.push(`${prefix}${ms.metric}:`);
  if (options.interpretationOnly) {
    parts.push(`trend ${ms.trendDirection}`);
    if (ms.anomalyPoints.length > 0) parts.push(`anomalies detected`);
    parts.push(ms.missing.missingCount === 0 ? 'data complete' : 'partial data');
    parts.push('仅用于解读：不要输出数值或相对关系');
    return parts.join(', ');
  }
  if (ms.latest) parts.push(`latest ${ms.latest.value}${ms.latest.unit} on ${ms.latest.date ?? 'latest'}`);
  if (ms.average) parts.push(`avg ${ms.average.value}${ms.average.unit}`);
  if (ms.baseline) {
    const delta = ms.deltaPctVsBaseline !== undefined ? ` (${ms.deltaPctVsBaseline > 0 ? '+' : ''}${ms.deltaPctVsBaseline}%)` : '';
    parts.push(`通常水平 ${ms.baseline.value}${ms.baseline.unit}${delta}`);
  }
  parts.push(`trend ${ms.trendDirection}`);
  if (ms.anomalyPoints.length > 0) {
    parts.push(`anomalies: ${ms.anomalyPoints.map((a) => `${a.date}=${a.value}`).join(', ')}`);
  }
  parts.push(`completeness ${ms.missing.completenessPct}% (${ms.missing.totalCount - ms.missing.missingCount}/${ms.missing.totalCount})`);
  return parts.join(', ');
}

// ────────────────────────────────────────────
// 辅助：tab 到 chartToken
// ────────────────────────────────────────────

function getChartTokenForTab(tab: DataTab): ChartTokenId | undefined {
  const map: Record<DataTab, ChartTokenId> = {
    overview: ChartTokenId.HRV_7DAYS,
    hrv: ChartTokenId.HRV_7DAYS,
    sleep: ChartTokenId.SLEEP_7DAYS,
    'resting-hr': ChartTokenId.RESTING_HR_7DAYS,
    activity: ChartTokenId.ACTIVITY_7DAYS,
    spo2: ChartTokenId.SPO2_7DAYS,
    stress: ChartTokenId.STRESS_LOAD_7DAYS,
  };
  return map[tab];
}

function isHomepageInterpretationOnlyMetric(metric?: string): boolean {
  return metric !== undefined && HOMEPAGE_INTERPRETATION_ONLY_METRICS.has(metric);
}

function formatLatest24hStatus(status: 'normal' | 'attention' | 'missing'): string {
  switch (status) {
    case 'attention':
      return '需要关注';
    case 'missing':
      return '数据缺失';
    case 'normal':
    default:
      return '未见明显异常';
  }
}
