import type { AgentContext } from '../types/agent-context';
import type { PromptLoader } from './prompt-loader';
import type { MissingDataItem } from '../context/context-packet';
import type { Locale } from '@health-advisor/shared';
import { AgentTaskType } from '@health-advisor/shared';

// 双语标签映射
function t(locale: Locale, zh: string, en: string): string {
  return locale === 'zh' ? zh : en;
}

export function buildSystemPrompt(
  context: AgentContext,
  loader: PromptLoader,
  missingData?: MissingDataItem[],
): string {
  const locale = context.locale;
  const baseTemplate = loader.load('system');

  const sections: string[] = [baseTemplate];

  // 用户信息
  sections.push('');
  sections.push(t(locale, '## 用户信息', '## User Info'));
  sections.push(`- ${t(locale, '姓名：', 'Name: ')}${context.profile.name}`);
  sections.push(`- ${t(locale, '年龄：', 'Age: ')}${context.profile.age}`);
  if (context.profile.tags.length > 0) {
    const separator = locale === 'zh' ? '、' : ', ';
    sections.push(`- ${t(locale, '标签：', 'Tags: ')}${context.profile.tags.join(separator)}`);
  }

  // 个人参考水平
  sections.push('');
  sections.push(t(
    locale,
    '## 个人参考水平（内部分析用，不要原样写给用户）',
    '## Personal Reference Levels (internal only)',
  ));
  if (context.task.type === AgentTaskType.HOMEPAGE_SUMMARY) {
    sections.push(t(locale,
      '- 静息心率通常水平：仅用于内部状态判定，首页简报禁止输出具体数值或相对关系',
      '- Resting heart rate usual level: for internal status assessment only; homepage briefing must not output specific values or relative relationships',
    ));
    sections.push(t(locale,
      '- HRV 通常水平：仅用于内部恢复解读，首页简报禁止输出具体数值或相对关系',
      '- HRV usual level: for internal recovery interpretation only; homepage briefing must not output specific values or relative relationships',
    ));
    sections.push(t(locale,
      '- SpO2 参考水平：仅用于内部风险判断，首页简报禁止输出具体数值或相对关系',
      '- SpO2 reference level: for internal risk assessment only; homepage briefing must not output specific values or relative relationships',
    ));
  } else {
    sections.push(`- ${t(locale, '静息心率通常水平', 'Resting HR usual level')}: ${context.profile.baselines.restingHR} bpm`);
    sections.push(`- ${t(locale, 'HRV 通常水平', 'HRV usual level')}: ${context.profile.baselines.hrv} ms`);
    sections.push(`- ${t(locale, 'SpO2 参考水平', 'SpO2 reference level')}: ${context.profile.baselines.spo2}%`);
  }
  sections.push(`- ${t(locale, '平均睡眠', 'Average sleep')}: ${context.profile.baselines.avgSleepMinutes} ${t(locale, '分钟', 'minutes')}`);
  sections.push(`- ${t(locale, '平均步数', 'Average steps')}: ${context.profile.baselines.avgSteps} ${t(locale, '步', 'steps')}`);

  // 数据质量约束（优先使用结构化 missingData）
  sections.push('');
  sections.push(t(locale, '## 数据质量约束', '## Data Quality Constraints'));
  if (missingData && missingData.length > 0) {
    for (const item of missingData) {
      let line = `- ${item.metric} ${t(locale, '在', 'in')} ${item.scope} ${t(locale, '缺失', 'missing')} ${item.missingCount}/${item.totalCount}`;
      if (item.lastAvailableDate) {
        line += `\n  - ${t(locale, '最近可用日期', 'Last available date')}: ${item.lastAvailableDate}`;
      }
      line += `\n  - ${t(locale, '影响', 'Impact')}: ${item.impact}`;
      if (item.requiredDisclosure) {
        line += `\n  - ${t(locale, '披露要求', 'Required disclosure')}: ${item.requiredDisclosure}`;
      }
      sections.push(line);
    }
  } else if (context.dataWindow.missingFields.length > 0) {
    const separator = locale === 'zh' ? '、' : ', ';
    sections.push(
      t(locale,
        `以下指标存在缺失数据：${context.dataWindow.missingFields.join(separator)}。请勿对缺失数据进行推测或补齐，如实告知数据不足。`,
        `The following metrics have missing data: ${context.dataWindow.missingFields.join(separator)}. Do not speculate on or fill in missing data — honestly state that data is insufficient.`,
      ),
    );
  } else {
    sections.push(t(locale, '当前数据窗口内各指标数据完整。', 'All metrics within the current data window are complete.'));
  }

  if (context.signals.lowData) {
    sections.push(t(locale,
      '⚠️ 当前为低数据状态，数据量不足以进行全面分析，请明确告知用户。',
      '⚠️ Currently in a low-data state. Insufficient data for comprehensive analysis — clearly inform the user.',
    ));
  }

  // 安全约束
  sections.push('');
  sections.push(t(locale, '## 安全边界', '## Safety Boundaries'));
  sections.push(t(locale, '- 你不是医生，不能做出医学诊断', '- You are not a doctor and cannot make medical diagnoses'));
  sections.push(t(locale, '- 涉及严重异常时建议用户就医', '- Advise the user to seek medical attention when severe abnormalities are detected'));
  sections.push(t(locale, '- 不要对缺失数据进行推测或编造', '- Do not speculate on or fabricate missing data'));
  sections.push(t(locale, '- summary 只能基于 evidence facts 和当前 task packet', '- Summary must be based solely on evidence facts and the current task packet'));
  sections.push(t(locale, '- 如果 evidence 缺失，不得补全', '- If evidence is missing, do not fill in gaps'));
  sections.push(t(locale, '- 重要建议必须能回溯到至少一个 evidence fact', '- Important recommendations must be traceable to at least one evidence fact'));

  return sections.join('\n');
}
