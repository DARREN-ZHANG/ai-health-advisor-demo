# Wave 1 — Charts 包实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建 ECharts 图表组件库，包含 React 封装层、option builder、micro-chart 和 token registry。

**Architecture:** 自定义轻量 ECharts React wrapper，纯函数 option builder 将标准时间序列转换为 ECharts 配置，token registry 将 ChartTokenId 映射到对应 builder。

**Tech Stack:** React 19, ECharts 5, TypeScript, Vitest

**前置依赖:** Plan 1 (Shared 包) 完成后开始

---

### Task 1: 创建 charts 包骨架 (CHT-001)

**Files:**

- Create: `packages/charts/package.json`
- Create: `packages/charts/tsconfig.json`
- Create: `packages/charts/vitest.config.ts`
- Create: `packages/charts/src/index.ts`

- [ ] **Step 1: 创建 package.json**

```json
{
  "name": "@health-advisor/charts",
  "version": "0.0.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "build": "tsc",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage",
    "clean": "rimraf dist node_modules"
  },
  "dependencies": {
    "@health-advisor/shared": "workspace:*",
    "echarts": "^5.6.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "jsdom": "^26.0.0",
    "typescript": "^5.7.0",
    "vitest": "^3.1.0"
  }
}
```

- [ ] **Step 2: 创建 tsconfig.json**

```json
{
  "extends": "@health-advisor/config/tsconfig.react.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "jsx": "react-jsx"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: 创建 vitest.config.ts**

```ts
import { defineConfig, mergeConfig } from 'vitest/config';
import baseConfig from '@health-advisor/config/vitest';

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
    },
  }),
);
```

- [ ] **Step 4: 创建 src/index.ts**

```ts
// Charts package exports — populated by subsequent tasks
export {};
```

- [ ] **Step 5: 在 apps/web 添加依赖**

在 `apps/web/package.json` dependencies 添加：

```json
"@health-advisor/charts": "workspace:*"
```

Run: `pnpm install`

- [ ] **Step 6: Commit**

```bash
git add packages/charts/ apps/web/package.json pnpm-lock.yaml
git commit -m "feat: create packages/charts skeleton (CHT-001)"
```

---

### Task 2: 创建 ECharts React 封装 (CHT-002)

**Files:**

- Create: `packages/charts/src/core/chart-root.tsx`
- Create: `packages/charts/src/core/types.ts`
- Create: `packages/charts/src/core/index.ts`
- Modify: `packages/charts/src/index.ts`

- [ ] **Step 1: 创建 types.ts**

```ts
import type { EChartsOption } from 'echarts';

export interface ChartRootProps {
  option: EChartsOption;
  width?: string | number;
  height?: string | number;
  className?: string;
}
```

- [ ] **Step 2: 实现 chart-root.tsx**

```tsx
import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import * as echarts from 'echarts/core';
import { LineChart, BarChart } from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { ChartRootProps } from './types';

echarts.use([
  LineChart,
  BarChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  CanvasRenderer,
]);

export const ChartRoot = forwardRef<HTMLDivElement, ChartRootProps>(
  ({ option, width = '100%', height = 300, className = '' }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<echarts.ECharts | null>(null);

    useImperativeHandle(ref, () => containerRef.current!);

    useEffect(() => {
      if (!containerRef.current) return;

      const chart = echarts.init(containerRef.current, 'dark');
      chartRef.current = chart;
      chart.setOption(option);

      const observer = new ResizeObserver(() => {
        chart.resize();
      });
      observer.observe(containerRef.current);

      return () => {
        observer.disconnect();
        chart.dispose();
        chartRef.current = null;
      };
    }, []);

    useEffect(() => {
      chartRef.current?.setOption(option, { notMerge: false });
    }, [option]);

    return <div ref={containerRef} className={className} style={{ width, height }} />;
  },
);

