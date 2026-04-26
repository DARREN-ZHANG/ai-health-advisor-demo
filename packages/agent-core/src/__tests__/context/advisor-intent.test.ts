import { describe, it, expect } from 'vitest';
import { parseQuestionIntent } from '../../context/advisor-intent';

describe('parseQuestionIntent', () => {
  it('detects sleep focus', () => {
    const intent = parseQuestionIntent('昨晚睡眠怎么样');
    expect(intent.metricFocus).toContain('sleep');
  });

  it('detects HRV focus', () => {
    const intent = parseQuestionIntent('我的HRV为什么下降了');
    expect(intent.metricFocus).toContain('hrv');
  });

  it('detects heart rate focus (not HRV)', () => {
    const intent = parseQuestionIntent('我的心率正常吗');
    expect(intent.metricFocus).toContain('resting-hr');
    expect(intent.metricFocus).not.toContain('hrv');
  });

  it('detects activity focus', () => {
    const intent = parseQuestionIntent('今天走了多少步');
    expect(intent.metricFocus).toContain('activity');
  });

  it('detects stress focus', () => {
    const intent = parseQuestionIntent('最近压力大不大');
    expect(intent.metricFocus).toContain('stress');
  });

  it('detects SpO2 focus', () => {
    const intent = parseQuestionIntent('血氧饱和度如何');
    expect(intent.metricFocus).toContain('spo2');
  });

  it('detects today time scope', () => {
    const intent = parseQuestionIntent('今天状态怎么样');
    expect(intent.timeScope).toBe('today');
  });

  it('detects yesterday time scope', () => {
    const intent = parseQuestionIntent('昨晚睡眠如何');
    expect(intent.timeScope).toBe('yesterday');
  });

  it('detects week time scope', () => {
    const intent = parseQuestionIntent('这一周的数据');
    expect(intent.timeScope).toBe('week');
  });

  it('detects exercise readiness intent', () => {
    const intent = parseQuestionIntent('我现在能去跑步吗');
    expect(intent.actionIntent).toBe('exercise_readiness');
    expect(intent.riskLevel).toBe('safety_boundary');
  });

  it('detects chart explanation intent', () => {
    const intent = parseQuestionIntent('这个图说明什么');
    expect(intent.actionIntent).toBe('explain_chart');
  });

  it('detects ask why intent', () => {
    const intent = parseQuestionIntent('为什么我的HRV下降了');
    expect(intent.actionIntent).toBe('ask_why');
  });

  it('detects status summary intent', () => {
    const intent = parseQuestionIntent('最近状态如何');
    expect(intent.actionIntent).toBe('status_summary');
  });

  it('defaults to general when no patterns match', () => {
    const intent = parseQuestionIntent('你好');
    expect(intent.metricFocus).toEqual([]);
    expect(intent.timeScope).toBe('unknown');
    expect(intent.actionIntent).toBe('general');
    expect(intent.riskLevel).toBe('general');
  });

  it('combines multiple foci', () => {
    const intent = parseQuestionIntent('昨晚睡眠和今天的HRV');
    expect(intent.metricFocus).toContain('sleep');
    expect(intent.metricFocus).toContain('hrv');
    expect(intent.timeScope).toBe('yesterday');
  });
});
