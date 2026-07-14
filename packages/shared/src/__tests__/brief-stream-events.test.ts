import { describe, it, expect } from 'vitest';
import { BriefStreamEventSchema, isBriefStreamTerminalEvent } from '../schemas/brief-stream';

const action = { id: 'a1', emoji: '💧', title: '补水', description: '多喝水', aiPromise: '记录' };
const suggestion = {
  timePoint: '15:30', predictedState: '低谷', rationale: '咖啡因',
  action: { id: 'f1', emoji: '🧘', title: '呼吸', description: '深呼吸', aiPromise: '记录' },
};

describe('BriefStreamEventSchema 新增 3 个事件', () => {
  it('brief.action.ready 合法', () => {
    const e = { type: 'brief.action.ready', requestId: 'r1', index: 0, action };
    expect(BriefStreamEventSchema.parse(e).type).toBe('brief.action.ready');
  });
  it('brief.forecast.started 合法', () => {
    const e = { type: 'brief.forecast.started', requestId: 'r1' };
    expect(BriefStreamEventSchema.parse(e).type).toBe('brief.forecast.started');
  });
  it('brief.future_suggestion.ready 合法', () => {
    const e = { type: 'brief.future_suggestion.ready', requestId: 'r1', index: 0, suggestion };
    expect(BriefStreamEventSchema.parse(e).type).toBe('brief.future_suggestion.ready');
  });
  it('brief.action.ready 缺 action 字段拒绝', () => {
    expect(() => BriefStreamEventSchema.parse({ type: 'brief.action.ready', requestId: 'r1', index: 0 })).toThrow();
  });
  it('brief.action.ready index 负数拒绝', () => {
    expect(() => BriefStreamEventSchema.parse({ type: 'brief.action.ready', requestId: 'r1', index: -1, action })).toThrow();
  });
  it('三种新事件均非终态', () => {
    expect(isBriefStreamTerminalEvent({ type: 'brief.action.ready', requestId: 'r1', index: 0, action } as never)).toBe(false);
    expect(isBriefStreamTerminalEvent({ type: 'brief.forecast.started', requestId: 'r1' } as never)).toBe(false);
    expect(isBriefStreamTerminalEvent({ type: 'brief.future_suggestion.ready', requestId: 'r1', index: 0, suggestion } as never)).toBe(false);
  });
});

describe('BriefStreamEventSchema brief.summary.done 事件', () => {
  it('brief.summary.done 合法', () => {
    const e = { type: 'brief.summary.done', requestId: 'r1' };
    expect(BriefStreamEventSchema.parse(e).type).toBe('brief.summary.done');
  });
  it('brief.summary.done 缺 requestId 拒绝', () => {
    expect(() => BriefStreamEventSchema.parse({ type: 'brief.summary.done' })).toThrow();
  });
  it('brief.summary.done 非终态', () => {
    expect(isBriefStreamTerminalEvent({ type: 'brief.summary.done', requestId: 'r1' } as never)).toBe(false);
  });
});
