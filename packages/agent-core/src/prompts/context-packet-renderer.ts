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
import { AgentTaskType, ChartTokenId, type DataTab, type Locale } from '@health-advisor/shared';

const HOMEPAGE_INTERPRETATION_ONLY_METRICS = new Set(['hrv', 'spo2', 'resting_hr', 'resting-hr']);

// ────────────────────────────────────────────
// 双语标签辅助函数
// ────────────────────────────────────────────

function t(locale: Locale, zh: string, en: string): string {
  return locale === 'zh' ? zh : en;
}

// 中文用全角冒号，英文用半角冒号加空格
function colon(locale: Locale): string {
  return locale === 'zh' ? '：' : ': ';
}

// ────────────────────────────────────────────
// 主入口
// ────────────────────────────────────────────

export function renderTaskContextPacket(packet: TaskContextPacket, locale: Locale = 'zh'): string {
  const sections: string[] = [];
  const isHomepage = packet.task.type === AgentTaskType.HOMEPAGE_SUMMARY;

  sections.push(renderTaskPacket(packet.task, locale));
  sections.push(renderUserContext(packet.userContext, isHomepage, locale));
  sections.push(renderDataWindow(packet.dataWindow, locale));
  sections.push(renderMissingData(packet.missingData, locale));
  sections.push(renderVisibleCharts(packet.visibleCharts, isHomepage, locale));
  sections.push(renderEvidence(packet.evidence, isHomepage));

  if (packet.homepage) sections.push(renderHomepage(packet.homepage, locale));
  if (packet.viewSummary) sections.push(renderViewSummary(packet.viewSummary, locale));
  if (packet.advisorChat) sections.push(renderAdvisorChat(packet.advisorChat, locale));

  return sections.filter(Boolean).join('\n\n');
}

// ────────────────────────────────────────────
// Task
// ────────────────────────────────────────────

function renderTaskPacket(task: TaskPacket, locale: Locale): string {
  const c = colon(locale);
  const lines = [t(locale, '## 任务上下文', '## Task Context')];
  lines.push(`- ${t(locale, '任务类型', 'Task type')}${c}${task.type}`);
  lines.push(`- ${t(locale, '当前页面', 'Current page')}${c}${task.page}`);
  if (task.tab) lines.push(`- ${t(locale, '当前标签', 'Current tab')}${c}${task.tab}`);
  if (task.timeframe) lines.push(`- ${t(locale, '时间粒度', 'Time granularity')}${c}${task.timeframe}`);
  if (task.dateRange) lines.push(`- ${t(locale, '日期范围', 'Date range')}${c}${task.dateRange.start} ~ ${task.dateRange.end}`);
  if (task.userMessage) lines.push(`- ${t(locale, '用户消息', 'User message')}${c}${task.userMessage}`);
  if (task.smartPromptId) lines.push(`- Smart Prompt${c}${task.smartPromptId}`);
  return lines.join('\n');
}

// ────────────────────────────────────────────
// User Context
// ────────────────────────────────────────────

function renderUserContext(user: UserContextPacket, isHomepage: boolean, locale: Locale): string {
  const c = colon(locale);
  const lines = [t(locale, '## 用户信息', '## User Info')];
  lines.push(`- ${t(locale, '姓名', 'Name')}${c}${user.name}`);
  lines.push(`- ${t(locale, '年龄', 'Age')}${c}${user.age}`);
  if (user.tags.length > 0) {
    const tagSep = locale === 'zh' ? '、' : ', ';
    lines.push(`- ${t(locale, '标签', 'Tags')}${c}${user.tags.join(tagSep)}`);
  }
  lines.push('');
  lines.push(t(locale, '## 个人参考水平（内部分析用，不要原样写给用户）', '## Personal Reference Levels (internal only)'));
  if (isHomepage) {
    lines.push(`- ${t(locale, '静息心率通常水平：仅用于内部状态判定，首页简报禁止输出具体数值或相对关系', 'Resting HR usual level: for internal status assessment only; homepage briefing must not output specific values or relative relationships')}`);
    lines.push(`- ${t(locale, 'HRV 通常水平：仅用于内部恢复解读，首页简报禁止输出具体数值或相对关系', 'HRV usual level: for internal recovery interpretation only; homepage briefing must not output specific values or relative relationships')}`);
    lines.push(`- ${t(locale, 'SpO2 参考水平：仅用于内部风险判断，首页简报禁止输出具体数值或相对关系', 'SpO2 reference level: for internal risk assessment only; homepage briefing must not output specific values or relative relationships')}`);
  } else {
    lines.push(`- ${t(locale, '静息心率通常水平', 'Resting HR usual level')}${c}${user.baselines.restingHR} bpm`);
    lines.push(`- ${t(locale, 'HRV 通常水平', 'HRV usual level')}${c}${user.baselines.hrv} ms`);
    lines.push(`- ${t(locale, 'SpO2 参考水平', 'SpO2 reference level')}${c}${user.baselines.spo2}%`);
  }
  lines.push(`- ${t(locale, '平均睡眠', 'Average sleep')}${c}${user.baselines.avgSleepMinutes} ${t(locale, '分钟', 'minutes')}`);
  lines.push(`- ${t(locale, '平均步数', 'Average steps')}${c}${user.baselines.avgSteps} ${t(locale, '步', 'steps')}`);
  return lines.join('\n');
}