ChartRoot.displayName = 'ChartRoot';
```

- [ ] **Step 3: 创建 core/index.ts**

```ts
export { ChartRoot } from './chart-root';
export type { ChartRootProps } from './types';
```

- [ ] **Step 4: 更新 barrel export**

```ts
export * from './core';
```

- [ ] **Step 5: 验证 typecheck**

Run: `pnpm --filter @health-advisor/charts typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/charts/src/
git commit -m "feat: create ECharts React wrapper ChartRoot (CHT-002)"
```

---

### Task 3: 创建时间序列标准化工具 (CHT-003)

**Files:**

- Create: `packages/charts/src/utils/normalize.ts`
- Create: `packages/charts/src/utils/index.ts`
- Create: `packages/charts/src/__tests__/utils/normalize.test.ts`
- Modify: `packages/charts/src/index.ts`

- [ ] **Step 1: 编写测试**

```ts
import { describe, it, expect } from 'vitest';
import { toTimeSeries, type StandardTimeSeries } from '../../utils/normalize';

describe('toTimeSeries', () => {
  it('converts timeline points to standard time series', () => {
    const input = [
      { date: '2026-04-08', values: { 'sleep.score': 85, 'stress.load': 30 } },
      { date: '2026-04-09', values: { 'sleep.score': null, 'stress.load': 45 } },
    ];
    const result = toTimeSeries(input);
    expect(result.dates).toEqual(['2026-04-08', '2026-04-09']);
    expect(result.series['sleep.score']).toEqual([85, null]);
    expect(result.series['stress.load']).toEqual([30, 45]);
  });
});
```

- [ ] **Step 2: 实现 normalize.ts**

```ts
import type { TimelinePoint } from '@health-advisor/sandbox';

export interface StandardTimeSeries {
  dates: string[];
  series: Record<string, (number | null)[]>;
}

export function toTimeSeries(points: TimelinePoint[]): StandardTimeSeries {
  if (points.length === 0) {
    return { dates: [], series: {} };
  }

  const dates = points.map((p) => p.date);
  const metricKeys = Object.keys(points[0]?.values ?? {});

  const series: Record<string, (number | null)[]> = {};
  for (const key of metricKeys) {
    series[key] = points.map((p) => p.values[key] ?? null);
  }

  return { dates, series };
}
```

- [ ] **Step 3: 更新 barrel export 并测试**

```ts
export { toTimeSeries, type StandardTimeSeries } from './utils/normalize';
```

注意：charts 包需要在 dependencies 中添加 `@health-advisor/sandbox`：

```json
"@health-advisor/sandbox": "workspace:*"
```

```bash
pnpm install && pnpm --filter @health-advisor/charts test
git add packages/charts/
git commit -m "feat: implement time series standardization (CHT-003)"
```

---

### Task 4: 创建 option builders (CHT-004)

**Files:**

- Create: `packages/charts/src/builders/sleep.ts`
- Create: `packages/charts/src/builders/hrv.ts`
- Create: `packages/charts/src/builders/resting-hr.ts`
- Create: `packages/charts/src/builders/activity.ts`
- Create: `packages/charts/src/builders/spo2.ts`
- Create: `packages/charts/src/builders/stress.ts`
- Create: `packages/charts/src/builders/index.ts`
- Create: `packages/charts/src/__tests__/builders/index.test.ts`
- Modify: `packages/charts/src/index.ts`

- [ ] **Step 1: 创建共享 builder 工具**

创建 `packages/charts/src/builders/theme.ts`：

```ts
import type { EChartsOption } from 'echarts';

export const DARK_THEME_BASE: Partial<EChartsOption> = {
  backgroundColor: 'transparent',
  textStyle: { color: '#94a3b8', fontFamily: 'Inter, system-ui, sans-serif' },
  grid: { left: 50, right: 20, top: 30, bottom: 30 },
  tooltip: {
    trigger: 'axis',
    backgroundColor: '#1e293b',
    borderColor: '#334155',
    textStyle: { color: '#f8fafc' },
  },
};

export function lineSeries(name: string, data: (number | null)[], color: string) {
  return {
    name,
    type: 'line' as const,
    data,
    smooth: true,
    symbol: 'circle',
    symbolSize: 4,
    lineStyle: { color, width: 2 },
    itemStyle: { color },
    areaStyle: { color, opacity: 0.1 },
  };
}
```

- [ ] **Step 2: 实现 builders**

hrv.ts:

```ts
import type { EChartsOption } from 'echarts';
import type { StandardTimeSeries } from '../utils/normalize';
import { DARK_THEME_BASE, lineSeries } from './theme';
import { CHART_TOKEN_META } from '@health-advisor/shared';
import { ChartTokenId } from '@health-advisor/shared';

