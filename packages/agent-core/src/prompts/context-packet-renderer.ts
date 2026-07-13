import type {
  TaskPacket,
  UserContextPacket,
  DataWindowPacket,
  MissingDataItem,
} from '../context/context-packet';
import type {
  CustomerFacingEvidencePacket,
  PublicFact,
  PublicNumericFact,
  PublicHomepageEventInsight,
  PublicEventWindowMetric,
  PublicEventPhysiologySummary,
  PublicHomepageContextPacket,
  PublicViewSummaryContextPacket,
  PublicAdvisorChatContextPacket,
  PublicMetricSummary,
  PublicVisibleChartPacket,
  PublicMetricValue,
} from '../context/customer-facing-evidence';
import type { EventCertaintyBand } from '../context/context-packet';
import type { RecentRecommendedAction } from '../types/memory';
import { ACTION_SEMANTIC_GROUPS } from '../context/homepage-event-insights';
import { ChartTokenId, type DataTab, type Locale } from '@health-advisor/shared';

// ────────────────────────────────────────────
// 双语标签辅助函数
// ────────────────────────────────────────────

/**
 * EventCertaintyBand 对应的客户可见措辞指引（中英双语）。
 *
 * renderer 将此作为 LLM 措辞契约输出，禁止 LLM 跨档位使用确定性词汇：
 * - possible：可能/似乎/may have/may be consistent with
 * - likely：大概率/很可能/likely/strongly consistent with
 * - reported：你记录了/你完成了/you logged/you completed
 */
const CERTAINTY_BAND_WORDING: Record<EventCertaintyBand, { zh: string; en: string }> = {
  possible: {
    zh: '可能、似乎、数据有些像（禁止确定性断言）',
    en: 'may have, may be consistent with (no deterministic assertions)',
  },
  likely: {
    zh: '大概率、很像、数据显示很可能（仍禁止"刚吃完/完成/确认"等断言）',
    en: 'likely, strongly consistent with (still no "finished/confirmed" assertions)',
  },
  reported: {
    zh: '你记录了、你刚完成了（允许确定性表达）',
    en: 'you logged, you completed (deterministic phrasing allowed)',
  },
};

/** 根据档位和 locale 返回对应的措辞指引文案 */
function certaintyWording(band: EventCertaintyBand, locale: Locale): string {
  return CERTAINTY_BAND_WORDING[band][locale];
}

function t(locale: Locale, zh: string, en: string): string {
  return locale === 'zh' ? zh : en;
}

// 中文用全角冒号，英文用半角冒号加空格
function colon(locale: Locale): string {
  return locale === 'zh' ? '：' : ': ';
}

// ────────────────────────────────────────────
// 主入口 — 接收 CustomerFacingEvidencePacket
// ────────────────────────────────────────────

/**
 * 渲染客户可见上下文为 LLM prompt 片段。
 *
 * 输入必须是 CustomerFacingEvidencePacket（已投影）。
 * 内部 TaskContextPacket 不可直接传入；调用方需先调用 buildCustomerFacingEvidencePacket。
 */
export function renderTaskContextPacket(
  packet: CustomerFacingEvidencePacket,
  locale: Locale = 'zh',
  demoNow?: string,
): string {
  const sections: string[] = [];

  // 检测首页是否有最近事件，用于控制上下文数据的详细程度
  const hasHomepageEvents = (packet.homepage?.eventInsights?.length ?? 0) > 0;

  sections.push(renderTaskPacket(packet.task, locale));

  // 注入当前模拟时间（让 LLM 感知 demo timeline 的"现在"）
  if (demoNow) {
    sections.push(
      `## ${t(locale, '当前时间', 'Current Time')}\n- ${t(locale, '当前模拟时间', 'Current simulated time')}${colon(locale)}${demoNow}`,
    );
  }

  sections.push(renderUserContext(packet.userContext, locale, hasHomepageEvents));
  sections.push(renderDataWindow(packet.dataWindow, locale));
  sections.push(renderMissingData(packet.missingData, locale));
  sections.push(renderVisibleCharts(packet.visibleCharts, locale, hasHomepageEvents));
  sections.push(renderPublicFacts(packet.facts));

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
  if (task.timeframe)
    lines.push(`- ${t(locale, '时间粒度', 'Time granularity')}${c}${task.timeframe}`);
  if (task.dateRange)
    lines.push(
      `- ${t(locale, '日期范围', 'Date range')}${c}${task.dateRange.start} ~ ${task.dateRange.end}`,
    );
  if (task.userMessage)
    lines.push(`- ${t(locale, '用户消息', 'User message')}${c}${task.userMessage}`);
  if (task.smartPromptId) lines.push(`- Smart Prompt${c}${task.smartPromptId}`);
  return lines.join('\n');
}

