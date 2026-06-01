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
import { ChartTokenId, type DataTab, type Locale } from '@health-advisor/shared';

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

export function renderTaskContextPacket(packet: TaskContextPacket, locale: Locale = 'zh', demoNow?: string): string {
  const sections: string[] = [];

  // 检测首页是否有最近事件，用于控制上下文数据的详细程度
  const hasHomepageEvents = (packet.homepage?.recentEvents?.length ?? 0) > 0;

  sections.push(renderTaskPacket(packet.task, locale));

  // 注入当前模拟时间（让 LLM 感知 demo timeline 的"现在"）
  if (demoNow) {
    sections.push(`## ${t(locale, '当前时间', 'Current Time')}\n- ${t(locale, '当前模拟时间', 'Current simulated time')}${colon(locale)}${demoNow}`);
  }

  sections.push(renderUserContext(packet.userContext, locale, hasHomepageEvents));
  sections.push(renderDataWindow(packet.dataWindow, locale));
  sections.push(renderMissingData(packet.missingData, locale));
  sections.push(renderVisibleCharts(packet.visibleCharts, locale, hasHomepageEvents));
  sections.push(renderEvidence(packet.evidence, homepageVisibleEvidenceIds(packet.homepage)));

  if (packet.homepage) sections.push(renderHomepage(packet.homepage, locale, demoNow));
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

function renderUserContext(user: UserContextPacket, locale: Locale, hasHomepageEvents: boolean = false): string {
  const c = colon(locale);
  const lines = [t(locale, '## 用户信息', '## User Info')];
  lines.push(`- ${t(locale, '姓名', 'Name')}${c}${user.name}`);
  lines.push(`- ${t(locale, '年龄', 'Age')}${c}${user.age}`);
  if (user.tags.length > 0) {
    const tagSep = locale === 'zh' ? '、' : ', ';
    lines.push(`- ${t(locale, '标签', 'Tags')}${c}${user.tags.join(tagSep)}`);
  }
  lines.push('');

  if (hasHomepageEvents) {
    // 有事件时：压缩为一行，降低 baseline 数据的视觉权重
    lines.push(t(locale, '## 个人参考水平（仅供交叉验证，禁止在 summary 中展开）', '## Personal Reference Levels (cross-validation only, do not expand in summary)'));
    const bl = user.baselines;
    lines.push(t(locale,
      `静息心率 ${bl.restingHR}bpm, HRV ${bl.hrv}ms, SpO2 ${bl.spo2}%, 睡眠 ${bl.avgSleepMinutes}min, 步数 ${bl.avgSteps}`,
      `resting HR ${bl.restingHR}bpm, HRV ${bl.hrv}ms, SpO2 ${bl.spo2}%, sleep ${bl.avgSleepMinutes}min, steps ${bl.avgSteps}`,
    ));
  } else {
    lines.push(t(locale, '## 个人参考水平（内部分析用，不要原样写给用户）', '## Personal Reference Levels (internal only)'));
    lines.push(`- ${t(locale, '静息心率通常水平', 'Resting HR usual level')}${c}${user.baselines.restingHR} bpm`);
    lines.push(`- ${t(locale, 'HRV 通常水平', 'HRV usual level')}${c}${user.baselines.hrv} ms`);
    lines.push(`- ${t(locale, 'SpO2 参考水平', 'SpO2 reference level')}${c}${user.baselines.spo2}%`);
    lines.push(`- ${t(locale, '平均睡眠', 'Average sleep')}${c}${user.baselines.avgSleepMinutes} min`);
    lines.push(`- ${t(locale, '平均步数', 'Average steps')}${c}${user.baselines.avgSteps} steps`);
  }

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

function renderVisibleCharts(charts: VisibleChartPacket[], locale: Locale, hasHomepageEvents: boolean = false): string {
  if (charts.length === 0) return '';

  const lines = [t(locale, '## 可见图表', '## Visible Charts')];

  if (hasHomepageEvents) {
    // 有事件时：压缩为单行摘要，降低图表数据的视觉权重
    for (const chart of charts) {
      const latest = chart.dataSummary.latest;
      const valStr = latest ? `${latest.value}${latest.unit}` : 'N/A';
      lines.push(`- ${chart.chartToken}: ${valStr}, ${t(locale, '趋势', 'trend')} ${chart.dataSummary.trendDirection}`);
    }
  } else {
    for (const chart of charts) {
      lines.push(`- ${chart.chartToken} (${chart.metric}, ${chart.timeframe})`);
      lines.push(renderMetricSummary(chart.dataSummary, '  ', {}, locale));
    }
  }

  return lines.join('\n');
}

// ────────────────────────────────────────────
// Evidence
// ────────────────────────────────────────────

function homepageVisibleEvidenceIds(homepage?: HomepageContextPacket): Set<string> | undefined {
  if (!homepage || homepage.recentEvents.length === 0) return undefined;
  return new Set(homepage.eventInsights.flatMap((insight) => insight.evidenceIds));
}

function renderEvidence(evidence: EvidenceFact[], visibleEvidenceIds?: Set<string>): string {
  const facts = visibleEvidenceIds
    ? evidence.filter((fact) => visibleEvidenceIds.has(fact.id))
    : evidence;
  if (facts.length === 0) return '';

  const lines = ['## Evidence Facts'];
  for (const fact of facts) {
    const parts: string[] = [`- ${fact.id}:`];
    parts.push(`source=${fact.source}`);
    if (fact.dateRange) parts.push(`${fact.dateRange.start}~${fact.dateRange.end}`);
    if (fact.metric) parts.push(`metric=${fact.metric}`);
    if (fact.value !== undefined) {
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

function renderHomepageEventInsights(homepage: HomepageContextPacket, locale: Locale): string {
  if (!homepage.eventInsights || homepage.eventInsights.length === 0) return '';

  const lines = [t(locale, '## 事件生理摘要（优先引用）', '## Event Physiology Insights (Prioritize)')];
  lines.push(t(
    locale,
    '这些结构化摘要是最近事件的优先解释输入。summary 应自然转写，不要复制列表格式。',
    'These structured insights are the priority interpretation input for recent events. Rewrite naturally; do not copy the list format.',
  ));

  for (const insight of homepage.eventInsights) {
    lines.push(`- [${insight.priority}] ${insight.eventType}, ${insight.timeRelation}`);
    lines.push(`  - ${t(locale, '事件摘要', 'Event summary')}${colon(locale)}${insight.headline}`);
    if (insight.eventWindow) {
      lines.push(`  - ${t(locale, '事件窗口', 'Event window')}${colon(locale)}${insight.eventWindow.start} ~ ${insight.eventWindow.end}, ${t(locale, '样本数', 'samples')}${colon(locale)}${insight.eventWindow.sampleCount}, ${t(locale, '覆盖度', 'coverage')}${colon(locale)}${insight.eventWindow.coverage}`);
      for (const metric of insight.eventWindow.metrics) {
        const values = [
          metric.max !== undefined ? `${t(locale, '峰值', 'max')} ${metric.max}${metric.unit}` : '',
          metric.average !== undefined ? `${t(locale, '均值', 'avg')} ${metric.average}${metric.unit}` : '',
          metric.latest !== undefined ? `${t(locale, '末段', 'latest')} ${metric.latest}${metric.unit}` : '',
          metric.delta !== undefined ? `${t(locale, '变化', 'delta')} ${metric.delta > 0 ? '+' : ''}${metric.delta}${metric.unit}` : '',
        ].filter(Boolean).join(', ');
        lines.push(`  - ${t(locale, '事件窗口指标', 'Event-window metric')}${colon(locale)}${metric.metric} ${metric.qualifier}${values ? ` (${values})` : ''} — ${metric.interpretation}`);
      }
    }
    lines.push(`  - ${t(locale, '当前张力', 'Body tension')}${colon(locale)}${insight.tension.level}: ${insight.tension.summary}`);
    for (const item of insight.physiology) {
      const value = item.value !== undefined ? ` ${item.value}${item.unit ?? ''}` : '';
      lines.push(`  - ${t(locale, '生理特征', 'Physiology')}${colon(locale)}${item.metric} ${item.qualifier}${value} — ${item.interpretation}`);
    }
    for (const item of insight.recoveryContext) {
      lines.push(`  - ${t(locale, '恢复背景', 'Recovery context')}${colon(locale)}${item.relation} ${item.metric} — ${item.summary}`);
    }
    for (const focus of insight.recommendedFocus) {
      const timing = focus.durationMin !== undefined ? `${focus.durationMin} min` : focus.timing ?? '';
      lines.push(`  - ${t(locale, '建议方向', 'Recommended focus')}${colon(locale)}${focus.category} ${timing} — ${focus.action}；${focus.rationale}`);
    }
    if (insight.actionIntents.length > 0) {
      lines.push(`  - ${t(locale, 'actions 候选', 'Action candidates')}${colon(locale)}`);
      for (const action of insight.actionIntents) {
        const interaction = action.interaction ? ` interaction=${JSON.stringify(action.interaction)}` : ' interaction=none';
        lines.push(`    - ${action.emoji}${action.title} | ${action.description} | aiPromise=${action.aiPromise} | ${interaction}`);
      }
    }
  }

  return lines.join('\n');
}

function renderHomepage(homepage: HomepageContextPacket, locale: Locale, demoNow?: string): string {
  const c = colon(locale);
  const lines: string[] = [];

  const hasEvents = homepage.recentEvents.length > 0;

  // 内容优先级指引
  if (hasEvents) {
    lines.push(t(
      locale,
      '> 内容优先级：事件详情是主体（≥50%），24h 状态仅作交叉验证（≤30%），趋势数据一句话概括即可',
      '> Content priority: event details are the main subject (≥50%), 24h status is cross-validation only (≤30%), trend data summarized in one sentence',
    ));
  }

  // Recent events（附时间权重标签）
  if (hasEvents) {
    lines.push(t(locale, '## 最近发生的事件（分析主体）', '## Recent Events (Main Analysis Subject)'));
    // 权重指引注释
    if (demoNow) {
      lines.push(t(locale, '> 数据时效权重：距当前时间越近的数据权重越高，请按权重分配篇幅，高权重详述，低权重概括', '> Data freshness weight: data closer to current time has higher weight. Allocate more detail to high-weight data, summarize low-weight data'));
    }
    for (const ev of homepage.recentEvents) {
      if (ev.start && ev.end) {
        // 计算时间权重标签
        const weightLabel = demoNow ? computeWeightLabel(ev.start, demoNow, locale) : '';
        const weightPrefix = weightLabel ? `${weightLabel} ` : '';
        // 持续性影响事件标记（咖啡因/饮酒），模板段落2会据此决定是否提及
        const ongoingTag = isOngoingEffectEvent(ev.type, ev.end, demoNow)
          ? ` ${t(locale, '⚠ 影响持续中', '⚠ Effect ongoing')}`
          : '';
        lines.push(`- ${weightPrefix}[${ev.type}] ${t(locale, '开始', 'start')}${c}${ev.start}, ${t(locale, '持续', 'duration')}${c}${ev.durationMin} min, ${t(locale, '置信度', 'confidence')}${c}${Math.round(ev.confidence * 100)}%${ongoingTag}`);
      } else {
        lines.push(`- [${ev.type}] ${ev.type}`);
      }
    }
  }

  const eventInsightSection = renderHomepageEventInsights(homepage, locale);
  if (eventInsightSection) lines.push(eventInsightSection);

  if (hasEvents) {
    const materialRecoveryMetrics = new Set(
      homepage.eventInsights.flatMap((insight) => insight.recoveryContext.map((ctx) => ctx.metric)),
    );
    const suppressedSleepMetrics = homepage.latest24h.metrics
      .filter((metric) => ['sleep_total', 'sleep_deep', 'sleep_rem'].includes(metric.metric))
      .filter((metric) => !materialRecoveryMetrics.has(metric.metric));

    if (suppressedSleepMetrics.length > 0) {
      lines.push(t(
        locale,
        '## 非显著恢复指标（禁止展开）\n- sleep：当前主事件不需要睡眠背景解释；summary 和 actions 不要提及昨晚睡眠、补觉、提前入睡或今晚睡眠安排',
        '## Non-material Recovery Metrics (Do Not Expand)\n- sleep: current primary event does not require sleep-background explanation; summary and actions must not mention last-night sleep, catching up on sleep, earlier bedtime, or tonight sleep planning',
      ));
    }
  }

  // Latest 24h — 当有事件时压缩为摘要格式，无事件时保持详细
  if (hasEvents) {
    lines.push(t(locale, '## 过去24小时状态（交叉验证背景，不要展开分析）', '## Past 24h Status (Cross-validation Background Only)'));
  } else {
    lines.push(t(locale, '## 过去24小时状态', '## Past 24h Status'));
  }
  lines.push(`- ${t(locale, '日期', 'Date')}${c}${homepage.latest24h.date}`);

  // 筛选出需要注意/异常的指标和有数据的指标
  const notableMetrics = homepage.latest24h.metrics.filter(m => m.status === 'attention' || m.status === 'critical');
  const normalMetrics = homepage.latest24h.metrics.filter(m => m.status === 'normal');
  const missingMetrics = homepage.latest24h.metrics.filter(m => m.status === 'missing');

  if (hasEvents) {
    // 有事件时：只渲染异常指标 + 一句话概括正常指标
    for (const m of notableMetrics) {
      const parts: string[] = [`- ${m.metric}${c}${m.value}${m.unit}`];
      if (m.baseline !== undefined && m.deltaPctVsBaseline !== undefined) {
        const sign = m.deltaPctVsBaseline > 0 ? '+' : '';
        parts.push(`（${t(locale, '相对平时', 'vs usual')} ${sign}${m.deltaPctVsBaseline}%）`);
      }
      if (m.status === 'attention') parts.push(`[${t(locale, '注意', 'attention')}]`);
      if (m.status === 'critical') parts.push(`[${t(locale, '异常', 'critical')}${m.clinicalNote ? `: ${m.clinicalNote}` : ''}]`);
      lines.push(parts.join(''));
    }
    if (normalMetrics.length > 0 && notableMetrics.length === 0) {
      lines.push(`- ${t(locale, '24h 恢复背景', '24h recovery background')}${c}${t(locale, '未见异常指标；仅作为事件解释背景，不展开逐项分析', 'no abnormal metrics; use only as event background, do not expand item by item')}`);
    }
    if (missingMetrics.length > 0) {
      lines.push(`- ${t(locale, '数据缺失', 'Data missing')}${c}${missingMetrics.map(m => m.metric).join(', ')}`);
    }
  } else {
    // 无事件时：保持完整渲染
    for (const m of homepage.latest24h.metrics) {
      if (m.status === 'missing') {
        lines.push(`- ${m.metric}${c}${t(locale, '数据缺失', 'data missing')}`);
      } else {
        const parts: string[] = [`- ${m.metric}${c}${m.value}${m.unit}`];
        if (m.baseline !== undefined && m.deltaPctVsBaseline !== undefined) {
          const sign = m.deltaPctVsBaseline > 0 ? '+' : '';
          parts.push(`（${t(locale, '相对平时', 'vs usual')} ${sign}${m.deltaPctVsBaseline}%）`);
        }
        if (m.status === 'attention') parts.push(`[${t(locale, '注意', 'attention')}]`);
        if (m.status === 'critical') parts.push(`[${t(locale, '异常', 'critical')}${m.clinicalNote ? `: ${m.clinicalNote}` : ''}]`);
        lines.push(parts.join(''));
      }
    }
  }

  // Trend 7d — 当有事件时仅渲染异常趋势
  const eventTrendEvidence = homepage.trend7d.filter((tr) => tr.anomalyPoints.length > 0);
  if (homepage.trend7d.length > 0) {
    if (hasEvents) {
      if (eventTrendEvidence.length > 0) {
        lines.push(t(locale, '## 过去一周趋势（仅异常补充）', '## Past Week Trends (Anomalies Only)'));
        for (const tr of eventTrendEvidence) {
          lines.push(renderMetricSummaryCompact(tr, '- ', locale));
        }
      }
    } else {
      lines.push(t(locale, '## 过去一周趋势', '## Past Week Trends'));
      for (const tr of homepage.trend7d) {
        lines.push(renderMetricSummary(tr, '- ', {}, locale));
      }
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
  _options: { interpretationOnly?: boolean } = {},
  locale: Locale = 'zh',
): string {
  void _options;
  const parts: string[] = [];
  parts.push(`${prefix}${ms.metric}:`);
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
// 精简版 MetricSummary 渲染（有事件时使用，只保留趋势方向）
// ────────────────────────────────────────────

function renderMetricSummaryCompact(
  ms: MetricSummary,
  prefix: string = '',
  locale: Locale = 'zh',
): string {
  const parts: string[] = [];
  parts.push(`${prefix}${ms.metric}:`);
  if (ms.latest) parts.push(`${ms.latest.value}${ms.latest.unit}`);
  parts.push(`${t(locale, '趋势', 'trend')} ${ms.trendDirection}`);
  return parts.join(' ');
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

// ────────────────────────────────────────────
// 辅助：时间权重标签
// ────────────────────────────────────────────

/** 判断事件是否为持续性影响事件（咖啡因/饮酒）且仍在影响期内 */
function isOngoingEffectEvent(eventType: string, eventEnd: string, demoNow?: string): boolean {
  if (!demoNow) return false;
  const ongoingTypes = ['possible_caffeine_intake', 'possible_alcohol_intake'];
  if (!ongoingTypes.includes(eventType)) return false;

  // 咖啡因半衰期约5-6小时，饮酒影响持续数小时，使用12小时作为保守阈值
  const normalizedEnd = eventEnd.length <= 16 ? `${eventEnd}:00` : eventEnd;
  const endMs = new Date(normalizedEnd).getTime();
  const nowMs = new Date(`${demoNow}:00`).getTime();
  const diffHours = (nowMs - endMs) / 3600000;

  return diffHours >= 0 && diffHours <= 12;
}

/** 计算事件距当前时间的时间差并返回权重标签 */
function computeWeightLabel(eventStart: string, demoNow: string, locale: Locale): string {
  // 兼容 YYYY-MM-DDTHH:mm 和完整 ISO 格式
  const normalizedStart = eventStart.length <= 16 ? `${eventStart}:00` : eventStart;
  const eventMs = new Date(normalizedStart).getTime();
  const nowMs = new Date(`${demoNow}:00`).getTime();
  const diffMin = Math.round((nowMs - eventMs) / 60000);

  if (diffMin < 0) {
    // 未来事件（不应出现但做保护）
    return `[${t(locale, '权重:高', 'weight:high')}]`;
  }

  // 格式化时间差
  const diffLabel = diffMin < 60
    ? `${diffMin} min ago`
    : `${Math.floor(diffMin / 60)}h${diffMin % 60 > 0 ? `${diffMin % 60}m` : ''} ago`;

  if (diffMin <= 30) {
    return `[${t(locale, '权重:高', 'weight:high')}|${diffLabel}]`;
  }
  if (diffMin <= 120) {
    return `[${t(locale, '权重:中', 'weight:medium')}|${diffLabel}]`;
  }
  return `[${t(locale, '权重:低', 'weight:low')}|${diffLabel}]`;
}
