# Wave 0 修复 + Wave 1 Shared Package 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补齐 Wave 0 遗留缺陷（config 包、coverage、CI），然后冻结 Wave 1 共享协议包。

**Architecture:** Config 包导出共享 ESLint/Prettier/Vitest/TS 配置供 monorepo 消费；Shared 包定义所有跨模块类型、Zod schema、常量和工具函数，作为 Agent/Backend/Frontend 的唯一类型来源。

**Tech Stack:** TypeScript 5.7+, Zod, Vitest 3.x, ESLint 9 (flat config), Prettier, Turborepo

---

## Phase 1: Wave 0 修复

### Task 1: 完善 packages/config — 导出共享配置 (OTH-004)

**Files:**
- Create: `packages/config/tsconfig.react.json`
- Create: `packages/config/tsconfig.node.json`
- Create: `packages/config/eslint.config.base.mjs`
- Create: `packages/config/prettier.config.base.mjs`
- Create: `packages/config/vitest.config.base.ts`
- Modify: `packages/config/package.json`
- Modify: `apps/web/tsconfig.json`
- Modify: `apps/agent-api/tsconfig.json`
- Modify: `eslint.config.mjs`
- Modify: `prettier.config.mjs`
- Modify: `apps/web/vitest.config.ts`

- [ ] **Step 1: 更新 packages/config/package.json**

```json
{
  "name": "@health-advisor/config",
  "version": "0.0.0",
  "private": true,
  "exports": {
    "./tsconfig.react.json": "./tsconfig.react.json",
    "./tsconfig.node.json": "./tsconfig.node.json",
    "./eslint": "./eslint.config.base.mjs",
    "./prettier": "./prettier.config.base.mjs",
    "./vitest": "./vitest.config.base.ts"
  }
}
```

- [ ] **Step 2: 创建 tsconfig.react.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "esnext",
    "moduleResolution": "bundler",
    "target": "es2022",
    "lib": ["dom", "dom.iterable", "es2022"],
    "jsx": "preserve",
    "noEmit": true,
    "allowJs": true,
    "incremental": true
  }
}
```

- [ ] **Step 3: 创建 tsconfig.node.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "target": "es2022",
    "lib": ["es2022"]
  }
}
```

- [ ] **Step 4: 创建 eslint.config.base.mjs**

将当前根级 `eslint.config.mjs` 的内容提取为可复用基础配置：

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettierConfig,
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/next-env.d.ts',
    ],
  },
);
```

- [ ] **Step 5: 创建 prettier.config.base.mjs**

```js
export default {
  semi: true,
  singleQuote: true,
  trailingComma: 'all',
  printWidth: 100,
  tabWidth: 2,
};
```

- [ ] **Step 6: 创建 vitest.config.base.ts**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['**/node_modules/**', '**/e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      thresholds: {
        lines: 80,
        branches: 80,
        functions: 80,
        statements: 80,
      },
    },
  },
});
```

- [ ] **Step 7: 更新根级 eslint.config.mjs 引用 config 包**

```js
import baseConfig from '@health-advisor/config/eslint';

export default baseConfig;
```

- [ ] **Step 8: 更新根级 prettier.config.mjs 引用 config 包**

```js
import baseConfig from '@health-advisor/config/prettier';

export default baseConfig;
```

- [ ] **Step 9: 更新 apps/web/vitest.config.ts 引用 config 包**

```ts
import { defineConfig, mergeConfig } from 'vitest/config';
import baseConfig from '@health-advisor/config/vitest';

export default mergeConfig(
  baseConfig,
  defineConfig({
    // web 包的专属覆盖
  }),
);
```

- [ ] **Step 10: 更新 apps/web/tsconfig.json 引用 config 包**