// ────────────────────────────────────────────
// User Context
// ────────────────────────────────────────────

function renderUserContext(
  user: UserContextPacket,
  locale: Locale,
  hasHomepageEvents: boolean = false,
): string {
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
    lines.push(
      t(
        locale,
        '## 个人参考水平（仅供交叉验证，禁止在 summary 中展开）',
        '## Personal Reference Levels (cross-validation only, do not expand in summary)',
      ),
    );
    const bl = user.baselines;
    lines.push(
      t(
        locale,
        `静息心率 ${bl.restingHR}bpm, HRV ${bl.hrv}ms, SpO2 ${bl.spo2}%, 睡眠 ${bl.avgSleepMinutes}min, 步数 ${bl.avgSteps}`,
        `resting HR ${bl.restingHR}bpm, HRV ${bl.hrv}ms, SpO2 ${bl.spo2}%, sleep ${bl.avgSleepMinutes}min, steps ${bl.avgSteps}`,
      ),
    );
  } else {
    lines.push(
      t(
        locale,
        '## 个人参考水平（内部分析用，不要原样写给用户）',
        '## Personal Reference Levels (internal only)',
      ),
    );
    lines.push(
      `- ${t(locale, '静息心率通常水平', 'Resting HR usual level')}${c}${user.baselines.restingHR} bpm`,
    );
    lines.push(`- ${t(locale, 'HRV 通常水平', 'HRV usual level')}${c}${user.baselines.hrv} ms`);
    lines.push(
      `- ${t(locale, 'SpO2 参考水平', 'SpO2 reference level')}${c}${user.baselines.spo2}%`,
    );
    lines.push(
      `- ${t(locale, '平均睡眠', 'Average sleep')}${c}${user.baselines.avgSleepMinutes} min`,
    );
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
    return t(
      locale,
      '## 数据质量\n\n当前数据窗口内各指标数据完整。',
      '## Data Quality\n\nAll metrics within the current data window are complete.',
    );
  }

  const c = colon(locale);
  const lines = [t(locale, '## 数据质量约束', '## Data Quality Constraints')];
  for (const item of items) {
    lines.push(
      `- ${item.metric} ${t(locale, '在', 'in')} ${item.scope} ${t(locale, '缺失', 'missing')} ${item.missingCount}/${item.totalCount}`,
    );
    if (item.lastAvailableDate) {
      lines.push(
        `  - ${t(locale, '最近可用日期', 'Last available date')}${c}${item.lastAvailableDate}`,
      );
    }
    lines.push(`  - ${t(locale, '影响', 'Impact')}${c}${item.impact}`);
    if (item.requiredDisclosure) {
      lines.push(
        `  - ${t(locale, '披露要求', 'Required disclosure')}${c}${item.requiredDisclosure}`,
      );
    }
  }
  return lines.join('\n');
}

// ────────────────────────────────────────────
// Visible Charts
// ────────────────────────────────────────────