export function buildHrv7Days(data: StandardTimeSeries): EChartsOption {
  const meta = CHART_TOKEN_META[ChartTokenId.HRV_7DAYS];
  return {
    ...DARK_THEME_BASE,
    xAxis: { type: 'category', data: data.dates, axisLabel: { color: '#64748b' } },
    yAxis: {
      type: 'value',
      name: meta.unit,
      axisLabel: { color: '#64748b' },
      splitLine: { lineStyle: { color: '#1e293b' } },
    },
    series: [
      lineSeries(
        meta.label,
        data.series['hr']?.map((v) =>
          v ? Math.round(v.reduce((a: number, b: number) => a + b, 0) / v.length) : null,
        ) ?? [],
        meta.color,
      ),
    ],
  };
}
```

sleep.ts:

```ts
import type { EChartsOption } from 'echarts';
import type { StandardTimeSeries } from '../utils/normalize';
import { DARK_THEME_BASE, lineSeries } from './theme';
import { CHART_TOKEN_META } from '@health-advisor/shared';
import { ChartTokenId } from '@health-advisor/shared';

export function buildSleep7Days(data: StandardTimeSeries): EChartsOption {
  const meta = CHART_TOKEN_META[ChartTokenId.SLEEP_7DAYS];
  const sleepHours = (data.series['sleep.totalMinutes'] ?? []).map((v) =>
    v !== null ? Number((v / 60).toFixed(1)) : null,
  );
  return {
    ...DARK_THEME_BASE,
    xAxis: { type: 'category', data: data.dates, axisLabel: { color: '#64748b' } },
    yAxis: {
      type: 'value',
      name: meta.unit,
      axisLabel: { color: '#64748b' },
      splitLine: { lineStyle: { color: '#1e293b' } },
    },
    series: [lineSeries(meta.label, sleepHours, meta.color)],
  };
}
```

resting-hr.ts, activity.ts, spo2.ts, stress.ts: 使用相同模式，替换对应的 metric key 和 token。

创建 `packages/charts/src/builders/resting-hr.ts`：

```ts
import type { EChartsOption } from 'echarts';
import type { StandardTimeSeries } from '../utils/normalize';
import { DARK_THEME_BASE, lineSeries } from './theme';
import { CHART_TOKEN_META, ChartTokenId } from '@health-advisor/shared';

export function buildRestingHr7Days(data: StandardTimeSeries): EChartsOption {
  const meta = CHART_TOKEN_META[ChartTokenId.RESTING_HR_7DAYS];
  return {
    ...DARK_THEME_BASE,
    xAxis: { type: 'category', data: data.dates, axisLabel: { color: '#64748b' } },
    yAxis: {
      type: 'value',
      name: meta.unit,
      axisLabel: { color: '#64748b' },
      splitLine: { lineStyle: { color: '#1e293b' } },
    },
    series: [lineSeries(meta.label, data.series['hr.resting'] ?? [], meta.color)],
  };
}
```

创建 `packages/charts/src/builders/activity.ts`：

```ts
import type { EChartsOption } from 'echarts';
import type { StandardTimeSeries } from '../utils/normalize';
import { DARK_THEME_BASE, lineSeries } from './theme';
import { CHART_TOKEN_META, ChartTokenId } from '@health-advisor/shared';

export function buildActivity7Days(data: StandardTimeSeries): EChartsOption {
  const meta = CHART_TOKEN_META[ChartTokenId.ACTIVITY_7DAYS];
  return {
    ...DARK_THEME_BASE,
    xAxis: { type: 'category', data: data.dates, axisLabel: { color: '#64748b' } },
    yAxis: {
      type: 'value',
      name: meta.unit,
      axisLabel: { color: '#64748b' },
      splitLine: { lineStyle: { color: '#1e293b' } },
    },
    series: [lineSeries(meta.label, data.series['activity.steps'] ?? [], meta.color)],
  };
}
```

创建 `packages/charts/src/builders/spo2.ts`：

```ts
import type { EChartsOption } from 'echarts';
import type { StandardTimeSeries } from '../utils/normalize';
import { DARK_THEME_BASE, lineSeries } from './theme';
import { CHART_TOKEN_META, ChartTokenId } from '@health-advisor/shared';