```json
{
  "extends": "@health-advisor/config/tsconfig.react.json",
  "compilerOptions": {
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "src", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 11: 更新 apps/agent-api/tsconfig.json 引用 config 包**

```json
{
  "extends": "@health-advisor/config/tsconfig.node.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 12: 创建 apps/agent-api/vitest.config.ts**

```ts
import { defineConfig, mergeConfig } from 'vitest/config';
import baseConfig from '@health-advisor/config/vitest';

export default mergeConfig(
  baseConfig,
  defineConfig({
    // agent-api 包的专属覆盖
  }),
);
```

- [ ] **Step 13: 验证所有命令通过**

Run: `pnpm install && pnpm build && pnpm lint && pnpm typecheck && pnpm test && pnpm format:check`
Expected: 全部 PASS

- [ ] **Step 14: Commit**

```bash
git add packages/config/ apps/web/tsconfig.json apps/web/vitest.config.ts apps/agent-api/tsconfig.json apps/agent-api/vitest.config.ts eslint.config.mjs prettier.config.mjs
git commit -m "feat: complete packages/config with shared ESLint/Prettier/Vitest/TS configs"
```

---

### Task 2: 添加 CI skeleton (OTH-014)

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: 创建 CI workflow**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'
          cache: 'pnpm'

      - run: pnpm install --frozen-lockfile

      - run: pnpm typecheck

      - run: pnpm lint

      - run: pnpm test

      - run: pnpm build
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add GitHub Actions CI pipeline (typecheck/lint/test/build)"
```

---

## Phase 2: Shared Package

### Task 3: 创建 packages/shared 骨架 (SHR-001)

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/vitest.config.ts`
- Create: `packages/shared/src/index.ts`

- [ ] **Step 1: 创建 package.json**

```json
{
  "name": "@health-advisor/shared",
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
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "typescript": "^5.7.0",
    "vitest": "^3.1.0"
  }
}
```

- [ ] **Step 2: 创建 tsconfig.json**

```json
{
  "extends": "@health-advisor/config/tsconfig.node.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
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
  defineConfig({}),
);
```

- [ ] **Step 4: 创建 src/index.ts (空 barrel)**

```ts
// Phase 2 tasks will populate exports
export {};
```

- [ ] **Step 5: 安装依赖并验证**

Run: `pnpm install && pnpm --filter @health-advisor/shared typecheck`
Expected: PASS

- [ ] **Step 6: 验证 agent-api 可导入 shared**

在 `apps/agent-api/package.json` 添加依赖：

```json
"dependencies": {
  "@health-advisor/shared": "workspace:*",
  ...
}
```

Run: `pnpm install && pnpm --filter @health-advisor/agent-api typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/shared/ apps/agent-api/package.json pnpm-lock.yaml
git commit -m "feat: create packages/shared skeleton (SHR-001)"
```

---

### Task 4: 定义 sandbox 类型 (SHR-002)

**Files:**
- Create: `packages/shared/src/types/sandbox.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: 创建 sandbox 类型文件**

```ts
export interface BaselineMetrics {
  restingHr: number;
  hrv: number;
  spo2: number;
  avgSleepMinutes: number;
  avgSteps: number;
}

export interface SandboxProfile {
  profileId: string;
  name: string;
  age: number;
  gender: 'male' | 'female';
  avatar: string;
  baseline: BaselineMetrics;
}

export interface SleepStages {
  deep: number;
  light: number;
  rem: number;
  awake: number;
}

export interface SleepData {
  totalMinutes: number;
  startTime: string;
  endTime: string;
  stages: SleepStages;
  score: number;
}

export interface ActivityData {
  steps: number;
  calories: number;
  activeMinutes: number;
  distanceKm: number;
}

export interface StressData {
  load: number;
}

export interface DailyRecord {
  date: string;
  hr?: number[];
  sleep?: SleepData;
  activity?: ActivityData;
  spo2?: number;
  stress?: StressData;
}

export interface VitalSignsData {
  restingHr: number;
  hrv: number;
  spo2: number;
  stressLoad: number;
}

export interface ProfileData {
  profile: SandboxProfile;
  records: DailyRecord[];
}
```

- [ ] **Step 2: 更新 barrel export**

在 `packages/shared/src/index.ts` 中追加：

```ts
export type {
  BaselineMetrics,
  SandboxProfile,
  SleepStages,
  SleepData,
  ActivityData,
  StressData,
  DailyRecord,
  VitalSignsData,
  ProfileData,
} from './types/sandbox';
```

- [ ] **Step 3: 验证类型导出**

Run: `pnpm --filter @health-advisor/shared typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/types/sandbox.ts packages/shared/src/index.ts
git commit -m "feat: define sandbox TypeScript types (SHR-002)"
```

---

### Task 5: 定义 agent 类型 (SHR-003)

**Files:**
- Create: `packages/shared/src/types/agent.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: 创建 agent 类型文件**

```ts
export enum AgentTaskType {
  HOMEPAGE_SUMMARY = 'homepage_summary',
  VIEW_SUMMARY = 'view_summary',
  ADVISOR_CHAT = 'advisor_chat',
}

export type DataTab =
  | 'hrv'
  | 'sleep'
  | 'resting-hr'
  | 'activity'
  | 'spo2'
  | 'stress';

export type Timeframe = 'day' | 'week' | 'month' | 'year';

export interface PageContext {
  profileId: string;
  page: string;
  dataTab?: DataTab;
  timeframe: Timeframe;
}

// 注意：ChartTokenId 在 chart-token.ts 中定义，此处通过 import 引用
import type { ChartTokenId } from './chart-token';

export interface AgentResponseEnvelope {
  summary: string;
  chartTokens: ChartTokenId[];
  microTips: string[];
  meta: {
    taskType: AgentTaskType;
    pageContext: PageContext;
    finishReason: 'complete' | 'fallback' | 'timeout';
  };
}
```

- [ ] **Step 2: 更新 barrel export**

追加到 `packages/shared/src/index.ts`：

```ts
export {
  AgentTaskType,
} from './types/agent';

export type {
  DataTab,
  Timeframe,
  PageContext,
  AgentResponseEnvelope,
} from './types/agent';
```

- [ ] **Step 3: 验证**

Run: `pnpm --filter @health-advisor/shared typecheck`
Expected: PASS（注意：此时 chart-token.ts 尚未创建，需先创建空文件或调整导入）

为了避免循环依赖问题，先在 Task 6 创建 chart-token.ts。本 Task 的 agent.ts 暂时去掉 `ChartTokenId` 导入，使用 `string[]` 替代：

```ts
export interface AgentResponseEnvelope {
  summary: string;
  chartTokens: string[];
  microTips: string[];
  meta: {
    taskType: AgentTaskType;
    pageContext: PageContext;
    finishReason: 'complete' | 'fallback' | 'timeout';
  };
}
```

在 Task 6 完成后再将 `chartTokens` 改为 `ChartTokenId[]`。

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/types/agent.ts packages/shared/src/index.ts
git commit -m "feat: define agent request/response types (SHR-003)"
```

---

### Task 6: 定义 chart token 类型 (SHR-004)

**Files:**
- Create: `packages/shared/src/types/chart-token.ts`
- Modify: `packages/shared/src/types/agent.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: 创建 chart token 类型文件**

```ts
export enum ChartTokenId {
  HRV_7DAYS = 'HRV_7DAYS',
  SLEEP_7DAYS = 'SLEEP_7DAYS',
  RESTING_HR_7DAYS = 'RESTING_HR_7DAYS',
  ACTIVITY_7DAYS = 'ACTIVITY_7DAYS',
  SPO2_7DAYS = 'SPO2_7DAYS',
  SLEEP_STAGE_LAST_NIGHT = 'SLEEP_STAGE_LAST_NIGHT',
  STRESS_LOAD_7DAYS = 'STRESS_LOAD_7DAYS',
  HRV_SLEEP_14DAYS_COMPARE = 'HRV_SLEEP_14DAYS_COMPARE',
}
```

- [ ] **Step 2: 更新 agent.ts 的 chartTokens 类型**

将 `agent.ts` 中的 `chartTokens: string[]` 改为：

```ts
import type { ChartTokenId } from './chart-token';

export interface AgentResponseEnvelope {
  summary: string;
  chartTokens: ChartTokenId[];
  microTips: string[];
  meta: {
    taskType: AgentTaskType;
    pageContext: PageContext;
    finishReason: 'complete' | 'fallback' | 'timeout';
  };
}
```

- [ ] **Step 3: 更新 barrel export**

追加到 `packages/shared/src/index.ts`：

```ts
export { ChartTokenId } from './types/chart-token';
```

- [ ] **Step 4: 验证**

Run: `pnpm --filter @health-advisor/shared typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/types/chart-token.ts packages/shared/src/types/agent.ts packages/shared/src/index.ts
git commit -m "feat: define chart token enum (SHR-004)"
```

---

### Task 7: 定义 god-mode DTOs (SHR-005)

**Files:**
- Create: `packages/shared/src/types/god-mode.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: 创建 god-mode 类型文件**

```ts
export interface ProfileSwitchPayload {
  profileId: string;
}

export interface EventInjectPayload {
  eventType: string;
  data: Record<string, unknown>;
  timestamp?: string;
}

export interface MetricOverridePayload {
  metric: string;
  value: unknown;
  dateRange?: { start: string; end: string };
}

export interface ResetPayload {
  scope: 'profile' | 'events' | 'overrides' | 'all';
}

export interface ScenarioPayload {
  scenarioId: string;
  params?: Record<string, unknown>;
}

export type GodModeAction =
  | { type: 'profile_switch'; payload: ProfileSwitchPayload }
  | { type: 'event_inject'; payload: EventInjectPayload }
  | { type: 'metric_override'; payload: MetricOverridePayload }
  | { type: 'reset'; payload: ResetPayload }
  | { type: 'scenario'; payload: ScenarioPayload };
```

- [ ] **Step 2: 更新 barrel export**

追加到 `packages/shared/src/index.ts`：

```ts
export type {
  ProfileSwitchPayload,
  EventInjectPayload,
  MetricOverridePayload,
  ResetPayload,
  ScenarioPayload,
  GodModeAction,
} from './types/god-mode';
```

- [ ] **Step 3: 验证**

Run: `pnpm --filter @health-advisor/shared typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/types/god-mode.ts packages/shared/src/index.ts
git commit -m "feat: define god-mode DTOs (SHR-005)"
```

---

### Task 8: 定义 API envelope 和 error codes (SHR-006)

**Files:**
- Create: `packages/shared/src/types/api.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: 创建 API 类型文件**

```ts
export enum ErrorCode {
  UNKNOWN = 'UNKNOWN',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  PROFILE_NOT_FOUND = 'PROFILE_NOT_FOUND',
  AGENT_TIMEOUT = 'AGENT_TIMEOUT',
  AGENT_FALLBACK = 'AGENT_FALLBACK',
  RATE_LIMITED = 'RATE_LIMITED',
}

export interface ApiMeta {
  timestamp: string;
  requestId: string;
  durationMs: number;
}

export interface ApiError {
  code: ErrorCode;
  message: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: ApiError | null;
  meta: ApiMeta;
}

export function createSuccessResponse<T>(data: T, meta: ApiMeta): ApiResponse<T> {
  return { success: true, data, error: null, meta };
}

export function createErrorResponse<T = never>(
  code: ErrorCode,
  message: string,
  meta: ApiMeta,
): ApiResponse<T> {
  return { success: false, data: null, error: { code, message }, meta };
}
```

- [ ] **Step 2: 更新 barrel export**

追加到 `packages/shared/src/index.ts`：

```ts
export { ErrorCode } from './types/api';
export type { ApiMeta, ApiError, ApiResponse } from './types/api';
export { createSuccessResponse, createErrorResponse } from './types/api';
```

- [ ] **Step 3: 验证**

Run: `pnpm --filter @health-advisor/shared typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/types/api.ts packages/shared/src/index.ts
git commit -m "feat: define API envelope and error codes (SHR-006)"
```

---

### Task 9: 定义 stress view model (SHR-010)

**Files:**
- Create: `packages/shared/src/types/stress.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: 创建 stress 类型文件**

```ts
export interface StressTimelinePoint {
  date: string;
  stressLoadScore: number;
  contributors: {
    hrv: number;
    sleep: number;
    activity: number;
  };
}

export type StressTrend = 'improving' | 'stable' | 'declining';

export interface StressSummaryStats {
  average: number;
  max: number;
  min: number;
  trend: StressTrend;
}

export interface StressTimelineResponse {
  points: StressTimelinePoint[];
  summary: StressSummaryStats;
}
```

- [ ] **Step 2: 更新 barrel export**

追加到 `packages/shared/src/index.ts`：

```ts
export type {
  StressTimelinePoint,
  StressTrend,
  StressSummaryStats,
  StressTimelineResponse,
} from './types/stress';
```

- [ ] **Step 3: 验证**

Run: `pnpm --filter @health-advisor/shared typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/types/stress.ts packages/shared/src/index.ts
git commit -m "feat: define stress view model and types (SHR-010)"
```

---

### Task 10: 创建 Zod schemas (SHR-007)

**Files:**
- Create: `packages/shared/src/schemas/sandbox.ts`
- Create: `packages/shared/src/schemas/agent.ts`
- Create: `packages/shared/src/schemas/chart-token.ts`
- Create: `packages/shared/src/schemas/god-mode.ts`
- Create: `packages/shared/src/schemas/api.ts`
- Create: `packages/shared/src/schemas/stress.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: 创建 sandbox schema**

```ts
import { z } from 'zod';

export const BaselineMetricsSchema = z.object({
  restingHr: z.number().min(30).max(200),
  hrv: z.number().min(0).max(200),
  spo2: z.number().min(80).max(100),
  avgSleepMinutes: z.number().min(0).max(1440),
  avgSteps: z.number().min(0).max(100000),
});

export const SandboxProfileSchema = z.object({
  profileId: z.string().min(1),
  name: z.string().min(1),
  age: z.number().int().min(1).max(150),
  gender: z.enum(['male', 'female']),
  avatar: z.string().min(1),
  baseline: BaselineMetricsSchema,
});

export const SleepStagesSchema = z.object({
  deep: z.number().min(0),
  light: z.number().min(0),
  rem: z.number().min(0),
  awake: z.number().min(0),
});

export const SleepDataSchema = z.object({
  totalMinutes: z.number().min(0).max(1440),
  startTime: z.string(),
  endTime: z.string(),
  stages: SleepStagesSchema,
  score: z.number().min(0).max(100),
});

export const ActivityDataSchema = z.object({
  steps: z.number().min(0),
  calories: z.number().min(0),
  activeMinutes: z.number().min(0),
  distanceKm: z.number().min(0),
});

export const StressDataSchema = z.object({
  load: z.number().min(0).max(100),
});

export const DailyRecordSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hr: z.array(z.number().min(30).max(220)).optional(),
  sleep: SleepDataSchema.optional(),
  activity: ActivityDataSchema.optional(),
  spo2: z.number().min(80).max(100).optional(),
  stress: StressDataSchema.optional(),
});

export const ProfileDataSchema = z.object({
  profile: SandboxProfileSchema,
  records: z.array(DailyRecordSchema),
});
```

- [ ] **Step 2: 创建 agent schema**

```ts
import { z } from 'zod';
import { ChartTokenIdSchema } from './chart-token';

export const AgentTaskTypeSchema = z.nativeEnum({
  HOMEPAGE_SUMMARY: 'homepage_summary',
  VIEW_SUMMARY: 'view_summary',
  ADVISOR_CHAT: 'advisor_chat',
} as const);

export const DataTabSchema = z.enum([
  'hrv',
  'sleep',
  'resting-hr',
  'activity',
  'spo2',
  'stress',
]);

export const TimeframeSchema = z.enum(['day', 'week', 'month', 'year']);

export const PageContextSchema = z.object({
  profileId: z.string().min(1),
  page: z.string().min(1),
  dataTab: DataTabSchema.optional(),
  timeframe: TimeframeSchema,
});

export const AgentResponseEnvelopeSchema = z.object({
  summary: z.string().min(1),
  chartTokens: z.array(ChartTokenIdSchema),
  microTips: z.array(z.string()),
  meta: z.object({
    taskType: AgentTaskTypeSchema,
    pageContext: PageContextSchema,
    finishReason: z.enum(['complete', 'fallback', 'timeout']),
  }),
});
```

- [ ] **Step 3: 创建 chart-token schema**

```ts
import { z } from 'zod';
import { ChartTokenId } from '../types/chart-token';

export const ChartTokenIdSchema = z.nativeEnum(ChartTokenId);

export const CHART_TOKEN_IDS = Object.values(ChartTokenId) as string[];

export function isValidChartTokenId(value: string): value is ChartTokenId {
  return CHART_TOKEN_IDS.includes(value);
}
```

- [ ] **Step 4: 创建 god-mode schema**

```ts
import { z } from 'zod';

export const ProfileSwitchPayloadSchema = z.object({
  profileId: z.string().min(1),
});

export const EventInjectPayloadSchema = z.object({
  eventType: z.string().min(1),
  data: z.record(z.unknown()),
  timestamp: z.string().optional(),
});

export const MetricOverridePayloadSchema = z.object({
  metric: z.string().min(1),
  value: z.unknown(),
  dateRange: z
    .object({
      start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    })
    .optional(),
});

export const ResetPayloadSchema = z.object({
  scope: z.enum(['profile', 'events', 'overrides', 'all']),
});

export const ScenarioPayloadSchema = z.object({
  scenarioId: z.string().min(1),
  params: z.record(z.unknown()).optional(),
});
```

- [ ] **Step 5: 创建 api schema**

```ts
import { z } from 'zod';
import { ErrorCode } from '../types/api';

export const ErrorCodeSchema = z.nativeEnum(ErrorCode);

export const ApiMetaSchema = z.object({
  timestamp: z.string(),
  requestId: z.string(),
  durationMs: z.number().min(0),
});

export const ApiErrorSchema = z.object({
  code: ErrorCodeSchema,
  message: z.string(),
});

export function ApiResponseSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    success: z.boolean(),
    data: dataSchema.nullable(),
    error: ApiErrorSchema.nullable(),
    meta: ApiMetaSchema,
  });
}
```

- [ ] **Step 6: 创建 stress schema**

```ts
import { z } from 'zod';

export const StressTimelinePointSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  stressLoadScore: z.number().min(0).max(100),
  contributors: z.object({
    hrv: z.number().min(0).max(100),
    sleep: z.number().min(0).max(100),
    activity: z.number().min(0).max(100),
  }),
});

export const StressTrendSchema = z.enum(['improving', 'stable', 'declining']);

export const StressSummaryStatsSchema = z.object({
  average: z.number().min(0).max(100),
  max: z.number().min(0).max(100),
  min: z.number().min(0).max(100),
  trend: StressTrendSchema,
});

export const StressTimelineResponseSchema = z.object({
  points: z.array(StressTimelinePointSchema),
  summary: StressSummaryStatsSchema,
});
```

- [ ] **Step 7: 更新 barrel export**

追加到 `packages/shared/src/index.ts`：

```ts
// Schemas
export {
  BaselineMetricsSchema,
  SandboxProfileSchema,
  SleepStagesSchema,
  SleepDataSchema,
  ActivityDataSchema,
  StressDataSchema,
  DailyRecordSchema,
  ProfileDataSchema,
} from './schemas/sandbox';

export {
  AgentTaskTypeSchema,
  DataTabSchema,
  TimeframeSchema,
  PageContextSchema,
  AgentResponseEnvelopeSchema,
} from './schemas/agent';

export { ChartTokenIdSchema, isValidChartTokenId } from './schemas/chart-token';

export {
  ProfileSwitchPayloadSchema,
  EventInjectPayloadSchema,
  MetricOverridePayloadSchema,
  ResetPayloadSchema,
  ScenarioPayloadSchema,
} from './schemas/god-mode';

export { ErrorCodeSchema, ApiMetaSchema, ApiErrorSchema, ApiResponseSchema } from './schemas/api';

export {
  StressTimelinePointSchema,
  StressTrendSchema,
  StressSummaryStatsSchema,
  StressTimelineResponseSchema,
} from './schemas/stress';
```

- [ ] **Step 8: 验证**

Run: `pnpm --filter @health-advisor/shared typecheck`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add packages/shared/src/schemas/ packages/shared/src/index.ts
git commit -m "feat: add Zod schemas for all shared types (SHR-007)"
```

---

### Task 11: 创建常量和工具函数 (SHR-008)

**Files:**
- Create: `packages/shared/src/constants/status-colors.ts`
- Create: `packages/shared/src/constants/chart-tokens.ts`
- Create: `packages/shared/src/constants/timeframes.ts`
- Create: `packages/shared/src/constants/index.ts`
- Create: `packages/shared/src/utils/date-range.ts`
- Create: `packages/shared/src/utils/timeframe.ts`
- Create: `packages/shared/src/utils/chart-token.ts`
- Create: `packages/shared/src/utils/page-context.ts`
- Create: `packages/shared/src/utils/index.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: 创建 status-colors.ts**

```ts
export type StatusLevel = 'good' | 'warning' | 'alert' | 'neutral';

export const STATUS_COLORS: Record<StatusLevel, string> = {
  good: '#22c55e',
  warning: '#f59e0b',
  alert: '#ef4444',
  neutral: '#6b7280',
} as const;

export function getStatusColor(value: number, thresholds: { good: number; warning: number }): StatusLevel {
  if (value >= thresholds.good) return 'good';
  if (value >= thresholds.warning) return 'warning';
  return 'alert';
}
```

- [ ] **Step 2: 创建 chart-tokens.ts**

```ts
import { ChartTokenId } from '../types/chart-token';

export interface ChartTokenMeta {
  id: ChartTokenId;
  label: string;
  unit: string;
  color: string;
}

export const CHART_TOKEN_META: Record<ChartTokenId, ChartTokenMeta> = {
  [ChartTokenId.HRV_7DAYS]: { id: ChartTokenId.HRV_7DAYS, label: 'HRV 趋势', unit: 'ms', color: '#8b5cf6' },
  [ChartTokenId.SLEEP_7DAYS]: { id: ChartTokenId.SLEEP_7DAYS, label: '睡眠趋势', unit: 'h', color: '#3b82f6' },
  [ChartTokenId.RESTING_HR_7DAYS]: { id: ChartTokenId.RESTING_HR_7DAYS, label: '静息心率', unit: 'bpm', color: '#ef4444' },
  [ChartTokenId.ACTIVITY_7DAYS]: { id: ChartTokenId.ACTIVITY_7DAYS, label: '活动趋势', unit: '步', color: '#22c55e' },
  [ChartTokenId.SPO2_7DAYS]: { id: ChartTokenId.SPO2_7DAYS, label: '血氧趋势', unit: '%', color: '#06b6d4' },
  [ChartTokenId.SLEEP_STAGE_LAST_NIGHT]: { id: ChartTokenId.SLEEP_STAGE_LAST_NIGHT, label: '昨晚睡眠阶段', unit: '', color: '#6366f1' },
  [ChartTokenId.STRESS_LOAD_7DAYS]: { id: ChartTokenId.STRESS_LOAD_7DAYS, label: '压力负荷', unit: '分', color: '#f97316' },
  [ChartTokenId.HRV_SLEEP_14DAYS_COMPARE]: { id: ChartTokenId.HRV_SLEEP_14DAYS_COMPARE, label: 'HRV-睡眠对比', unit: '', color: '#a855f7' },
};

export function getChartTokenMeta(id: ChartTokenId): ChartTokenMeta {
  return CHART_TOKEN_META[id];
}
```

- [ ] **Step 3: 创建 timeframes.ts**

```ts
import type { Timeframe } from '../types/agent';

export interface TimeframeConfig {
  label: string;
  days: number;
}

export const TIMEFRAME_CONFIGS: Record<Timeframe, TimeframeConfig> = {
  day: { label: '今日', days: 1 },
  week: { label: '近 7 天', days: 7 },
  month: { label: '近 30 天', days: 30 },
  year: { label: '近一年', days: 365 },
};
```

- [ ] **Step 4: 创建 constants/index.ts**

```ts
export { STATUS_COLORS, getStatusColor } from './status-colors';
export type { StatusLevel } from './status-colors';
export { CHART_TOKEN_META, getChartTokenMeta } from './chart-tokens';
export type { ChartTokenMeta } from './chart-tokens';
export { TIMEFRAME_CONFIGS } from './timeframes';
export type { TimeframeConfig } from './timeframes';
```

- [ ] **Step 5: 创建 utils/date-range.ts**

```ts
export interface DateRange {
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD
}

export function getDateRange(days: number, referenceDate?: string): DateRange {
  const ref = referenceDate ? new Date(referenceDate) : new Date();
  const end = ref.toISOString().split('T')[0]!;
  const startDate = new Date(ref);
  startDate.setDate(startDate.getDate() - days + 1);
  const start = startDate.toISOString().split('T')[0]!;
  return { start, end };
}

export function isDateInRange(date: string, range: DateRange): boolean {
  return date >= range.start && date <= range.end;
}

export function generateDateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const current = new Date(start);
  const endDate = new Date(end);
  while (current <= endDate) {
    dates.push(current.toISOString().split('T')[0]!);
    current.setDate(current.getDate() + 1);
  }
  return dates;
}
```

- [ ] **Step 6: 创建 utils/timeframe.ts**

```ts
import type { Timeframe } from '../types/agent';
import { TIMEFRAME_CONFIGS } from '../constants/timeframes';
import { getDateRange, type DateRange } from './date-range';

export function timeframeToDateRange(timeframe: Timeframe, referenceDate?: string): DateRange {
  const config = TIMEFRAME_CONFIGS[timeframe];
  return getDateRange(config.days, referenceDate);
}
```

- [ ] **Step 7: 创建 utils/chart-token.ts**

```ts
import { ChartTokenId } from '../types/chart-token';
import { ChartTokenIdSchema, isValidChartTokenId } from '../schemas/chart-token';

export function parseChartTokenId(value: string): ChartTokenId | null {
  const result = ChartTokenIdSchema.safeParse(value);
  return result.success ? result.data : null;
}

export function assertChartTokenId(value: string): asserts value is ChartTokenId {
  if (!isValidChartTokenId(value)) {
    throw new Error(`Invalid chart token ID: ${value}`);
  }
}
```

- [ ] **Step 8: 创建 utils/page-context.ts**

```ts
import type { PageContext, Timeframe } from '../types/agent';
import { PageContextSchema } from '../schemas/agent';

export function createPageContext(
  profileId: string,
  page: string,
  timeframe: Timeframe = 'week',
  dataTab?: string,
): PageContext {
  const ctx: PageContext = {
    profileId,
    page,
    timeframe,
    ...(dataTab ? { dataTab: dataTab as PageContext['dataTab'] } : {}),
  };
  return PageContextSchema.parse(ctx);
}
```

- [ ] **Step 9: 创建 utils/index.ts**

```ts
export { getDateRange, isDateInRange, generateDateRange, type DateRange } from './date-range';
export { timeframeToDateRange } from './timeframe';
export { parseChartTokenId, assertChartTokenId } from './chart-token';
export { createPageContext } from './page-context';
```

- [ ] **Step 10: 更新 barrel export**

追加到 `packages/shared/src/index.ts`：

```ts
// Constants
export * from './constants';

// Utils
export * from './utils';
```

- [ ] **Step 11: 验证**

Run: `pnpm --filter @health-advisor/shared typecheck`
Expected: PASS

- [ ] **Step 12: Commit**

```bash
git add packages/shared/src/constants/ packages/shared/src/utils/ packages/shared/src/index.ts
git commit -m "feat: add shared constants and utility functions (SHR-008)"
```

---

### Task 12: 编写 shared 包单元测试 (SHR-009)

**Files:**
- Create: `packages/shared/src/__tests__/schemas.test.ts`
- Create: `packages/shared/src/__tests__/utils.test.ts`

- [ ] **Step 1: 编写 schema 测试**

```ts
import { describe, it, expect } from 'vitest';
import {
  SandboxProfileSchema,
  DailyRecordSchema,
  ProfileDataSchema,
  SleepDataSchema,
} from '../schemas/sandbox';
import { ChartTokenIdSchema, isValidChartTokenId } from '../schemas/chart-token';
import { AgentResponseEnvelopeSchema } from '../schemas/agent';
import { ErrorCodeSchema, ApiResponseSchema } from '../schemas/api';
import { ErrorCode } from '../types/api';
import { ChartTokenId } from '../types/chart-token';

describe('SandboxProfileSchema', () => {
  const validProfile = {
    profileId: 'profile-a',
    name: '张健康',
    age: 32,
    gender: 'male',
    avatar: '👨‍💻',
    baseline: { restingHr: 62, hrv: 58, spo2: 98, avgSleepMinutes: 420, avgSteps: 8500 },
  };

  it('accepts valid profile', () => {
    expect(SandboxProfileSchema.parse(validProfile)).toEqual(validProfile);
  });

  it('rejects missing required fields', () => {
    expect(() => SandboxProfileSchema.parse({})).toThrow();
  });

  it('rejects invalid gender', () => {
    expect(() => SandboxProfileSchema.parse({ ...validProfile, gender: 'other' })).toThrow();
  });
});

describe('DailyRecordSchema', () => {
  it('accepts record with all optional fields', () => {
    const record = {
      date: '2026-04-03',
      hr: [62, 58, 65],
      sleep: { totalMinutes: 420, startTime: '23:00', endTime: '06:00', stages: { deep: 90, light: 180, rem: 120, awake: 30 }, score: 85 },
      activity: { steps: 8500, calories: 2200, activeMinutes: 45, distanceKm: 6.2 },
      spo2: 98,
      stress: { load: 35 },
    };
    expect(DailyRecordSchema.parse(record)).toEqual(record);
  });

  it('accepts record with only date', () => {
    expect(DailyRecordSchema.parse({ date: '2026-04-03' })).toEqual({ date: '2026-04-03' });
  });

  it('rejects invalid date format', () => {
    expect(() => DailyRecordSchema.parse({ date: '04-03-2026' })).toThrow();
  });
});

describe('ChartTokenIdSchema', () => {
  it('accepts valid token IDs', () => {
    Object.values(ChartTokenId).forEach((id) => {
      expect(ChartTokenIdSchema.parse(id)).toBe(id);
    });
  });

  it('rejects invalid token ID', () => {
    expect(() => ChartTokenIdSchema.parse('INVALID_TOKEN')).toThrow();
  });
});

describe('isValidChartTokenId', () => {
  it('returns true for valid tokens', () => {
    expect(isValidChartTokenId('HRV_7DAYS')).toBe(true);
  });

  it('returns false for invalid tokens', () => {
    expect(isValidChartTokenId('NOT_REAL')).toBe(false);
  });
});

describe('ApiResponseSchema', () => {
  it('validates success response', () => {
    const schema = ApiResponseSchema(z.string());
    const response = {
      success: true,
      data: 'hello',
      error: null,
      meta: { timestamp: '2026-04-10T00:00:00Z', requestId: 'req-1', durationMs: 100 },
    };
    expect(schema.parse(response)).toEqual(response);
  });

  it('validates error response', () => {
    const schema = ApiResponseSchema(z.string());
    const response = {
      success: false,
      data: null,
      error: { code: ErrorCode.NOT_FOUND, message: 'Not found' },
      meta: { timestamp: '2026-04-10T00:00:00Z', requestId: 'req-2', durationMs: 50 },
    };
    expect(schema.parse(response)).toEqual(response);
  });
});
```

注意：需要在文件头部 import z for ApiResponseSchema 测试：

```ts
import { z } from 'zod';
```

- [ ] **Step 2: 编写 utils 测试**

```ts
import { describe, it, expect } from 'vitest';
import { getDateRange, isDateInRange, generateDateRange } from '../utils/date-range';
import { timeframeToDateRange } from '../utils/timeframe';
import { parseChartTokenId } from '../utils/chart-token';
import { getStatusColor } from '../constants/status-colors';
import { ChartTokenId } from '../types/chart-token';

describe('getDateRange', () => {
  it('returns correct range for 7 days', () => {
    const range = getDateRange(7, '2026-04-10');
    expect(range.end).toBe('2026-04-10');
    expect(range.start).toBe('2026-04-04');
  });

  it('returns 1 day range for 1 day', () => {
    const range = getDateRange(1, '2026-04-10');
    expect(range.start).toBe('2026-04-10');
    expect(range.end).toBe('2026-04-10');
  });
});

describe('isDateInRange', () => {
  const range = { start: '2026-04-04', end: '2026-04-10' };

  it('returns true for date in range', () => {
    expect(isDateInRange('2026-04-07', range)).toBe(true);
  });

  it('returns true for boundary dates', () => {
    expect(isDateInRange('2026-04-04', range)).toBe(true);
    expect(isDateInRange('2026-04-10', range)).toBe(true);
  });

  it('returns false for date outside range', () => {
    expect(isDateInRange('2026-04-03', range)).toBe(false);
    expect(isDateInRange('2026-04-11', range)).toBe(false);
  });
});

describe('generateDateRange', () => {
  it('generates all dates in range', () => {
    const dates = generateDateRange('2026-04-08', '2026-04-10');
    expect(dates).toEqual(['2026-04-08', '2026-04-09', '2026-04-10']);
  });
});

describe('timeframeToDateRange', () => {
  it('converts week timeframe to 7-day range', () => {
    const range = timeframeToDateRange('week', '2026-04-10');
    expect(range.end).toBe('2026-04-10');
    expect(range.start).toBe('2026-04-04');
  });
});

describe('parseChartTokenId', () => {
  it('returns valid token', () => {
    expect(parseChartTokenId('HRV_7DAYS')).toBe(ChartTokenId.HRV_7DAYS);
  });

  it('returns null for invalid token', () => {
    expect(parseChartTokenId('FAKE')).toBeNull();
  });
});

describe('getStatusColor', () => {
  it('returns correct status levels', () => {
    expect(getStatusColor(90, { good: 80, warning: 60 })).toBe('good');
    expect(getStatusColor(70, { good: 80, warning: 60 })).toBe('warning');
    expect(getStatusColor(50, { good: 80, warning: 60 })).toBe('alert');
  });
});
```

- [ ] **Step 3: 运行测试**

Run: `pnpm --filter @health-advisor/shared test`
Expected: 所有测试通过

- [ ] **Step 4: 验证 coverage**

Run: `pnpm --filter @health-advisor/shared test:coverage`
Expected: coverage ≥ 80%

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/__tests__/
git commit -m "test: add unit tests for shared schemas and utilities (SHR-009)"
```

---

### Task 13: 最终验证

- [ ] **Step 1: 全局构建**

Run: `pnpm build`
Expected: PASS

- [ ] **Step 2: 全局 lint**

Run: `pnpm lint`
Expected: PASS

- [ ] **Step 3: 全局 typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 4: 全局测试**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 5: 格式检查**

Run: `pnpm format:check`
Expected: PASS
