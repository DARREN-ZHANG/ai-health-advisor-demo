import { describe, expect, it } from 'vitest';
import { mapActiveSensingToBanner } from './god-mode';

describe('god-mode helpers', () => {
  it('maps active sensing state into banner payload for sport events', () => {
    const banner = mapActiveSensingToBanner({
      visible: true,
      priority: 'high',
      surface: 'banner',
      date: '2026-04-13',
      events: ['sport_detected'],
    });

    expect(banner).toEqual({
      id: 'active-sensing:2026-04-13:sport_detected',
      type: 'alert',
      title: 'Active Sensing 已触发',
      content: '2026年4月12日 17:00:00 检测到 HIIT 运动，需要我为您提供一些建议吗？',
      priority: 100,
      events: ['sport_detected'],
    });
  });

  it('maps possible alcohol intake to confirmation banner', () => {
    const banner = mapActiveSensingToBanner({
      visible: true,
      priority: 'high',
      surface: 'banner',
      date: '2026-04-13T20:00',
      events: ['possible_alcohol_intake'],
    });

    expect(banner.type).toBe('alert');
    expect(banner.title).toBe('需要确认一下');
    expect(banner.content).toContain('检测到您的心率和 HRV 出现了一些变化');
    expect(banner.content).toContain('这和饮酒后常见的生理反应有些相似');
    expect(banner.content).toContain('您最近有摄入酒精吗');
    expect(banner.events).toEqual(['possible_alcohol_intake']);
  });

  it('maps possible caffeine intake to confirmation banner', () => {
    const banner = mapActiveSensingToBanner({
      visible: true,
      priority: 'high',
      surface: 'banner',
      date: '2026-04-13T08:00',
      events: ['possible_caffeine_intake'],
    });

    expect(banner.type).toBe('alert');
    expect(banner.title).toBe('需要确认一下');
    expect(banner.content).toContain('注意到您的生理指标有些波动');
    expect(banner.content).toContain('咖啡因摄入后有点像');
    expect(banner.content).toContain('您最近有喝咖啡或其他含咖啡因的饮料吗');
    expect(banner.events).toEqual(['possible_caffeine_intake']);
  });
});