export function buildSpo27Days(data: StandardTimeSeries): EChartsOption {
  const meta = CHART_TOKEN_META[ChartTokenId.SPO2_7DAYS];
  return {
    ...DARK_THEME_BASE,
    xAxis: { type: 'category', data: data.dates, axisLabel: { color: '#64748b' } },
    yAxis: {
      type: 'value',
      name: meta.unit,
      min: 85,
      max: 100,
      axisLabel: { color: '#64748b' },
      splitLine: { lineStyle: { color: '#1e293b' } },
    },
    series: [lineSeries(meta.label, data.series['spo2'] ?? [], meta.color)],
  };
}
```

创建 `packages/charts/src/builders/stress.ts`：

```ts
import type { EChartsOption } from 'echarts';
import type { StandardTimeSeries } from '../utils/normalize';
import { DARK_THEME_BASE, lineSeries } from './theme';
import { CHART_TOKEN_META, ChartTokenId } from '@health-advisor/shared';

export function buildStressLoad7Days(data: StandardTimeSeries): EChartsOption {
  const meta = CHART_TOKEN_META[ChartTokenId.STRESS_LOAD_7DAYS];
  return {
    ...DARK_THEME_BASE,
    xAxis: { type: 'category', data: data.dates, axisLabel: { color: '#64748b' } },
    yAxis: {
      type: 'value',
      name: meta.unit,
      min: 0,
      max: 100,
      axisLabel: { color: '#64748b' },
      splitLine: { lineStyle: { color: '#1e293b' } },
    },
    series: [lineSeries(meta.label, data.series['stress.load'] ?? [], meta.color)],
  };
}
```

- [ ] **Step 3: 创建 builders/index.ts**

```ts
export { buildHrv7Days } from './hrv';
export { buildSleep7Days } from './sleep';
export { buildRestingHr7Days } from './resting-hr';
export { buildActivity7Days } from './activity';
export { buildSpo27Days } from './spo2';
export { buildStressLoad7Days } from './stress';
```

- [ ] **Step 4: 编写 builder 测试**

```ts
import { describe, it, expect } from 'vitest';
import { buildHrv7Days } from '../../builders/hrv';
import { buildSleep7Days } from '../../builders/sleep';
import { buildStressLoad7Days } from '../../builders/stress';
import type { StandardTimeSeries } from '../../utils/normalize';

const mockData: StandardTimeSeries = {
  dates: ['2026-04-04', '2026-04-05', '2026-04-06', '2026-04-07'],
  series: {
    'stress.load': [25, 30, 22, 28],
    'sleep.totalMinutes': [420, 410, 435, 400],
  },
};

describe('buildStressLoad7Days', () => {
  it('returns valid ECharts option', () => {
    const option = buildStressLoad7Days(mockData);
    expect(option.series).toBeDefined();
    expect(option.xAxis).toBeDefined();
    expect(option.yAxis).toBeDefined();
  });
});

describe('buildSleep7Days', () => {
  it('converts minutes to hours', () => {
    const option = buildSleep7Days(mockData);
    const seriesData = (option.series as unknown as Array<{ data: number[] }>)[0]?.data;
    expect(seriesData?.[0]).toBe(7); // 420/60 = 7
  });
});
```

- [ ] **Step 5: 更新 barrel export 并测试**

```ts
export * from './builders';
```

```bash
pnpm --filter @health-advisor/charts test
git add packages/charts/src/
git commit -m "feat: implement standard chart option builders (CHT-004)"
```

---

### Task 5: 创建 micro-chart 组件 (CHT-005)

**Files:**

- Create: `packages/charts/src/micro/micro-chart.tsx`
- Create: `packages/charts/src/micro/index.ts`
- Modify: `packages/charts/src/index.ts`

- [ ] **Step 1: 实现 micro-chart.tsx**

```tsx
import { forwardRef } from 'react';
import type { EChartsOption } from 'echarts';
import { ChartRoot } from '../core/chart-root';

