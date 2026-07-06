import { describe, expect, it } from 'vitest';
import {
  HEALTH_VISUAL_STATES,
  HEALTH_STATE_METADATA,
  isHealthVisualState,
  getHealthStateMeta,
} from './valo-theme';

describe('HEALTH_VISUAL_STATES', () => {
  it('严格收敛为四态', () => {
    expect(HEALTH_VISUAL_STATES).toHaveLength(4);
    expect(HEALTH_VISUAL_STATES).toEqual([
      'prime-readiness',
      'active-recovery',
      'metabolic-sluggish',
      'glycogen-depleted',
    ]);
  });
});

describe('HEALTH_STATE_METADATA', () => {
  it('每个状态都映射到对应的 CSS 变量名与标签键', () => {
    expect(HEALTH_STATE_METADATA['prime-readiness']).toEqual({
      state: 'prime-readiness',
      cssVar: 'var(--valo-prime)',
      labelKey: 'health.state.prime-readiness',
    });
    expect(HEALTH_STATE_METADATA['active-recovery']).toEqual({
      state: 'active-recovery',
      cssVar: 'var(--valo-active)',
      labelKey: 'health.state.active-recovery',
    });
    expect(HEALTH_STATE_METADATA['metabolic-sluggish']).toEqual({
      state: 'metabolic-sluggish',
      cssVar: 'var(--valo-sluggish)',
      labelKey: 'health.state.metabolic-sluggish',
    });
    expect(HEALTH_STATE_METADATA['glycogen-depleted']).toEqual({
      state: 'glycogen-depleted',
      cssVar: 'var(--valo-depleted)',
      labelKey: 'health.state.glycogen-depleted',
    });
  });

  it('所有 CSS 变量引用均指向 valo 命名空间', () => {
    for (const meta of Object.values(HEALTH_STATE_METADATA)) {
      expect(meta.cssVar.startsWith('var(--valo-')).toBe(true);
    }
  });

  it('每个状态的 state 字段与 key 一致', () => {
    for (const [key, meta] of Object.entries(HEALTH_STATE_METADATA)) {
      expect(meta.state).toBe(key);
    }
  });
});

describe('isHealthVisualState', () => {
  it('接受四态字符串', () => {
    expect(isHealthVisualState('prime-readiness')).toBe(true);
    expect(isHealthVisualState('active-recovery')).toBe(true);
    expect(isHealthVisualState('metabolic-sluggish')).toBe(true);
    expect(isHealthVisualState('glycogen-depleted')).toBe(true);
  });

  it('拒绝非法字符串', () => {
    expect(isHealthVisualState('unknown')).toBe(false);
    expect(isHealthVisualState('')).toBe(false);
    expect(isHealthVisualState('Prime Readiness')).toBe(false);
  });
});

describe('getHealthStateMeta', () => {
  it('返回合法状态对应的 metadata', () => {
    expect(getHealthStateMeta('active-recovery').cssVar).toBe('var(--valo-active)');
  });

  it('对非法状态抛出错误', () => {
    // getHealthStateMeta 接收 string 而非 HealthVisualState，运行期校验非法输入
    expect(() => getHealthStateMeta('bogus')).toThrowError(
      /Unknown HealthVisualState/,
    );
  });
});
