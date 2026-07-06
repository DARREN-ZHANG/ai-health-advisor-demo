import { describe, expect, it } from 'vitest';
import {
  HEALTH_STATE_GRADIENTS,
  SWITCH_STATUS_OPTIONS,
  mapApiStatusToVisualState,
  HEALTH_VISUAL_STATES,
} from './health-visual-state';
import { HEALTH_STATE_METADATA } from './valo-theme';
import type { HealthVisualState } from './valo-theme';

describe('mapApiStatusToVisualState', () => {
  it('good 映射到 active-recovery', () => {
    expect(mapApiStatusToVisualState('good', true)).toBe('active-recovery');
  });

  it('warning 映射到 metabolic-sluggish', () => {
    expect(mapApiStatusToVisualState('warning', true)).toBe(
      'metabolic-sluggish',
    );
  });

  it('error 映射到 glycogen-depleted', () => {
    expect(mapApiStatusToVisualState('error', true)).toBe('glycogen-depleted');
  });

  it('没有 brief 时映射到 prime-readiness（首屏）', () => {
    expect(mapApiStatusToVisualState('good', false)).toBe('prime-readiness');
    expect(mapApiStatusToVisualState('error', false)).toBe('prime-readiness');
  });

  it('statusColor 缺失（undefined）+ 没有 brief → prime-readiness', () => {
    expect(mapApiStatusToVisualState(undefined, false)).toBe('prime-readiness');
  });

  it('statusColor 缺失（undefined）+ 有 brief → 仍回到 prime-readiness（无声降级）', () => {
    // 边界场景：API 字段缺失。选择 prime-readiness 避免误报红/橙，
    // 与首屏保持一致的"中性紫"。文档见模块顶部 jsdoc。
    expect(mapApiStatusToVisualState(undefined, true)).toBe('prime-readiness');
  });

  it('穷尽性：所有 ApiHealthStatus 字面量都被覆盖', () => {
    const cases: ReadonlyArray<
      [Parameters<typeof mapApiStatusToVisualState>[0], HealthVisualState]
    > = [
      ['good', 'active-recovery'],
      ['warning', 'metabolic-sluggish'],
      ['error', 'glycogen-depleted'],
      [undefined, 'prime-readiness'],
    ];
    for (const [input, expected] of cases) {
      expect(mapApiStatusToVisualState(input, true)).toBe(expected);
    }
  });
});

describe('HEALTH_STATE_GRADIENTS', () => {
  it('为四态全部提供渐变', () => {
    for (const state of HEALTH_VISUAL_STATES) {
      expect(typeof HEALTH_STATE_GRADIENTS[state]).toBe('string');
      expect(HEALTH_STATE_GRADIENTS[state].length).toBeGreaterThan(0);
    }
  });

  it('每个渐变都引用 valo CSS 变量，不出现 hex 字面量', () => {
    for (const gradient of Object.values(HEALTH_STATE_GRADIENTS)) {
      expect(gradient).toMatch(/var\(--valo-(prime|active|sluggish|depleted)\)/);
      // 禁止 hex 字面量：调用方按 token 着色
      expect(gradient).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    }
  });

  it('prime-readiness 引用 --valo-prime', () => {
    expect(HEALTH_STATE_GRADIENTS['prime-readiness']).toMatch(
      /var\(--valo-prime\)/,
    );
  });

  it('active-recovery 引用 --valo-active', () => {
    expect(HEALTH_STATE_GRADIENTS['active-recovery']).toMatch(
      /var\(--valo-active\)/,
    );
  });

  it('metabolic-sluggish 引用 --valo-sluggish', () => {
    expect(HEALTH_STATE_GRADIENTS['metabolic-sluggish']).toMatch(
      /var\(--valo-sluggish\)/,
    );
  });

  it('glycogen-depleted 引用 --valo-depleted', () => {
    expect(HEALTH_STATE_GRADIENTS['glycogen-depleted']).toMatch(
      /var\(--valo-depleted\)/,
    );
  });
});

describe('SWITCH_STATUS_OPTIONS', () => {
  it('与 HEALTH_STATE_METADATA 内容一致（重新导出）', () => {
    expect(SWITCH_STATUS_OPTIONS).toBe(HEALTH_STATE_METADATA);
  });
});
