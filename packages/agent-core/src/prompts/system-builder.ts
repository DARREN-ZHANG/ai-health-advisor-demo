import type { AgentContext } from '../types/agent-context';
import type { PromptLoader } from './prompt-loader';
import type { MissingDataItem } from '../context/context-packet';

export function buildSystemPrompt(
  context: AgentContext,
  loader: PromptLoader,
  missingData?: MissingDataItem[],
): string {
  const baseTemplate = loader.load('system');

  const sections: string[] = [baseTemplate];

  // 用户信息
  sections.push('');
  sections.push('## 用户信息');
  sections.push(`- 姓名：${context.profile.name}`);
  sections.push(`- 年龄：${context.profile.age}`);
  if (context.profile.tags.length > 0) {
    sections.push(`- 标签：${context.profile.tags.join('、')}`);
  }

  // 基线数据
  sections.push('');
  sections.push('## 基线参考值');
  sections.push(`- 静息心率：${context.profile.baselines.restingHR} bpm`);
  sections.push(`- HRV 基线：${context.profile.baselines.hrv} ms`);
  sections.push(`- SpO2 基线：${context.profile.baselines.spo2}%`);
  sections.push(`- 平均睡眠：${context.profile.baselines.avgSleepMinutes} 分钟`);
  sections.push(`- 平均步数：${context.profile.baselines.avgSteps} 步`);

  // 数据质量约束（优先使用结构化 missingData）
  sections.push('');
  sections.push('## 数据质量约束');
  if (missingData && missingData.length > 0) {
    for (const item of missingData) {
      let line = `- ${item.metric} 在 ${item.scope} 缺失 ${item.missingCount}/${item.totalCount}`;
      if (item.requiredDisclosure) {
        line += `：${item.requiredDisclosure}`;
      }
      sections.push(line);
    }
  } else if (context.dataWindow.missingFields.length > 0) {
    sections.push(
      `以下指标存在缺失数据：${context.dataWindow.missingFields.join('、')}。` +
      '请勿对缺失数据进行推测或补齐，如实告知数据不足。',
    );
  } else {
    sections.push('当前数据窗口内各指标数据完整。');
  }

  if (context.signals.lowData) {
    sections.push('⚠️ 当前为低数据状态，数据量不足以进行全面分析，请明确告知用户。');
  }

  // 安全约束
  sections.push('');
  sections.push('## 安全边界');
  sections.push('- 你不是医生，不能做出医学诊断');
  sections.push('- 涉及严重异常时建议用户就医');
  sections.push('- 不要对缺失数据进行推测或编造');
  sections.push('- summary 只能基于 evidence facts 和当前 task packet');
  sections.push('- 如果 evidence 缺失，不得补全');
  sections.push('- 重要建议必须能回溯到至少一个 evidence fact');

  return sections.join('\n');
}
