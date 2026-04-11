import { describe, it, expect } from 'vitest';
import { mergeEvents, type DatedEvent } from '../../merge/event';

describe('mergeEvents', () => {
  const baseEvents: DatedEvent[] = [
    { date: '2026-04-01', type: 'exercise', data: { duration: 30 } },
    { date: '2026-04-05', type: 'exercise', data: { duration: 45 } },
    { date: '2026-04-10', type: 'exercise', data: { duration: 20 } },
  ];

  it('should return base events when no injected events', () => {
    const result = mergeEvents(baseEvents, []);

    expect(result).toEqual(baseEvents);
    expect(result).toBe(baseEvents);
  });

  it('should return sorted injected events when no base events', () => {
    const injected: DatedEvent[] = [
      { date: '2026-04-10', type: 'late_night', data: { endTime: '02:00' } },
      { date: '2026-04-03', type: 'late_night', data: { endTime: '01:00' } },
    ];
    const result = mergeEvents([], injected);

    expect(result).toHaveLength(2);
    expect(result[0]!.date).toBe('2026-04-03');
    expect(result[1]!.date).toBe('2026-04-10');
  });

  it('should merge and sort by date', () => {
    const injected: DatedEvent[] = [
      { date: '2026-04-03', type: 'late_night', data: { endTime: '02:00' } },
      { date: '2026-04-07', type: 'late_night', data: { endTime: '03:00' } },
    ];
    const result = mergeEvents(baseEvents, injected);

    expect(result).toHaveLength(5);
    expect(result.map((e) => e.date)).toEqual([
      '2026-04-01',
      '2026-04-03',
      '2026-04-05',
      '2026-04-07',
      '2026-04-10',
    ]);
  });

  it('should not mutate original arrays', () => {
    const baseCopy = [...baseEvents];
    const injected: DatedEvent[] = [
      { date: '2026-04-03', type: 'late_night', data: { endTime: '02:00' } },
    ];
    const injectedCopy = [...injected];

    mergeEvents(baseEvents, injected);

    expect(baseEvents).toEqual(baseCopy);
    expect(injected).toEqual(injectedCopy);
  });

  it('should handle empty both arrays', () => {
    const result = mergeEvents([], []);

    expect(result).toEqual([]);
  });

  it('should handle events with same date', () => {
    const injected: DatedEvent[] = [
      { date: '2026-04-01', type: 'late_night', data: { endTime: '01:00' } },
    ];
    const result = mergeEvents(baseEvents, injected);

    // 同一天的两个事件都应存在
    const apr01Events = result.filter((e) => e.date === '2026-04-01');
    expect(apr01Events).toHaveLength(2);
  });

  it('should sort already sorted base events with injected', () => {
    const injected: DatedEvent[] = [{ date: '2026-04-02', type: 'event', data: {} }];
    const result = mergeEvents(baseEvents, injected);

    expect(result).toHaveLength(4);
    // 验证排序正确
    for (let i = 1; i < result.length; i++) {
      expect(result[i]!.date >= result[i - 1]!.date).toBe(true);
    }
  });
});