function renderVisibleCharts(
  charts: PublicVisibleChartPacket[],
  locale: Locale,
  hasHomepageEvents: boolean = false,
): string {
  if (charts.length === 0) return '';

  const lines = [t(locale, '## 可见图表', '## Visible Charts')];

  if (hasHomepageEvents) {
    // 有事件时：压缩为单行摘要，降低图表数据的视觉权重
    for (const chart of charts) {
      const latest = chart.dataSummary.latest;
      const valStr = latest ? `${latest.value}${latest.unit}` : 'N/A';
      lines.push(
        `- ${chart.chartToken}: ${valStr}, ${t(locale, '趋势', 'trend')} ${chart.dataSummary.trendDirection}`,
      );
    }
  } else {
    for (const chart of charts) {
      lines.push(`- ${chart.chartToken} (${chart.metric}, ${chart.timeframe})`);
      lines.push(renderPublicMetricSummary(chart.dataSummary, '  ', locale));
    }
  }

  return lines.join('\n');
}

// ────────────────────────────────────────────
// Public Facts（取代原 Evidence Facts）
// ────────────────────────────────────────────

function renderPublicFacts(facts: PublicFact[]): string {
  if (facts.length === 0) return '';

  const lines = ['## Evidence Facts'];
  for (const fact of facts) {
    if (fact.kind === 'numeric') {
      lines.push(
        `- ${fact.evidenceId}: ${fact.metric}=${fact.value}${fact.unit} — ${fact.interpretation}`,
      );
    } else {
      lines.push(
        `- ${fact.evidenceId}: ${fact.metric}=${fact.qualifier} — ${fact.interpretation}`,
      );
    }
  }
  return lines.join('\n');
}

// ────────────────────────────────────────────
// Homepage
// ────────────────────────────────────────────

function renderDisplayableHomepageEvent(
  homepage: PublicHomepageContextPacket,
  locale: Locale,
): string {
  const current = homepage.eventInsights?.find(
    (insight) => insight.mentionPolicy?.summary === 'allowed',
  );
  if (!current) return '';

  const lines = [t(locale, '## 当前可提及事件', '## Current Mentionable Event')];
  lines.push(
    t(
      locale,
      'summary 和 actions 只能明确提及本区块事件。内部分析上下文只能用于推理，不能直接写给用户。',
      'Summary and actions may explicitly mention only this event. Internal analysis context is reasoning-only.',
    ),
  );
  lines.push(`- [${current.priority}] ${current.eventType}, ${current.timeRelation}`);
  // Task 3.1：不再渲染 rawEventType（已在投影中移除）
  // Task 2.1：确定性档位 — 替代 raw confidence 参与文案生成
  // 禁止显示 confidence 百分比；renderer 只输出语义化档位与措辞指引
  lines.push(
    `  - ${t(locale, '确定性档位', 'Certainty band')}${colon(locale)}${current.certaintyBand}`,
  );
  lines.push(
    `    - ${t(locale, '措辞契约', 'Wording contract')}${colon(locale)}${certaintyWording(current.certaintyBand, locale)}`,
  );
  if (current.certaintyBand !== 'reported') {
    // sensor_inference（possible/likely）追加硬约束：禁止确定性断言、禁止百分比
    lines.push(
      `    - ${t(
        locale,
        '禁止使用"刚吃完/完成/确认"等断言；禁止显示概率百分比',
        'Do NOT use "finished/completed/confirmed" assertions; do NOT display probability percentage',
      )}`,
    );
  }
  lines.push(`  - ${t(locale, '事件摘要', 'Event summary')}${colon(locale)}${current.headline}`);
  if (current.eventWindow) {
    lines.push(
      `  - ${t(locale, '事件窗口', 'Event window')}${colon(locale)}${current.eventWindow.start} ~ ${current.eventWindow.end}, ${t(locale, '样本数', 'samples')}${colon(locale)}${current.eventWindow.sampleCount}, ${t(locale, '覆盖度', 'coverage')}${colon(locale)}${current.eventWindow.coverage}`,
    );
    for (const metric of current.eventWindow.metrics) {
      lines.push(renderPublicEventWindowMetric(metric, locale));
    }
  }
  lines.push(
    `  - ${t(locale, '当前张力', 'Body tension')}${colon(locale)}${current.tension.level}: ${current.tension.summary}`,
  );
  for (const item of current.physiology) {
    lines.push(renderPublicPhysiology(item, locale));
  }
  for (const item of current.recoveryContext) {
    lines.push(
      `  - ${t(locale, '恢复背景', 'Recovery context')}${colon(locale)}${item.relation} ${item.metric} — ${item.summary}`,
    );
  }
  for (const focus of current.recommendedFocus) {
    const timing =
      focus.durationMin !== undefined ? `${focus.durationMin} min` : (focus.timing ?? '');
    lines.push(
      `  - ${t(locale, '建议方向', 'Recommended focus')}${colon(locale)}${focus.category} ${timing} — ${focus.action}；${focus.rationale}`,
    );
  }
  if (current.actionIntents.length > 0) {
    lines.push(`  - ${t(locale, 'actions 候选', 'Action candidates')}${colon(locale)}`);
    for (const action of current.actionIntents) {
      const interaction = action.interaction
        ? ` interaction=${JSON.stringify(action.interaction)}`
        : ' interaction=none';
      lines.push(
        `    - ${action.emoji}${action.title} | ${action.description} | aiPromise=${action.aiPromise} | ${interaction}`,
      );
    }
  }
  return lines.join('\n');
}

