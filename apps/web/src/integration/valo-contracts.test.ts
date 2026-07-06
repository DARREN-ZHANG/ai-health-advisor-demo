import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import {
  HEALTH_STATE_METADATA,
  HEALTH_VISUAL_STATES,
  type HealthVisualState,
} from '@/lib/valo-theme';
import {
  HEALTH_STATE_GRADIENTS,
  ApiHealthStatus,
  mapApiStatusToVisualState,
} from '@/lib/health-visual-state';
import { TIMELINE_SEGMENTS } from '@/components/demo-control/timeline-segments';

/**
 * Valo 跨模块契约测试（I7.1 Part C）。
 *
 * 这些测试不重复 I1.1–I6.2 已覆盖的单元行为，而是守护跨模块的"全局不变量"：
 *
 * 1. Switch Status 入口唯一：整个 `apps/web/src` 中只有 HealthHero ring →
 *    SwitchStatusDialog + page.tsx 的集成会调用 `setManualOverride`；
 *    Avatar / DemoControl / BottomNav / Navbar 不得悄悄打开状态切换。
 * 2. `mapApiStatusToVisualState` 对 `ApiHealthStatus` 的所有取值都有定义，
 *    且每个返回值都能在 `HEALTH_STATE_METADATA` 中查到元数据（四态穷尽）。
 * 3. `TIMELINE_SEGMENTS` 中每个 `type` 唯一（I2.1 已有单元测试，本测试
 *    作为跨模块防御性回归，避免有人通过新增/复制片段悄悄破坏不变量）。
 * 4. BottomNav / Navbar 的导航项 IA 不包含 "switch status" 入口。
 *
 * 这些契约一旦破坏，往往意味着设计文档（design-manifest.md）也被改动，
 * 测试失败会强制提醒作者检视 IA。
 */

const SRC_ROOT = path.resolve(__dirname, '..');

/** 递归收集 `apps/web/src` 下所有 `.ts` / `.tsx` 源文件路径。 */
function collectSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      // 跳过集成测试自身，避免循环引用噪声。
      if (path.basename(full) === 'integration') continue;
      out.push(...collectSourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

describe('Valo 跨模块契约', () => {
  it('Switch Status 入口唯一：setManualOverride 仅在 Hero + 集成层被调用', () => {
    const files = collectSourceFiles(SRC_ROOT);
    // 调用 setManualOverride 的文件集合。
    const callsiteFiles: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      if (!src.includes('setManualOverride')) continue;
      // 仅统计真正的"调用 / 引用"位置，排除注释里的描述性引用。
      // 实际 callsite 形如 `setManualOverride(...)` 或 `s.setManualOverride`。
      if (/(?:^|\W)setManualOverride\s*[().=]/m.test(src)) {
        callsiteFiles.push(path.relative(SRC_ROOT, f));
      }
    }

    // 期望集合：
    // - health-status.store.ts：定义处（store action 实现）
    // - app/page.tsx：唯一集成层（Hero → Dialog → store）
    // - health-status.store.test.ts：单元测试
    const expected = new Set([
      'stores/health-status.store.ts',
      'stores/health-status.store.test.ts',
      'app/page.tsx',
    ]);
    const unexpected = callsiteFiles.filter((f) => !expected.has(f));

    expect(
      unexpected,
      `setManualOverride 出现在了非预期位置（应为 Hero/集成层/store 独占）：${unexpected.join(', ')}`,
    ).toEqual([]);
  });

  it('Hero ring / Avatar / DemoControl / BottomNav / Navbar 都不直接调用 setManualOverride', () => {
    const forbidPaths = [
      'components/homepage/HealthHero.tsx',
      'components/homepage/HomeHeader.tsx',
      'components/demo-control/DemoControlTrigger.tsx',
      'components/demo-control/DemoControlDrawer.tsx',
      'components/layout/BottomNav.tsx',
      'components/layout/Navbar.tsx',
      'components/settings/AccountSwitcherSheet.tsx',
      'components/settings/MyScreen.tsx',
    ];
    const offenders = forbidPaths.filter((rel) => {
      const full = path.join(SRC_ROOT, rel);
      const src = readFileSync(full, 'utf8');
      return /(?:^|\W)setManualOverride\s*[().=]/m.test(src);
    });
    expect(offenders).toEqual([]);
  });

  it('mapApiStatusToVisualState 对每个 ApiHealthStatus 取值都返回合法 HealthVisualState', () => {
    const allInputs: Array<{ status: ApiHealthStatus; hasBrief: boolean }> = [
      { status: undefined, hasBrief: false },
      { status: undefined, hasBrief: true },
      { status: 'good', hasBrief: true },
      { status: 'warning', hasBrief: true },
      { status: 'error', hasBrief: true },
    ];
    for (const { status, hasBrief } of allInputs) {
      const result = mapApiStatusToVisualState(status, hasBrief);
      expect(HEALTH_VISUAL_STATES).toContain(result);
      // 反向：每个返回值都能在元数据表中查到，且渲染渐变已配置。
      expect(HEALTH_STATE_METADATA[result]).toBeDefined();
      expect(HEALTH_STATE_GRADIENTS[result]).toBeDefined();
    }
  });

  it('四态 HealthVisualState 全部出现在 HEALTH_STATE_METADATA / GRADIENTS / HEALTH_VISUAL_STATES 三处', () => {
    // 三处定义必须同步 —— 任何一个漏更新都会让某态渲染失败。
    const states: HealthVisualState[] = [
      'prime-readiness',
      'active-recovery',
      'metabolic-sluggish',
      'glycogen-depleted',
    ];
    for (const s of states) {
      expect(HEALTH_VISUAL_STATES).toContain(s);
      expect(HEALTH_STATE_METADATA[s]).toBeDefined();
      expect(HEALTH_STATE_GRADIENTS[s]).toBeDefined();
    }
    expect(HEALTH_VISUAL_STATES).toHaveLength(states.length);
    expect(Object.keys(HEALTH_STATE_METADATA)).toHaveLength(states.length);
    expect(Object.keys(HEALTH_STATE_GRADIENTS)).toHaveLength(states.length);
  });

  it('TIMELINE_SEGMENTS 中每个 type 唯一，且总条目稳定为 13', () => {
    // 与 I2.1 的单元测试语义重叠，但放在 integration 层作防御性回归：
    // 当有人跨模块复制片段配置时，单元测试可能被同步改掉，而本测试仍然
    // 锚定 13 这个 magic number 与 "唯一" 不变量。
    expect(TIMELINE_SEGMENTS).toHaveLength(13);
    const types = TIMELINE_SEGMENTS.map((s) => s.type);
    const dupes = types.filter((t, i) => types.indexOf(t) !== i);
    expect(dupes).toEqual([]);
  });
});
