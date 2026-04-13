import type { AgentContext } from '../types/agent-context';
import type { PromptLoader } from './prompt-loader';

export function buildSystemPrompt(
  context: AgentContext,
  loader: PromptLoader,
): string {
  const baseTemplate = loader.load('system');

  const sections: string[] = [baseTemplate];

  // 用户信息
  sections.push('');
  sections.push('## 用户信息');
  sections.push(`- 姓名：${context.profile.name}`);
  sections.push(`- 年龄：${context.profile.age}`);

  // 基线数据
  sections.push('');
  sections.push('## 基线参考值');
  sections.push(`- 静息心率：${context.profile.baselines.restingHR} bpm`);
  sections.push(`- HRV 基线：${context.profile.baselines.hrv} ms`);

  // 数据质量约束
  sections.push('');
  sections.push('## 数据质量约束');
  if (context.dataWindow.missingFields.length > 0) {
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

  return sections.join('\n');
}