/** 渲染公开事件窗口指标 — score 类指标无数值 */
function renderPublicEventWindowMetric(metric: PublicEventWindowMetric, locale: Locale): string {
  const c = colon(locale);
  // 物理单位指标：保留代表性数值（max/latest/average）
  if (metric.unit && metric.value !== undefined) {
    const roleLabel = valueRoleLabel(metric.valueRole, locale);
    // 事件窗口指标：heart_rate elevated — 峰值：172bpm — interpretation
    return `  - ${t(locale, '事件窗口指标', 'Event-window metric')}${c}${metric.metric} ${metric.qualifier}, ${roleLabel}${metric.value}${metric.unit} — ${metric.interpretation}`;
  }
  // score 类指标：仅展示 qualifier
  return `  - ${t(locale, '事件窗口指标', 'Event-window metric')}${c}${metric.metric} ${metric.qualifier} — ${metric.interpretation}`;
}

/** 根据 valueRole 生成对应语言的数值角色标签（含分隔符） */
function valueRoleLabel(
  valueRole: 'max' | 'latest' | 'average' | undefined,
  locale: Locale,
): string {
  // undefined 默认按 max 处理（向后兼容历史数据）
  switch (valueRole) {
    case 'latest':
      return t(locale, '最新：', 'latest: ');
    case 'average':
      return t(locale, '平均：', 'average: ');
    case 'max':
    case undefined:
    default:
      return t(locale, '峰值：', 'max: ');
  }
}

/** 渲染公开生理特征 — score 类指标无数值 */
function renderPublicPhysiology(item: PublicEventPhysiologySummary, locale: Locale): string {
  const c = colon(locale);
  // 物理单位 + value 保留
  if (item.unit && item.value !== undefined) {
    return `  - ${t(locale, '生理特征', 'Physiology')}${c}${item.metric} ${item.qualifier} ${item.value}${item.unit} — ${item.interpretation}`;
  }
  // score 类或无 value：仅展示 qualifier
  return `  - ${t(locale, '生理特征', 'Physiology')}${c}${item.metric} ${item.qualifier} — ${item.interpretation}`;
}