interface MicroChartProps {
  option: EChartsOption;
  className?: string;
}

export const MicroChart = forwardRef<HTMLDivElement, MicroChartProps>(
  ({ option, className = '' }, ref) => (
    <ChartRoot
      ref={ref}
      option={option}
      width="100%"
      height={80}
      className={`rounded-md ${className}`}
    />
  ),
);

MicroChart.displayName = 'MicroChart';
```

- [ ] **Step 2: 创建 micro/index.ts 并更新 barrel**

```ts
export { MicroChart } from './micro-chart';
```

追加到 `packages/charts/src/index.ts`：

```ts
export * from './micro';
```

- [ ] **Step 3: Commit**

```bash
git add packages/charts/src/
git commit -m "feat: implement micro-chart component (CHT-005)"
```

---

### Task 6: 创建 token registry (CHT-006)

**Files:**

- Create: `packages/charts/src/registry/token-registry.ts`
- Create: `packages/charts/src/registry/index.ts`
- Create: `packages/charts/src/__tests__/registry/token-registry.test.ts`
- Modify: `packages/charts/src/index.ts`

- [ ] **Step 1: 编写测试**

```ts
import { describe, it, expect } from 'vitest';
import { getChartBuilder } from '../../registry/token-registry';
import { ChartTokenId } from '@health-advisor/shared';

describe('getChartBuilder', () => {
  it('returns builder for known token', () => {
    const builder = getChartBuilder(ChartTokenId.HRV_7DAYS);
    expect(builder).toBeDefined();
    expect(typeof builder).toBe('function');
  });

  it('returns builder for all tokens', () => {
    for (const tokenId of Object.values(ChartTokenId)) {
      const builder = getChartBuilder(tokenId);
      expect(builder).toBeDefined();
    }
  });
});
```

- [ ] **Step 2: 实现 token-registry.ts**

```ts
import type { EChartsOption } from 'echarts';
import type { StandardTimeSeries } from '../utils/normalize';
import { ChartTokenId } from '@health-advisor/shared';
import { buildHrv7Days } from '../builders/hrv';
import { buildSleep7Days } from '../builders/sleep';
import { buildRestingHr7Days } from '../builders/resting-hr';
import { buildActivity7Days } from '../builders/activity';
import { buildSpo27Days } from '../builders/spo2';
import { buildStressLoad7Days } from '../builders/stress';

export type ChartBuilder = (data: StandardTimeSeries) => EChartsOption;

const registry: Partial<Record<ChartTokenId, ChartBuilder>> = {
  [ChartTokenId.HRV_7DAYS]: buildHrv7Days,
  [ChartTokenId.SLEEP_7DAYS]: buildSleep7Days,
  [ChartTokenId.RESTING_HR_7DAYS]: buildRestingHr7Days,
  [ChartTokenId.ACTIVITY_7DAYS]: buildActivity7Days,
  [ChartTokenId.SPO2_7DAYS]: buildSpo27Days,
  [ChartTokenId.STRESS_LOAD_7DAYS]: buildStressLoad7Days,
};

export function getChartBuilder(tokenId: ChartTokenId): ChartBuilder | undefined {
  return registry[tokenId];
}
```

注意：`SLEEP_STAGE_LAST_NIGHT` 和 `HRV_SLEEP_14DAYS_COMPARE` 需要更复杂的 builder，暂时不在 registry 中注册（标记为 TODO，后续 Wave 实现）。

- [ ] **Step 3: 创建 registry/index.ts 并更新 barrel**

```ts
export { getChartBuilder, type ChartBuilder } from './token-registry';
```

追加到 `packages/charts/src/index.ts`：

```ts
export * from './registry';
```

- [ ] **Step 4: 运行测试并 commit**

```bash
pnpm --filter @health-advisor/charts test
git add packages/charts/src/
git commit -m "feat: implement chart token registry (CHT-006)"
```

---

### Task 7: 最终验证

- [ ] **Step 1: 全局构建**

Run: `pnpm build && pnpm lint && pnpm typecheck && pnpm test && pnpm format:check`
Expected: 全部 PASS