// ────────────────────────────────────────────
// Data Window
// ────────────────────────────────────────────

function renderDataWindow(dw: DataWindowPacket, locale: Locale): string {
  const c = colon(locale);
  const lines = [t(locale, '## 数据窗口', '## Data Window')];
  lines.push(`- ${t(locale, '时间范围', 'Time range')}${c}${dw.start} ~ ${dw.end}`);
  lines.push(`- ${t(locale, '记录数', 'Records')}${c}${dw.recordCount}`);
  lines.push(`- ${t(locale, '数据完整度', 'Data completeness')}${c}${dw.completenessPct}%`);
  return lines.join('\n');
}

// ────────────────────────────────────────────
// Missing Data
// ────────────────────────────────────────────

function renderMissingData(items: MissingDataItem[], locale: Locale): string {
  if (items.length === 0) {
    return t(locale, '## 数据质量\n\n当前数据窗口内各指标数据完整。', '## Data Quality\n\nAll metrics within the current data window are complete.');
  }

  const c = colon(locale);
  const lines = [t(locale, '## 数据质量约束', '## Data Quality Constraints')];
  for (const item of items) {
    lines.push(`- ${item.metric} ${t(locale, '在', 'in')} ${item.scope} ${t(locale, '缺失', 'missing')} ${item.missingCount}/${item.totalCount}`);
    if (item.lastAvailableDate) {
      lines.push(`  - ${t(locale, '最近可用日期', 'Last available date')}${c}${item.lastAvailableDate}`);
    }
    lines.push(`  - ${t(locale, '影响', 'Impact')}${c}${item.impact}`);
    if (item.requiredDisclosure) {
      lines.push(`  - ${t(locale, '披露要求', 'Required disclosure')}${c}${item.requiredDisclosure}`);
    }
  }
  return lines.join('\n');
}

// ────────────────────────────────────────────
// Visible Charts
// ────────────────────────────────────────────