function renderInternalHomepageAnalysisContext(
  homepage: PublicHomepageContextPacket,
  locale: Locale,
): string {
  const current = homepage.eventInsights?.find(
    (insight) => insight.mentionPolicy?.summary === 'allowed',
  );
  const transition = current?.transitionContext;
  if (!transition || transition.relation === 'neutral') return '';

  const lines = [
    t(
      locale,
      '## 内部分析上下文（禁止显式提及）',
      '## Internal Analysis Context (Do Not Mention Explicitly)',
    ),
  ];
  lines.push(
    t(
      locale,
      '本区块只能用于推理当前事件的影响。summary 和 actions 禁止直接提及 forbiddenMentions 或前一事件动作链路。',
      'Use this only to reason about the current event. Summary and actions must not mention forbiddenMentions or prior event chains.',
    ),
  );
  // Task 3.1：投影后不再渲染 priorEventId / priorEventType / internalFinding（内部 IDs 已移除）
  lines.push(`- relation: ${transition.relation}`);
  lines.push(`- allowedUserFacingAngle: ${transition.allowedUserFacingAngle}`);
  if (transition.forbiddenMentions.length > 0) {
    lines.push(`- forbiddenMentions: ${transition.forbiddenMentions.join(', ')}`);
  }
  if (transition.actionSuppressions.length > 0) {
    lines.push('- actionSuppressions:');
    for (const suppression of transition.actionSuppressions) {
      lines.push(
        `  - category=${suppression.category ?? 'none'}, interactionMicroEventType=${suppression.interactionMicroEventType ?? 'none'}, textPattern=${suppression.textPattern ?? 'none'}, reason=${suppression.reason}`,
      );
    }
  }
  return lines.join('\n');
}

function renderPreviousActions(actions: RecentRecommendedAction[], locale: Locale): string {
  const lines: string[] = [];
  lines.push(
    t(locale, '## 近期已推荐行动（禁止重复）', '## Recently Recommended Actions (Do Not Repeat)'),
  );
  lines.push(
    t(
      locale,
      '以下行动类型近期已推荐过，本轮 summary 和 actions 中不得出现相同或语义相近的建议：',
      "The following action types were recently recommended. This round's summary and actions must not repeat or approximate them:",
    ),
  );

  // 按语义组聚合渲染
  const groups = new Map<string, string[]>();
  for (const action of actions) {
    const group = ACTION_SEMANTIC_GROUPS[action.category] ?? action.category;
    const list = groups.get(group) ?? [];
    list.push(`${action.title}（${action.category}）`);
    groups.set(group, list);
  }

  for (const [group, items] of groups) {
    lines.push(`- ${t(locale, '语义组', 'Group')}: ${group} — ${items.join('、')}`);
  }

  return lines.join('\n');
}

/**
 * 渲染"今日已发生活动"区段（独立用途通道）。
 *
 * 关键约束：本区段仅供 futureSuggestions 推断当天剩余时间的预测，
 * 禁止用于 summary 或 actions。区段标题与首行说明都必须显式标注该约束。
 */
function renderTodayOccurredActivities(
  homepage: PublicHomepageContextPacket,
  locale: Locale,
): string {
  const activities = homepage.todayOccurredActivities;
  if (!activities || activities.length === 0) return '';

  const lines: string[] = [];
  lines.push(
    t(
      locale,
      '## 今日已发生活动（仅供 futureSuggestions 推断，禁止用于 summary 或 actions）',
      "## Today's Occurred Activities (futureSuggestions reasoning only, do not use in summary or actions)",
    ),
  );
  lines.push(
    t(
      locale,
      '本区块只用于推断今天剩余时间的 futureSuggestions。summary 和 actions 仍以"当前可提及事件"为准，不得提及本区块的活动。',
      'Use this section only to reason about futureSuggestions for the rest of today. Summary and actions must still center on the Current Mentionable Event and must not mention activities listed here.',
    ),
  );

  for (const act of activities) {
    const startHm = toHHmm(act.start);
    const endHm = toHHmm(act.end);
    const durationLabel =
      act.durationMin >= 60 ? `${(act.durationMin / 60).toFixed(1)}h` : `${act.durationMin}min`;
    lines.push(`- ${startHm}–${endHm} ${act.type} (${durationLabel})`);
  }

  return lines.join('\n');
}

/** 将 ISO 时间转为 HH:mm 展示（字符串解析，避免时区漂移） */
function toHHmm(iso: string): string {
  // iso 格式：YYYY-MM-DDTHH:mm（RecognizedEvent.start/end 标准格式）
  return iso.length >= 16 ? iso.slice(11, 16) : '??:??';
}

