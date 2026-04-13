import { describe, expect, it } from 'vitest';
import { getScenarioIcon, mapActiveSensingToBanner } from './god-mode';

describe('god-mode helpers', () => {
  it('maps active sensing state into banner payload', () => {
    const banner = mapActiveSensingToBanner({
      visible: true,
      priority: 'high',
      surface: 'banner',
      date: '2026-04-13',
      events: ['sport_detected', 'late_night_work'],
    });

    expect(banner).toEqual({
      id: 'active-sensing:2026-04-13:sport_detected|late_night_work',
      type: 'alert',
      title: 'Active Sensing 已触发',
      content: '2026-04-13 检测到 Sport Detected / Late Night Work，请查看详情并继续对话。',
      priority: 100,
    });
  });

  it('returns a stable icon for each scenario type', () => {
    expect(getScenarioIcon('demo_script')).toBe('🎬');
    expect(getScenarioIcon('reset')).toBe('🧪');
  });
});
