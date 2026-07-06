import { describe, expect, it } from 'vitest';
import type { TimelineSegmentType } from './types';
import {
  EVENT_TYPE_DISPLAY,
  PROBABILISTIC_EVENT_TYPE_MAP,
  PROBABILISTIC_SEGMENT_TYPES,
  TIMELINE_SEGMENTS,
  TIMELINE_SEGMENTS_BY_GROUP,
  TIMELINE_SEGMENT_GROUPS,
} from './timeline-segments';

/** 13 个 segmentType 的全集，按组分类 */
const EXPECTED_BY_GROUP = {
  'daily-rhythm': [
    'meal_intake',
    'walk',
    'sleep',
    'nap',
    'deep_focus',
    'relaxation',
  ],
  'sport-training': [
    'steady_cardio',
    'intermittent_exercise',
    'strength_training',
  ],
  'state-intake': [
    'prolonged_sedentary',
    'anxiety_episode',
    'caffeine_intake',
    'alcohol_intake',
  ],
} as const;

/** 全部 13 个 segmentType（用于去重断言） */
const ALL_EXPECTED_TYPES: TimelineSegmentType[] = [
  ...EXPECTED_BY_GROUP['daily-rhythm'],
  ...EXPECTED_BY_GROUP['sport-training'],
  ...EXPECTED_BY_GROUP['state-intake'],
];

describe('TIMELINE_SEGMENT_GROUPS', () => {
  it('maintains the fixed three-group order', () => {
    expect(TIMELINE_SEGMENT_GROUPS).toEqual([
      'daily-rhythm',
      'sport-training',
      'state-intake',
    ]);
  });
});

describe('TIMELINE_SEGMENTS', () => {
  it('contains exactly 13 segments', () => {
    expect(TIMELINE_SEGMENTS).toHaveLength(13);
  });

  it('lists each segment type exactly once', () => {
    const types = TIMELINE_SEGMENTS.map((s) => s.type);
    const unique = new Set(types);
    expect(unique.size).toBe(types.length);
    expect(types.sort()).toEqual([...ALL_EXPECTED_TYPES].sort());
  });

  it('orders segments by group then by the specified within-group order', () => {
    const types = TIMELINE_SEGMENTS.map((s) => s.type);
    expect(types).toEqual(ALL_EXPECTED_TYPES);
  });

  it('tags each segment with the group it belongs to', () => {
    for (const segment of TIMELINE_SEGMENTS) {
      const expectedGroup = (
        Object.keys(EXPECTED_BY_GROUP) as Array<keyof typeof EXPECTED_BY_GROUP>
      ).find((g) => EXPECTED_BY_GROUP[g].includes(segment.type as never));
      expect(expectedGroup).toBeDefined();
      expect(segment.group).toBe(expectedGroup);
    }
  });

  it('exposes every segment as a readonly config (no mutation hazard)', () => {
    for (const segment of TIMELINE_SEGMENTS) {
      expect(typeof segment.type).toBe('string');
      expect(typeof segment.labelKey).toBe('string');
      expect(typeof segment.helpKey).toBe('string');
      expect(typeof segment.icon).toBe('string');
    }
  });
});

describe('TIMELINE_SEGMENTS_BY_GROUP', () => {
  it('covers all three groups', () => {
    for (const group of TIMELINE_SEGMENT_GROUPS) {
      expect(TIMELINE_SEGMENTS_BY_GROUP[group]).toBeDefined();
    }
  });

  it('groups segments exactly as the spec (6 / 3 / 4)', () => {
    expect(TIMELINE_SEGMENTS_BY_GROUP['daily-rhythm']).toHaveLength(6);
    expect(TIMELINE_SEGMENTS_BY_GROUP['sport-training']).toHaveLength(3);
    expect(TIMELINE_SEGMENTS_BY_GROUP['state-intake']).toHaveLength(4);
  });

  it('keeps every type covered across the three groups', () => {
    const groupedTypes = TIMELINE_SEGMENT_GROUPS.flatMap(
      (g) => TIMELINE_SEGMENTS_BY_GROUP[g].map((s) => s.type),
    );
    expect(groupedTypes.sort()).toEqual([...ALL_EXPECTED_TYPES].sort());
  });

  it('does not double-list a segment across groups', () => {
    const groupedTypes = TIMELINE_SEGMENT_GROUPS.flatMap(
      (g) => TIMELINE_SEGMENTS_BY_GROUP[g].map((s) => s.type),
    );
    expect(new Set(groupedTypes).size).toBe(groupedTypes.length);
  });
});

describe('PROBABILISTIC_SEGMENT_TYPES', () => {
  it('contains exactly caffeine_intake and alcohol_intake', () => {
    expect(PROBABILISTIC_SEGMENT_TYPES).toEqual(
      new Set(['caffeine_intake', 'alcohol_intake']),
    );
  });
});

describe('PROBABILISTIC_EVENT_TYPE_MAP', () => {
  it('maps segment types to their possible_* event types', () => {
    expect(PROBABILISTIC_EVENT_TYPE_MAP).toEqual({
      alcohol_intake: 'possible_alcohol_intake',
      caffeine_intake: 'possible_caffeine_intake',
    });
  });

  it('keys match PROBABILISTIC_SEGMENT_TYPES', () => {
    const mapKeys = new Set(Object.keys(PROBABILISTIC_EVENT_TYPE_MAP));
    expect(mapKeys).toEqual(PROBABILISTIC_SEGMENT_TYPES);
  });
});

describe('EVENT_TYPE_DISPLAY', () => {
  it('covers all 13 base segment types', () => {
    for (const type of ALL_EXPECTED_TYPES) {
      const display = EVENT_TYPE_DISPLAY[type];
      expect(display).toBeDefined();
      expect(typeof display?.icon).toBe('string');
      expect(typeof display?.labelKey).toBe('string');
    }
  });

  it('exposes the possible_* variants for probabilistic segments', () => {
    expect(EVENT_TYPE_DISPLAY['possible_alcohol_intake']).toBeDefined();
    expect(EVENT_TYPE_DISPLAY['possible_caffeine_intake']).toBeDefined();
  });
});