function renderHomepage(homepage: PublicHomepageContextPacket, locale: Locale): string {
  const c = colon(locale);
  const lines: string[] = [];

  const hasEvents = homepage.eventInsights.length > 0;

  // 内容优先级指引
  if (hasEvents) {
    lines.push(
      t(
        locale,
        '> 内容优先级：当前可提及事件是主体（≥70%），内部分析上下文只能影响推理，24h 状态仅作交叉验证（≤15%）',
        '> Content priority: current mentionable event is the main subject (≥70%); internal analysis context is reasoning-only; 24h status is cross-validation only (≤15%)',
      ),
    );
  }

  const displayableEventSection = renderDisplayableHomepageEvent(homepage, locale);
  if (displayableEventSection) lines.push(displayableEventSection);

  const internalAnalysisSection = renderInternalHomepageAnalysisContext(homepage, locale);
  if (internalAnalysisSection) lines.push(internalAnalysisSection);

  // 近期已推荐行动区块
  if (homepage.previousRecommendedActions && homepage.previousRecommendedActions.length > 0) {
    lines.push(renderPreviousActions(homepage.previousRecommendedActions, locale));
  }

  // 今日已发生活动（独立通道：仅供 futureSuggestions 推断）
  const occurredSection = renderTodayOccurredActivities(homepage, locale);
  if (occurredSection) lines.push(occurredSection);

  if (hasEvents) {
    const materialRecoveryMetrics = new Set(
      homepage.eventInsights.flatMap((insight) =>
        insight.recoveryContext.map((ctx) => ctx.metric),
      ),
    );
    const suppressedSleepMetrics = homepage.latest24h.metrics
      .filter((metric) => ['sleep_total', 'sleep_deep', 'sleep_rem'].includes(metric.metric))
      .filter((metric) => !materialRecoveryMetrics.has(metric.metric));

    if (suppressedSleepMetrics.length > 0) {
      lines.push(
        t(
          locale,
          '## 非显著恢复指标（禁止展开）\n- sleep：当前主事件不需要睡眠背景解释；summary 和 actions 不要提及昨晚睡眠、补觉、提前入睡或今晚睡眠安排',
          '## Non-material Recovery Metrics (Do Not Expand)\n- sleep: current primary event does not require sleep-background explanation; summary and actions must not mention last-night sleep, catching up on sleep, earlier bedtime, or tonight sleep planning',
        ),
      );
    }
  }

  // Latest 24h — 当有事件时压缩为摘要格式，无事件时保持详细
  if (hasEvents) {
    lines.push(
      t(
        locale,
        '## 过去24小时状态（交叉验证背景，不要展开分析）',
        '## Past 24h Status (Cross-validation Background Only)',
      ),
    );
  } else {
    lines.push(t(locale, '## 过去24小时状态', '## Past 24h Status'));
  }
  lines.push(`- ${t(locale, '日期', 'Date')}${c}${homepage.latest24h.date}`);

  // 筛选出需要注意/异常的指标和有数据的指标
  const notableMetrics = homepage.latest24h.metrics.filter(
    (m) => m.status === 'attention' || m.status === 'critical',
  );
  const normalMetrics = homepage.latest24h.metrics.filter((m) => m.status === 'normal');
  const missingMetrics = homepage.latest24h.metrics.filter((m) => m.status === 'missing');

  if (hasEvents) {
    // 有事件时：只渲染异常指标 + 一句话概括正常指标
    for (const m of notableMetrics) {
      const parts: string[] = [`- ${m.metric}${c}${m.value}${m.unit}`];
      if (m.baseline !== undefined && m.deltaPctVsBaseline !== undefined) {
        const sign = m.deltaPctVsBaseline > 0 ? '+' : '';
        parts.push(`（${t(locale, '相对平时', 'vs usual')} ${sign}${m.deltaPctVsBaseline}%）`);
      }
      if (m.status === 'attention') parts.push(`[${t(locale, '注意', 'attention')}]`);
      if (m.status === 'critical')
        parts.push(
          `[${t(locale, '异常', 'critical')}${m.clinicalNote ? `: ${m.clinicalNote}` : ''}]`,
        );
      lines.push(parts.join(''));
    }
    if (normalMetrics.length > 0 && notableMetrics.length === 0) {
      lines.push(
        `- ${t(locale, '24h 恢复背景', '24h recovery background')}${c}${t(locale, '未见异常指标；仅作为事件解释背景，不展开逐项分析', 'no abnormal metrics; use only as event background, do not expand item by item')}`,
      );
    }
    if (missingMetrics.length > 0) {
      lines.push(
        `- ${t(locale, '数据缺失', 'Data missing')}${c}${missingMetrics.map((m) => m.metric).join(', ')}`,
      );
    }
  } else {
    // 无事件时：保持完整渲染
    for (const m of homepage.latest24h.metrics) {
      if (m.status === 'missing') {
        lines.push(`- ${m.metric}${c}${t(locale, '数据缺失', 'data missing')}`);
      } else if (m.value === undefined) {
        // Task 3.1：score 类指标投影后无数值，仅渲染 status
        const statusLabel = m.status === 'normal' ? t(locale, '正常', 'normal') : m.status;
        lines.push(`- ${m.metric}${c}${statusLabel}`);
      } else {
        const parts: string[] = [`- ${m.metric}${c}${m.value}${m.unit}`];
        if (m.baseline !== undefined && m.deltaPctVsBaseline !== undefined) {
          const sign = m.deltaPctVsBaseline > 0 ? '+' : '';
          parts.push(`（${t(locale, '相对平时', 'vs usual')} ${sign}${m.deltaPctVsBaseline}%）`);
        }
        if (m.status === 'attention') parts.push(`[${t(locale, '注意', 'attention')}]`);
        if (m.status === 'critical')
          parts.push(
            `[${t(locale, '异常', 'critical')}${m.clinicalNote ? `: ${m.clinicalNote}` : ''}]`,
          );
        lines.push(parts.join(''));
      }
    }
  }

  // Trend 7d — 当有事件时仅渲染异常趋势
  const eventTrendEvidence = homepage.trend7d.filter(
    (tr) => tr.anomalyPoints.length > 0,
  );
  if (homepage.trend7d.length > 0) {
    if (hasEvents) {
      if (eventTrendEvidence.length > 0) {
        lines.push(
          t(locale, '## 过去一周趋势（仅异常补充）', '## Past Week Trends (Anomalies Only)'),
        );
        for (const tr of eventTrendEvidence) {
          lines.push(renderPublicMetricSummaryCompact(tr, '- ', locale));
        }
      }
    } else {
      lines.push(t(locale, '## 过去一周趋势', '## Past Week Trends'));
      for (const tr of homepage.trend7d) {
        lines.push(renderPublicMetricSummary(tr, '- ', locale));
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
    lines.push(
      `${t(locale, '可引用的图表 token', 'Available chart tokens')}${c}${homepage.suggestedChartTokens.join(', ')}`,
    );
  }

  return lines.join('\n');
}

// ────────────────────────────────────────────
// View Summary
// ────────────────────────────────────────────

function renderViewSummary(vs: PublicViewSummaryContextPacket, locale: Locale): string {
  const c = colon(locale);
  const lines: string[] = [];

  lines.push(t(locale, '## 视图上下文', '## View Context'));
  lines.push(`- ${t(locale, '当前标签页', 'Current tab')}${c}${vs.tab}`);
  lines.push(`- ${t(locale, '时间粒度', 'Time granularity')}${c}${vs.timeframe}`);

  if (vs.selectedMetric) {
    lines.push('');
    lines.push(t(locale, '## 选中指标详情', '## Selected Metric Details'));
    lines.push(`- chartToken${c}${getChartTokenForTab(vs.tab) ?? 'N/A'}`);
    lines.push(renderPublicMetricSummary(vs.selectedMetric, '- ', locale));
  }

  if (vs.overviewMetrics && vs.overviewMetrics.length > 0) {
    lines.push('');
    lines.push(t(locale, '## 核心指标概览', '## Key Metrics Overview'));
    for (const m of vs.overviewMetrics) {
      lines.push(renderPublicMetricSummary(m, '- ', locale));
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
    lines.push(
      `${t(locale, '可引用的图表 token', 'Available chart tokens')}${c}${vs.suggestedChartTokens.join(', ')}`,
    );
  }

  return lines.join('\n');
}

// ────────────────────────────────────────────
// Advisor Chat
// ────────────────────────────────────────────

function renderAdvisorChat(chat: PublicAdvisorChatContextPacket, locale: Locale): string {
  const c = colon(locale);
  const lines: string[] = [];

  lines.push(t(locale, '## 用户问题', '## User Question'));
  lines.push(chat.userMessage);

  lines.push('');
  lines.push(t(locale, '## 问题意图', '## Question Intent'));
  lines.push(
    `- ${t(locale, '关注指标', 'Focus metrics')}${c}${chat.questionIntent.metricFocus.join(', ') || t(locale, '未聚焦特定指标', 'No specific metric focus')}`,
  );
  lines.push(`- ${t(locale, '时间范围', 'Time scope')}${c}${chat.questionIntent.timeScope}`);
  lines.push(`- ${t(locale, '意图类型', 'Intent type')}${c}${chat.questionIntent.actionIntent}`);
  lines.push(`- ${t(locale, '风险等级', 'Risk level')}${c}${chat.questionIntent.riskLevel}`);

  lines.push('');
  lines.push(t(locale, '## 当前页面', '## Current Page'));
  lines.push(`- ${t(locale, '页面', 'Page')}${c}${chat.currentPage.page}`);
  if (chat.currentPage.tab) lines.push(`- ${t(locale, '标签', 'Tab')}${c}${chat.currentPage.tab}`);
  if (chat.currentPage.timeframe)
    lines.push(`- ${t(locale, '时间粒度', 'Time granularity')}${c}${chat.currentPage.timeframe}`);
  if (chat.currentPage.visibleChartTokens.length > 0) {
    lines.push(
      `- ${t(locale, '可见图表', 'Visible charts')}${c}${chat.currentPage.visibleChartTokens.join(', ')}`,
    );
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
      const role = msg.role === 'user' ? t(locale, '用户', 'User') : t(locale, '助手', 'Assistant');
      lines.push(`- ${role}${c}${msg.text}`);
    }
  }

  lines.push('');
  lines.push(t(locale, '## 回答约束', '## Response Constraints'));
  for (const con of chat.constraints) {
    lines.push(`- ${con.description}`);
  }

  return lines.join('\n');
}

// ────────────────────────────────────────────
// PublicMetricSummary 渲染（公共辅助）
// ────────────────────────────────────────────

function formatPublicMetricValue(v: PublicMetricValue): string {
  return `${v.value}${v.unit}${v.date ? ` on ${v.date}` : ''}`;
}

function renderPublicMetricSummary(
  ms: PublicMetricSummary,
  prefix: string = '',
  locale: Locale = 'zh',
): string {
  const parts: string[] = [];
  parts.push(`${prefix}${ms.metric}:`);
  if (ms.latest) parts.push(`latest ${formatPublicMetricValue(ms.latest)}`);
  if (ms.average) parts.push(`avg ${ms.average.value}${ms.average.unit}`);
  parts.push(`trend ${ms.trendDirection}`);
  if (ms.anomalyPoints.length > 0) {
    parts.push(`anomalies: ${ms.anomalyPoints.map((a) => a.date).join(', ')}`);
  }
  parts.push(
    `completeness ${ms.missing.completenessPct}% (${ms.missing.totalCount - ms.missing.missingCount}/${ms.missing.totalCount})`,
  );
  return parts.join(', ');
}

// ────────────────────────────────────────────
// 精简版 PublicMetricSummary 渲染（有事件时使用）
// ────────────────────────────────────────────

function renderPublicMetricSummaryCompact(
  ms: PublicMetricSummary,
  prefix: string = '',
  locale: Locale = 'zh',
): string {
  void locale;
  const parts: string[] = [];
  parts.push(`${prefix}${ms.metric}:`);
  if (ms.latest) parts.push(`${ms.latest.value}${ms.latest.unit}`);
  parts.push(`trend ${ms.trendDirection}`);
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
