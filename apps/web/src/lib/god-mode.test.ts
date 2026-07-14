import { describe, expect, it, vi } from 'vitest';
import { mapActiveSensingToBanner } from './god-mode';
import type { BannerTranslator } from './god-mode';
import type { ActiveSensingState } from '@health-advisor/shared';

/**
 * 这些测试验证 mapActiveSensingToBanner 的「映射逻辑」与「翻译键调用契约」，
 * 不绑定具体文案（文案由 messages/{locale}.json 提供）。
 * echo t 返回 key 本身，便于断言 banner 字段由哪个翻译键驱动。
 */
function makeEchoT() {
  return vi.fn(((key: string) => key) as BannerTranslator);
}

const baseState: ActiveSensingState = {
  visible: true,
  priority: 'high',
  surface: 'banner',
  date: '2026-04-13',
  events: [],
};

describe('god-mode helpers', () => {
  it('maps sport_detected to triggered banner with titleTriggered / contentGeneric', () => {
    const t = makeEchoT();
    const banner = mapActiveSensingToBanner(
      { ...baseState, events: ['sport_detected'] },
      t,
      'zh',
    );

    expect(banner).toEqual({
      id: 'active-sensing:2026-04-13:sport_detected',
      type: 'alert',
      title: 'titleTriggered',
      content: 'contentGeneric',
      priority: 100,
      events: ['sport_detected'],
    });
    expect(t).toHaveBeenCalledWith('titleTriggered');
    expect(t).toHaveBeenCalledWith('events.sport_detected');
    expect(t).toHaveBeenCalledWith('contentGeneric', {
      date: expect.stringContaining('2026'),
      summary: 'events.sport_detected',
    });
  });

  it('maps possible alcohol intake to confirmation banner', () => {
    const t = makeEchoT();
    const banner = mapActiveSensingToBanner(
      { ...baseState, date: '2026-04-13T20:00', events: ['possible_alcohol_intake'] },
      t,
      'zh',
    );

    expect(banner.type).toBe('alert');
    expect(banner.title).toBe('titleConfirm');
    expect(t).toHaveBeenCalledWith('titleConfirm');
    expect(t).toHaveBeenCalledWith('contentAlcohol', {
      date: expect.stringContaining('2026'),
    });
    expect(banner.events).toEqual(['possible_alcohol_intake']);
  });

  it('maps possible caffeine intake to confirmation banner', () => {
    const t = makeEchoT();
    const banner = mapActiveSensingToBanner(
      { ...baseState, date: '2026-04-13T08:00', events: ['possible_caffeine_intake'] },
      t,
      'en',
    );

    expect(banner.type).toBe('alert');
    expect(banner.title).toBe('titleConfirm');
    expect(t).toHaveBeenCalledWith('contentCaffeine', {
      date: expect.stringContaining('2026'),
    });
    expect(banner.events).toEqual(['possible_caffeine_intake']);
  });

  it('maps both alcohol and caffeine to contentBoth', () => {
    const t = makeEchoT();
    mapActiveSensingToBanner(
      {
        ...baseState,
        events: ['possible_alcohol_intake', 'possible_caffeine_intake'],
      },
      t,
      'en',
    );

    expect(t).toHaveBeenCalledWith('contentBoth', {
      date: expect.stringContaining('2026'),
    });
  });

  it('falls back to Title Case for unknown event types without querying missing keys', () => {
    const t = makeEchoT();
    mapActiveSensingToBanner(
      { ...baseState, events: ['some_unknown_event'] },
      t,
      'en',
    );

    // 未知事件不应查询 events.some_unknown_event（否则 next-intl 抛 MISSING_MESSAGE）
    expect(t).not.toHaveBeenCalledWith('events.some_unknown_event');
    expect(t).toHaveBeenCalledWith('contentGeneric', {
      date: expect.stringContaining('2026'),
      summary: 'Some Unknown Event',
    });
  });

  it('uses unknownEvent key when events list is empty', () => {
    const t = makeEchoT();
    mapActiveSensingToBanner(baseState, t, 'en');

    expect(t).toHaveBeenCalledWith('unknownEvent');
    expect(t).toHaveBeenCalledWith('contentGeneric', {
      date: expect.stringContaining('2026'),
      summary: 'unknownEvent',
    });
  });
});