function renderVisibleCharts(charts: VisibleChartPacket[], isHomepage: boolean, locale: Locale): string {
  if (charts.length === 0) return '';

  const lines = [t(locale, '## 可见图表', '## Visible Charts')];
  for (const chart of charts) {
    lines.push(`- ${chart.chartToken} (${chart.metric}, ${chart.timeframe})`);
    lines.push(renderMetricSummary(chart.dataSummary, '  ', {
      interpretationOnly: isHomepage && isHomepageInterpretationOnlyMetric(chart.metric),
    }, locale));
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

function renderHomepage(homepage: HomepageContextPacket, locale: Locale): string {
  const c = colon(locale);
  const lines: string[] = [];

  // Recent events
  if (homepage.recentEvents.length > 0) {
    lines.push(t(locale, '## 最近发生的事件', '## Recent Events'));
    for (const ev of homepage.recentEvents) {
      if (ev.start && ev.end) {
        lines.push(`- [${ev.type}] ${t(locale, '开始', 'start')}${c}${ev.start}, ${t(locale, '持续', 'duration')}${c}${ev.durationMin} ${t(locale, '分钟', 'min')}, ${t(locale, '置信度', 'confidence')}${c}${Math.round(ev.confidence * 100)}%`);
      } else {
        lines.push(`- [${ev.type}] ${ev.type}`);
      }
    }
  }

  // Latest 24h
  lines.push(t(locale, '## 过去24小时状态', '## Past 24h Status'));
  lines.push(`- ${t(locale, '日期', 'Date')}${c}${homepage.latest24h.date}`);
  for (const m of homepage.latest24h.metrics) {
    if (m.status === 'missing') {
      lines.push(`- ${m.metric}${c}${t(locale, '数据缺失', 'data missing')}`);
    } else if (isHomepageInterpretationOnlyMetric(m.metric)) {
      lines.push(`- ${m.metric}${c}${formatLatest24hStatus(m.status, locale)}，${t(locale, '用于解读状态与建议，不输出具体数值或参考关系', 'for status interpretation and recommendations only; do not output specific values or reference relationships')}`);
    } else {
      const parts: string[] = [`- ${m.metric}${c}${m.value}${m.unit}`];
      if (m.baseline !== undefined && m.deltaPctVsBaseline !== undefined) {
        const sign = m.deltaPctVsBaseline > 0 ? '+' : '';
        parts.push(`（${t(locale, '相对平时', 'vs usual')} ${sign}${m.deltaPctVsBaseline}%）`);
      }
      if (m.status === 'attention') parts.push(`[${t(locale, '注意', 'attention')}]`);
      lines.push(parts.join(''));
    }
  }

  // Trend 7d
  if (homepage.trend7d.length > 0) {
    lines.push(t(locale, '## 过去一周趋势', '## Past Week Trends'));
    for (const tr of homepage.trend7d) {
      lines.push(renderMetricSummary(tr, '- ', {
        interpretationOnly: isHomepageInterpretationOnlyMetric(tr.metric),
      }, locale));
    }
  }

  // Rules insights
  if (homepage.rulesInsights.length > 0) {
    lines.push(t(locale, '## 预处理信号', '## Pre-processed Signals'));
    for (const insight of homepage.rulesInsights) {
      lines.push(`- [${insight.severity}] ${insight.message}`);
    }
  }

  // Suggested chart tokens
  if (homepage.suggestedChartTokens.length > 0) {
    lines.push(t(locale, '## 建议关联图表', '## Suggested Charts'));
    lines.push(`${t(locale, '可引用的图表 token', 'Available chart tokens')}${c}${homepage.suggestedChartTokens.join(', ')}`);
  }

  return lines.join('\n');
}

// ────────────────────────────────────────────
// View Summary
// ────────────────────────────────────────────

function renderViewSummary(vs: ViewSummaryContextPacket, locale: Locale): string {
  const c = colon(locale);
  const lines: string[] = [];

  lines.push(t(locale, '## 视图上下文', '## View Context'));
  lines.push(`- ${t(locale, '当前标签页', 'Current tab')}${c}${vs.tab}`);
  lines.push(`- ${t(locale, '时间粒度', 'Time granularity')}${c}${vs.timeframe}`);

  if (vs.selectedMetric) {
    lines.push('');
    lines.push(t(locale, '## 选中指标详情', '## Selected Metric Details'));
    lines.push(`- chartToken${c}${getChartTokenForTab(vs.tab) ?? 'N/A'}`);
    lines.push(renderMetricSummary(vs.selectedMetric, '- ', {}, locale));
  }

  if (vs.overviewMetrics && vs.overviewMetrics.length > 0) {
    lines.push('');
    lines.push(t(locale, '## 核心指标概览', '## Key Metrics Overview'));
    for (const m of vs.overviewMetrics) {
      lines.push(renderMetricSummary(m, '- ', {}, locale));
    }
  }

  if (vs.rulesInsights.length > 0) {
    lines.push('');
    lines.push(t(locale, '## 预处理信号', '## Pre-processed Signals'));
    for (const insight of vs.rulesInsights) {
      lines.push(`- [${insight.severity}] ${insight.message}`);
    }
  }

  if (vs.suggestedChartTokens.length > 0) {
    lines.push('');
    lines.push(t(locale, '## 建议关联图表', '## Suggested Charts'));
    lines.push(`${t(locale, '可引用的图表 token', 'Available chart tokens')}${c}${vs.suggestedChartTokens.join(', ')}`);
  }

  return lines.join('\n');
}

// ────────────────────────────────────────────
// Advisor Chat
// ────────────────────────────────────────────

function renderAdvisorChat(chat: AdvisorChatContextPacket, locale: Locale): string {
  const c = colon(locale);
  const lines: string[] = [];

  lines.push(t(locale, '## 用户问题', '## User Question'));
  lines.push(chat.userMessage);

  lines.push('');
  lines.push(t(locale, '## 问题意图', '## Question Intent'));
  lines.push(`- ${t(locale, '关注指标', 'Focus metrics')}${c}${chat.questionIntent.metricFocus.join(', ') || t(locale, '未聚焦特定指标', 'No specific metric focus')}`);
  lines.push(`- ${t(locale, '时间范围', 'Time scope')}${c}${chat.questionIntent.timeScope}`);
  lines.push(`- ${t(locale, '意图类型', 'Intent type')}${c}${chat.questionIntent.actionIntent}`);
  lines.push(`- ${t(locale, '风险等级', 'Risk level')}${c}${chat.questionIntent.riskLevel}`);

  lines.push('');
  lines.push(t(locale, '## 当前页面', '## Current Page'));
  lines.push(`- ${t(locale, '页面', 'Page')}${c}${chat.currentPage.page}`);
  if (chat.currentPage.tab) lines.push(`- ${t(locale, '标签', 'Tab')}${c}${chat.currentPage.tab}`);
  if (chat.currentPage.timeframe) lines.push(`- ${t(locale, '时间粒度', 'Time granularity')}${c}${chat.currentPage.timeframe}`);
  if (chat.currentPage.visibleChartTokens.length > 0) {
    lines.push(`- ${t(locale, '可见图表', 'Visible charts')}${c}${chat.currentPage.visibleChartTokens.join(', ')}`);
  }

  if (chat.relevantFacts.length > 0) {
    lines.push('');
    lines.push(t(locale, '## 相关事实', '## Relevant Facts'));
    for (const fact of chat.relevantFacts) {
      lines.push(`- [${fact.factType}] ${fact.label}`);
      lines.push(`  ${fact.summary}`);
    }
  }

  if (chat.recentConversation.length > 0) {
    lines.push('');
    lines.push(t(locale, '## 对话历史', '## Conversation History'));
    for (const msg of chat.recentConversation) {
      const role = msg.role === 'user'
        ? t(locale, '用户', 'User')
        : t(locale, '助手', 'Assistant');
      lines.push(`- ${role}${c}${msg.text}`);
    }
  }

  lines.push('');
  lines.push(t(locale, '## 回答约束', '## Response Constraints'));
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
  locale: Locale = 'zh',
): string {
  const parts: string[] = [];
  parts.push(`${prefix}${ms.metric}:`);
  if (options.interpretationOnly) {
    parts.push(`trend ${ms.trendDirection}`);
    if (ms.anomalyPoints.length > 0) parts.push(`anomalies detected`);
    parts.push(ms.missing.missingCount === 0 ? 'data complete' : 'partial data');
    parts.push(t(locale, '仅用于解读：不要输出数值或相对关系', 'Interpretation only: do not output values or relative relationships'));
    return parts.join(', ');
  }
  if (ms.latest) parts.push(`latest ${ms.latest.value}${ms.latest.unit} on ${ms.latest.date ?? 'latest'}`);
  if (ms.average) parts.push(`avg ${ms.average.value}${ms.average.unit}`);
  if (ms.baseline) {
    const delta = ms.deltaPctVsBaseline !== undefined ? ` (${ms.deltaPctVsBaseline > 0 ? '+' : ''}${ms.deltaPctVsBaseline}%)` : '';
    parts.push(`${t(locale, '通常水平', 'usual level')} ${ms.baseline.value}${ms.baseline.unit}${delta}`);
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

function formatLatest24hStatus(status: 'normal' | 'attention' | 'missing', locale: Locale): string {
  switch (status) {
    case 'attention':
      return t(locale, '需要关注', 'attention needed');
    case 'missing':
      return t(locale, '数据缺失', 'data missing');
    case 'normal':
    default:
      return t(locale, '未见明显异常', 'no significant abnormality');
  }
}
