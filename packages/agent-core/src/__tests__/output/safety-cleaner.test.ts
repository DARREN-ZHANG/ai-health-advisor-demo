import { describe, it, expect } from 'vitest';
import { cleanSafetyIssues, type SafetyCleanResult } from '../../output/safety-cleaner';

describe('cleanSafetyIssues', () => {
  it('正常 summary 直接通过', () => {
    const result = cleanSafetyIssues(
      'HRV 近期趋势稳定，整体状态良好。',
      [],
    );

    expect(result.cleaned).toBe('HRV 近期趋势稳定，整体状态良好。');
    expect(result.flags).toEqual([]);
  });

  it('清洗诊断性语言', () => {
    const result = cleanSafetyIssues(
      '您患有心律不齐，建议服用药物。',
      [],
    );

    expect(result.flags).toContainEqual(
      expect.objectContaining({ type: 'diagnosis' }),
    );
    expect(result.cleaned).not.toContain('患有');
  });

  it('清洗幻觉性缺失数据补齐', () => {
    const result = cleanSafetyIssues(
      '您的血氧数据为 97%，状态正常。',
      ['spo2'],
    );

    expect(result.flags).toContainEqual(
      expect.objectContaining({ type: 'hallucinated_data' }),
    );
  });

  it('保留合理的建议用语', () => {
    const result = cleanSafetyIssues(
      '建议保持规律作息，适当运动。',
      [],
    );

    expect(result.flags).toEqual([]);
    expect(result.cleaned).toContain('建议保持');
  });

  it('清洗多个问题', () => {
    const result = cleanSafetyIssues(
      '确诊为高血压。心率数据正常，为 65 bpm。',
      ['hr'],
    );

    expect(result.flags.length).toBeGreaterThanOrEqual(1);
  });

  it('microTips 中也清洗诊断语言', () => {
    const result = cleanSafetyIssues(
      '整体良好',
      [],
      ['您被诊断为心律失常', '保持运动'],
    );

    expect(result.cleanedTips[0]).not.toContain('诊断');
    expect(result.cleanedTips[1]).toBe('保持运动');
  });

  it('清洗药物建议', () => {
    const result = cleanSafetyIssues(
      '建议服用降压药物控制血压。',
      [],
    );

    expect(result.flags).toContainEqual(
      expect.objectContaining({ type: 'unauthorized_advice' }),
    );
    expect(result.cleaned).not.toContain('服用');
    expect(result.cleaned).toContain('建议及时就医咨询');
  });

  it('清洗"服药"用语', () => {
    const result = cleanSafetyIssues(
      '建议服药治疗。',
      [],
    );

    expect(result.cleaned).not.toContain('服药');
    expect(result.cleaned).toContain('就医');
  });

  it('幻觉数据被实际替换为不可用提示', () => {
    const result = cleanSafetyIssues(
      '您的血氧数据为 97%，状态正常。',
      ['spo2'],
    );

    expect(result.flags).toContainEqual(
      expect.objectContaining({ type: 'hallucinated_data' }),
    );
    expect(result.cleaned).toContain('血氧数据暂不可用');
    expect(result.cleaned).not.toContain('97%');
  });
});
