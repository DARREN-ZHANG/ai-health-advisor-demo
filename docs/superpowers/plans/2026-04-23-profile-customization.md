# Profile 可定制化改造 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 Profile 运行时编辑、克隆、删除和恢复默认功能，支持 baseline 联动重生成历史数据。

**Architecture:** 新增 ProfileManager 类管理文件 I/O 和 CRUD 操作，通过 RuntimeRegistry 注入到 GodModeService。编辑操作同时更新文件和内存，baseline 变更时自动重新生成 30 天 history 数据。前端通过 4 个新 API 端点操作，使用即时保存模式（blur 触发）。

**Tech Stack:** Fastify (API), Zod (校验), React Query (前端数据), Zustand (前端状态), Vitest (测试)

---

## File Structure

### 新建文件

| 文件 | 职责 |
|------|------|
| `packages/shared/src/schemas/profile-crud.ts` | Profile CRUD 请求校验 Zod schema |
| `packages/shared/src/types/profile-crud.ts` | Profile CRUD 响应类型定义 |
| `packages/sandbox/src/helpers/profile-write.ts` | Profile/Manifest/History 文件写回 helper |
| `apps/agent-api/src/modules/god-mode/profile-manager.ts` | ProfileManager CRUD 核心服务 |
| `apps/web/src/hooks/use-profile-actions.ts` | 前端 profile CRUD React Query mutations |
| `apps/web/src/components/god-mode/ProfileEditor.tsx` | Profile 编辑器 UI 组件 |
| `apps/agent-api/src/__tests__/modules/god-mode/profile-crud.test.ts` | Profile CRUD 路由集成测试 |

### 修改文件

| 文件 | 变更 |
|------|------|
| `packages/shared/src/types/api.ts:1-9` | 新增 `CONFLICT` ErrorCode |
| `packages/shared/src/types/god-mode.ts:115-128` | `GodModeStateResponse` 新增 `availableProfiles` 字段 |
| `packages/shared/src/index.ts` | 导出新 schemas 和 types |
| `packages/sandbox/src/generators/timeline-script.ts:45` | `generateTimelineScript` 新增可选 `sleepConfigOverride` 参数 |
| `packages/sandbox/src/generators/history.ts` | 新增 `buildProfileConfig` helper |
| `packages/sandbox/src/index.ts` | 导出新 helper |
| `apps/agent-api/src/runtime/registry.ts:30-41` | 接口新增 `profileManager` 字段，构造函数创建实例 |
| `apps/agent-api/src/modules/god-mode/service.ts` | 新增 `updateProfile`/`cloneProfile`/`deleteProfile`/`resetProfile` 方法 |
| `apps/agent-api/src/modules/god-mode/routes.ts` | 新增 4 个 CRUD 路由 |
| `apps/web/src/components/god-mode/GodModePanel.tsx` | Profile 切换器改为动态 + 集成 ProfileEditor |
| `apps/web/src/hooks/use-god-mode-actions.ts` | `getStateForProfile` 填充 `availableProfiles` |

---

## Task 1: Shared 包 — ErrorCode + Schema + Types

**Files:**
- Modify: `packages/shared/src/types/api.ts`
- Create: `packages/shared/src/schemas/profile-crud.ts`
- Create: `packages/shared/src/types/profile-crud.ts`
- Modify: `packages/shared/src/types/god-mode.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: 添加 `CONFLICT` 到 ErrorCode 枚举**

在 `packages/shared/src/types/api.ts` 的 `ErrorCode` 枚举末尾添加 `CONFLICT`：

```typescript
export enum ErrorCode {
  UNKNOWN = 'UNKNOWN',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  PROFILE_NOT_FOUND = 'PROFILE_NOT_FOUND',
  AGENT_TIMEOUT = 'AGENT_TIMEOUT',
  AGENT_FALLBACK = 'AGENT_FALLBACK',
  RATE_LIMITED = 'RATE_LIMITED',
  CONFLICT = 'CONFLICT',
}
```

- [ ] **Step 2: 创建 Profile CRUD Schema 文件**

创建 `packages/shared/src/schemas/profile-crud.ts`：

```typescript
import { z } from 'zod';
import { BaselineMetricsSchema } from './sandbox';

/** PUT /god-mode/profiles/:profileId 请求体 */
export const UpdateProfileRequestSchema = z.object({
  name: z.string().min(1).optional(),
  age: z.number().int().min(1).max(150).optional(),
  gender: z.enum(['male', 'female']).optional(),
  avatar: z.string().min(1).optional(),
  tags: z.array(z.string().min(1)).min(1).optional(),
  baseline: BaselineMetricsSchema.partial().optional(),
});

/** POST /god-mode/profiles 请求体 */
export const CloneProfileRequestSchema = z.object({
  sourceProfileId: z.string().min(1),
  newProfileId: z.string().regex(
    /^[a-z0-9-]+$/,
    'Profile ID 只允许小写字母、数字和连字符',
  ),
  overrides: z.object({
    name: z.string().min(1).optional(),
    age: z.number().int().min(1).max(150).optional(),
    gender: z.enum(['male', 'female']).optional(),
    avatar: z.string().min(1).optional(),
    tags: z.array(z.string().min(1)).min(1).optional(),
    baseline: BaselineMetricsSchema.partial().optional(),
  }).optional(),
});
```

- [ ] **Step 3: 创建 Profile CRUD 类型文件**

创建 `packages/shared/src/types/profile-crud.ts`：

```typescript
import type { SandboxProfile } from './sandbox';
import type { BaselineMetrics } from './sandbox';

/** 更新 profile 请求载荷 */
export interface UpdateProfilePayload {
  name?: string;
  age?: number;
  gender?: 'male' | 'female';
  avatar?: string;
  tags?: string[];
  baseline?: Partial<BaselineMetrics>;
}

/** 克隆 profile 请求载荷 */
export interface CloneProfilePayload {
  sourceProfileId: string;
  newProfileId: string;
  overrides?: Partial<SandboxProfile>;
}

/** PUT /god-mode/profiles/:profileId 响应 */
export interface UpdateProfileResponse {
  profile: SandboxProfile;
  regenerated: boolean;
}

/** POST /god-mode/profiles 响应 */
export interface CloneProfileResponse {
  profile: SandboxProfile;
}

/** DELETE /god-mode/profiles/:profileId 响应 */
export interface DeleteProfileResponse {
  deletedProfileId: string;
}

/** POST /god-mode/profiles/:profileId/reset 响应 */
export interface ResetProfileResponse {
  profile: SandboxProfile;
  regenerated: boolean;
}
```

- [ ] **Step 4: 在 GodModeStateResponse 中添加 `availableProfiles`**

在 `packages/shared/src/types/god-mode.ts` 的 `GodModeStateResponse` 接口末尾添加字段：

```typescript
export interface GodModeStateResponse {
  currentProfileId: string;
  activeOverrides: GodModeOverrideEntry[];
  injectedEvents: GodModeInjectedEvent[];
  availableScenarios: ScenarioEntry[];
  activeSensing: ActiveSensingState | null;
  currentDemoTime: string | null;
  lastSyncTime: string | null;
  pendingEventCount: number;
  recentRecognizedEvents: RecognizedEvent[];
  recentDerivedStates: DerivedTemporalState[];
  /** 所有可用 profile 列表 */
  availableProfiles: Array<{ profileId: string; name: string }>;
}
```

- [ ] **Step 5: 更新 shared 包 index.ts 导出**

在 `packages/shared/src/index.ts` 中添加导出。在 god-mode types 导出块（约第 44-67 行）后追加 profile-crud types，在 god-mode schemas 导出块（约第 122-134 行）后追加 profile-crud schemas：

在 `// Types — god-mode` 区块内追加：
```typescript
export type {
  UpdateProfilePayload,
  CloneProfilePayload,
  UpdateProfileResponse,
  CloneProfileResponse,
  DeleteProfileResponse,
  ResetProfileResponse,
} from './types/profile-crud';
```

在 `// Schemas` 的 god-mode schemas 导出块后追加：
```typescript
export {
  UpdateProfileRequestSchema,
  CloneProfileRequestSchema,
} from './schemas/profile-crud';
```

- [ ] **Step 6: 提交**

```bash
git add packages/shared/src/types/api.ts \
  packages/shared/src/schemas/profile-crud.ts \
  packages/shared/src/types/profile-crud.ts \
  packages/shared/src/types/god-mode.ts \
  packages/shared/src/index.ts
git commit -m "feat(shared): add profile CRUD schemas, types and CONFLICT error code"
```

---

## Task 2: Sandbox — 增强 Timeline Script Generator

**Files:**
- Modify: `packages/sandbox/src/generators/timeline-script.ts`

- [ ] **Step 1: 修改 `generateTimelineScript` 函数签名，添加可选 `sleepConfigOverride` 参数**

修改 `packages/sandbox/src/generators/timeline-script.ts`。将 `generateTimelineScript` 函数签名从：

```typescript
export function generateTimelineScript(profileId: string, demoDate: string, initialDemoTime: string): TimelineScript {
  const sleepConfig = SLEEP_CONFIGS[profileId];
  if (!sleepConfig) {
    throw new Error(`未找到 profile ${profileId} 的睡眠配置`);
  }
```

改为：

```typescript
export function generateTimelineScript(
  profileId: string,
  demoDate: string,
  initialDemoTime: string,
  sleepConfigOverride?: SleepConfig,
): TimelineScript {
  const sleepConfig = sleepConfigOverride ?? SLEEP_CONFIGS[profileId];
  if (!sleepConfig) {
    throw new Error(`未找到 profile ${profileId} 的睡眠配置`);
  }
```

- [ ] **Step 2: 添加 `deriveSleepConfig` helper**

在同一文件末尾，`SLEEP_CONFIGS` 定义之后追加：

```typescript
/** 根据日均睡眠分钟数推导睡眠时间配置 */
export function deriveSleepConfig(avgSleepMinutes: number): SleepConfig {
  if (avgSleepMinutes >= 420) {
    // 高质量睡眠：22:30 入睡
    return { bedHour: 22, bedMin: 30, wakeHour: 6, wakeMin: 0 };
  } else if (avgSleepMinutes >= 300) {
    // 中等睡眠：0:00 入睡
    return { bedHour: 0, bedMin: 0, wakeHour: 6, wakeMin: 0 };
  } else {
    // 睡眠不足：1:30 入睡
    return { bedHour: 1, bedMin: 30, wakeHour: 6, wakeMin: 0 };
  }
}
```

- [ ] **Step 3: 运行现有测试确认无回归**

Run: `pnpm --filter sandbox vitest run src/__tests__/helpers/timeline-script.test.ts`
Expected: PASS（新增参数为可选，现有调用无需修改）

- [ ] **Step 4: 提交**

```bash
git add packages/sandbox/src/generators/timeline-script.ts
git commit -m "feat(sandbox): add dynamic sleep config support to timeline generator"
```

---

## Task 3: Sandbox — 增强 History Generator + 文件写入 Helper

**Files:**
- Modify: `packages/sandbox/src/generators/history.ts`
- Create: `packages/sandbox/src/helpers/profile-write.ts`
- Modify: `packages/sandbox/src/index.ts`

- [ ] **Step 1: 在 history.ts 添加 `buildProfileConfig` helper**

在 `packages/sandbox/src/generators/history.ts` 文件末尾（`PROFILE_CONFIGS` 之后）追加：

```typescript
/** 根据 SandboxProfile 构建用于 generateHistory 的 ProfileConfig */
export function buildProfileConfig(profile: { profileId: string; baseline: ProfileBaseline }): ProfileConfig {
  // 基于字符串哈希生成确定性 seed
  let hash = 0;
  for (let i = 0; i < profile.profileId.length; i++) {
    hash = ((hash << 5) - hash) + profile.profileId.charCodeAt(i);
    hash = hash & hash; // 转为 32 位整数
  }
  return {
    profileId: profile.profileId,
    seed: Math.abs(hash),
    baseline: { ...profile.baseline },
    missingRate: { hr: 0, activity: 0, spo2: 0 },
    trend: { stressDirection: 0, sleepDirection: 0, hrDirection: 0 },
  };
}
```

- [ ] **Step 2: 创建文件写入 helper**

创建 `packages/sandbox/src/helpers/profile-write.ts`：

```typescript
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Manifest, ProfileFileV2 } from '../loader';

/** 写回 profile JSON 文件 */
export function writeProfileFile(
  dataDir: string,
  filePath: string,
  data: ProfileFileV2,
): void {
  const absolutePath = join(dataDir, filePath);
  writeFileSync(absolutePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

/** 写回 manifest.json */
export function writeManifest(dataDir: string, manifest: Manifest): void {
  const filePath = join(dataDir, 'manifest.json');
  writeFileSync(filePath, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
}

/** 写回历史记录 JSON 文件 */
export function writeHistoryFile(
  dataDir: string,
  filePath: string,
  data: unknown,
): void {
  const absolutePath = join(dataDir, filePath);
  writeFileSync(absolutePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

/** 写回时间轴脚本 JSON 文件 */
export function writeTimelineScriptFile(
  dataDir: string,
  filePath: string,
  data: unknown,
): void {
  const absolutePath = join(dataDir, filePath);
  writeFileSync(absolutePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}
```

- [ ] **Step 3: 更新 sandbox index.ts 导出**

在 `packages/sandbox/src/index.ts` 中：

1. 在 `// Generators — deterministic data generation` 区块追加 `buildProfileConfig`：

```typescript
export { generateHistory, PROFILE_CONFIGS, generateDateRange, buildProfileConfig } from './generators/history';
```

2. 在 generators 区块之后追加 helpers 导出：

```typescript
// Helpers — profile write
export {
  writeProfileFile,
  writeManifest,
  writeHistoryFile,
  writeTimelineScriptFile,
} from './helpers/profile-write';
```

3. 在 timeline-script 导出行追加 `deriveSleepConfig`：

```typescript
export { generateTimelineScript, deriveSleepConfig } from './generators/timeline-script';
```

- [ ] **Step 4: 运行现有测试确认无回归**

Run: `pnpm --filter sandbox vitest run`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add packages/sandbox/src/generators/history.ts \
  packages/sandbox/src/helpers/profile-write.ts \
  packages/sandbox/src/index.ts
git commit -m "feat(sandbox): add buildProfileConfig helper and file write utilities"
```

---

## Task 4: Agent API — 创建 ProfileManager 类

**Files:**
- Create: `apps/agent-api/src/modules/god-mode/profile-manager.ts`

- [ ] **Step 1: 创建 ProfileManager 完整实现**

创建 `apps/agent-api/src/modules/god-mode/profile-manager.ts`：

```typescript
import { readFileSync, existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  loadManifest,
  generateHistory,
  generateTimelineScript,
  buildProfileConfig,
  deriveSleepConfig,
  writeProfileFile,
  writeManifest,
  writeHistoryFile,
  writeTimelineScriptFile,
  type Manifest,
  type ProfileFileV2,
} from '@health-advisor/sandbox';
import {
  SandboxProfileSchema,
  type SandboxProfile,
  type BaselineMetrics,
} from '@health-advisor/shared';

export interface ProfileManagerDeps {
  dataDir: string;
  reloadProfiles: () => void;
}

export class ProfileManager {
  private originalSnapshots = new Map<string, string>();

  constructor(private deps: ProfileManagerDeps) {
    this.saveSnapshots();
  }

  /** 启动时保存所有 profile 的原始快照 */
  private saveSnapshots(): void {
    const manifest = loadManifest(this.deps.dataDir);
    for (const entry of manifest.profiles) {
      const filePath = join(this.deps.dataDir, entry.file);
      const content = readFileSync(filePath, 'utf-8');
      this.originalSnapshots.set(entry.profileId, content);
    }
  }

  /** 检测 baseline 字段是否发生变化 */
  private hasBaselineChanged(
    oldBaseline: BaselineMetrics,
    newBaseline: BaselineMetrics,
  ): boolean {
    return (
      oldBaseline.restingHr !== newBaseline.restingHr ||
      oldBaseline.hrv !== newBaseline.hrv ||
      oldBaseline.spo2 !== newBaseline.spo2 ||
      oldBaseline.avgSleepMinutes !== newBaseline.avgSleepMinutes ||
      oldBaseline.avgSteps !== newBaseline.avgSteps
    );
  }

  /** 获取历史数据的日期范围（今天往前 30 天） */
  private getHistoryDateRange(): { startDate: string; endDate: string } {
    const today = new Date();
    const endDate = today.toISOString().slice(0, 10);
    const startDateObj = new Date(today);
    startDateObj.setDate(startDateObj.getDate() - 30);
    const startDate = startDateObj.toISOString().slice(0, 10);
    return { startDate, endDate };
  }

  /** 更新 profile 字段（局部更新），返回更新后的 profile 和是否触发了重生成 */
  updateProfile(
    profileId: string,
    changes: {
      name?: string;
      age?: number;
      gender?: 'male' | 'female';
      avatar?: string;
      tags?: string[];
      baseline?: Partial<BaselineMetrics>;
    },
  ): { profile: SandboxProfile; regenerated: boolean } {
    const manifest = loadManifest(this.deps.dataDir);
    const entry = manifest.profiles.find((e) => e.profileId === profileId);
    if (!entry) {
      throw Object.assign(new Error(`Profile '${profileId}' not found`), { statusCode: 404 });
    }

    // 读取当前 profile 文件
    const profilePath = join(this.deps.dataDir, entry.file);
    const originalContent = readFileSync(profilePath, 'utf-8');
    const profileFile = JSON.parse(originalContent) as ProfileFileV2;
    const oldBaseline = { ...profileFile.profile.baseline };

    // 浅合并 profile 层字段
    if (changes.name !== undefined) profileFile.profile.name = changes.name;
    if (changes.age !== undefined) profileFile.profile.age = changes.age;
    if (changes.gender !== undefined) profileFile.profile.gender = changes.gender;
    if (changes.avatar !== undefined) profileFile.profile.avatar = changes.avatar;
    if (changes.tags !== undefined) profileFile.profile.tags = changes.tags;
    if (changes.baseline !== undefined) {
      profileFile.profile.baseline = {
        ...profileFile.profile.baseline,
        ...changes.baseline,
      };
    }

    // Zod 校验
    const validated = SandboxProfileSchema.safeParse(profileFile.profile);
    if (!validated.success) {
      throw Object.assign(
        new Error(validated.error.issues.map((i) => i.message).join('; ')),
        { statusCode: 422 },
      );
    }

    // 检测 baseline 变化
    const baselineChanged = this.hasBaselineChanged(oldBaseline, profileFile.profile.baseline);

    try {
      // 写回 profile 文件
      writeProfileFile(this.deps.dataDir, entry.file, profileFile);

      if (baselineChanged) {
        const { startDate, endDate } = this.getHistoryDateRange();

        // 重生成 history
        const config = buildProfileConfig(validated.data);
        const history = generateHistory(config, startDate, endDate);
        writeHistoryFile(this.deps.dataDir, profileFile.historyRef.file, history);

        // 重生成 timeline script
        const sleepConfig = deriveSleepConfig(validated.data.baseline.avgSleepMinutes);
        const script = generateTimelineScript(
          profileId,
          endDate,
          profileFile.initialDemoTime,
          sleepConfig,
        );
        writeTimelineScriptFile(this.deps.dataDir, profileFile.timelineScriptRef.file, script);
      }

      // 重载内存
      this.deps.reloadProfiles();
    } catch (error) {
      // 回滚 profile 文件到修改前状态
      writeFileSync(profilePath, originalContent, 'utf-8');
      throw error;
    }

    return { profile: validated.data, regenerated: baselineChanged };
  }

  /** 从现有 profile 克隆创建新 profile */
  cloneProfile(
    sourceProfileId: string,
    newProfileId: string,
    overrides?: Partial<SandboxProfile>,
  ): SandboxProfile {
    const manifest = loadManifest(this.deps.dataDir);

    // 校验 newProfileId 不重复
    if (manifest.profiles.some((e) => e.profileId === newProfileId)) {
      throw Object.assign(
        new Error(`Profile '${newProfileId}' already exists`),
        { statusCode: 409 },
      );
    }

    // 查找源 profile
    const sourceEntry = manifest.profiles.find((e) => e.profileId === sourceProfileId);
    if (!sourceEntry) {
      throw Object.assign(
        new Error(`Source profile '${sourceProfileId}' not found`),
        { statusCode: 404 },
      );
    }

    // 读取源 profile 文件
    const sourceFilePath = join(this.deps.dataDir, sourceEntry.file);
    const sourceContent = readFileSync(sourceFilePath, 'utf-8');
    const sourceFile = JSON.parse(sourceContent) as ProfileFileV2;

    // 构建新 profile 文件
    const newFile: ProfileFileV2 = {
      profile: {
        ...sourceFile.profile,
        profileId: newProfileId,
        ...(overrides ?? {}),
      },
      initialDemoTime: sourceFile.initialDemoTime,
      historyRef: { file: `history/${newProfileId}-daily-records.json` },
      timelineScriptRef: { file: `timeline-scripts/${newProfileId}-day-1.json` },
    };

    // Zod 校验
    const validated = SandboxProfileSchema.parse(newFile.profile);

    // 写 profile 文件
    const newProfileFilePath = `profiles/${newProfileId}.json`;
    writeProfileFile(this.deps.dataDir, newProfileFilePath, {
      ...newFile,
      profile: validated,
    });

    // 生成 history
    const { startDate, endDate } = this.getHistoryDateRange();
    const config = buildProfileConfig(validated);
    const history = generateHistory(config, startDate, endDate);
    writeHistoryFile(this.deps.dataDir, newFile.historyRef.file, history);

    // 生成 timeline script
    const sleepConfig = deriveSleepConfig(validated.baseline.avgSleepMinutes);
    const script = generateTimelineScript(
      newProfileId,
      endDate,
      newFile.initialDemoTime,
      sleepConfig,
    );
    writeTimelineScriptFile(this.deps.dataDir, newFile.timelineScriptRef.file, script);

    // 更新 manifest
    const updatedManifest: Manifest = {
      ...manifest,
      profiles: [
        ...manifest.profiles,
        { profileId: newProfileId, name: validated.name, file: newProfileFilePath },
      ],
    };
    writeManifest(this.deps.dataDir, updatedManifest);

    // 重载内存
    this.deps.reloadProfiles();

    // 保存新 profile 的原始快照（克隆时即为原始状态）
    const savedContent = readFileSync(join(this.deps.dataDir, newProfileFilePath), 'utf-8');
    this.originalSnapshots.set(newProfileId, savedContent);

    return validated;
  }

  /** 删除 profile（至少保留 1 个） */
  deleteProfile(profileId: string): void {
    const manifest = loadManifest(this.deps.dataDir);

    // 至少保留 1 个 profile
    if (manifest.profiles.length <= 1) {
      throw Object.assign(
        new Error('无法删除最后一个 profile'),
        { statusCode: 400 },
      );
    }

    const entry = manifest.profiles.find((e) => e.profileId === profileId);
    if (!entry) {
      throw Object.assign(
        new Error(`Profile '${profileId}' not found`),
        { statusCode: 404 },
      );
    }

    // 读取 profile 文件以获取关联文件路径
    const profilePath = join(this.deps.dataDir, entry.file);
    const profileContent = readFileSync(profilePath, 'utf-8');
    const profileFile = JSON.parse(profileContent) as ProfileFileV2;

    // 删除文件
    if (existsSync(profilePath)) unlinkSync(profilePath);
    const historyPath = join(this.deps.dataDir, profileFile.historyRef.file);
    if (existsSync(historyPath)) unlinkSync(historyPath);
    const scriptPath = join(this.deps.dataDir, profileFile.timelineScriptRef.file);
    if (existsSync(scriptPath)) unlinkSync(scriptPath);

    // 更新 manifest
    const updatedManifest: Manifest = {
      ...manifest,
      profiles: manifest.profiles.filter((e) => e.profileId !== profileId),
    };
    writeManifest(this.deps.dataDir, updatedManifest);

    // 清除快照
    this.originalSnapshots.delete(profileId);

    // 重载内存
    this.deps.reloadProfiles();
  }

  /** 恢复 profile 到启动时的原始模板 */
  resetProfile(profileId: string): { profile: SandboxProfile; regenerated: boolean } {
    const snapshot = this.originalSnapshots.get(profileId);
    if (!snapshot) {
      throw Object.assign(
        new Error(`Profile '${profileId}' 原始快照不存在`),
        { statusCode: 404 },
      );
    }

    const manifest = loadManifest(this.deps.dataDir);
    const entry = manifest.profiles.find((e) => e.profileId === profileId);
    if (!entry) {
      throw Object.assign(
        new Error(`Profile '${profileId}' not found`),
        { statusCode: 404 },
      );
    }

    // 写回原始快照
    const profilePath = join(this.deps.dataDir, entry.file);
    writeFileSync(profilePath, snapshot, 'utf-8');

    // 解析原始 profile 以重生成 history
    const originalFile = JSON.parse(snapshot) as ProfileFileV2;
    const originalProfile = SandboxProfileSchema.parse(originalFile.profile);

    // 重生成 history
    const { startDate, endDate } = this.getHistoryDateRange();
    const config = buildProfileConfig(originalProfile);
    const history = generateHistory(config, startDate, endDate);
    writeHistoryFile(this.deps.dataDir, originalFile.historyRef.file, history);

    // 重生成 timeline script
    const sleepConfig = deriveSleepConfig(originalProfile.baseline.avgSleepMinutes);
    const script = generateTimelineScript(
      profileId,
      endDate,
      originalFile.initialDemoTime,
      sleepConfig,
    );
    writeTimelineScriptFile(this.deps.dataDir, originalFile.timelineScriptRef.file, script);

    // 重载内存
    this.deps.reloadProfiles();

    return { profile: originalProfile, regenerated: true };
  }
}
```

- [ ] **Step 2: 验证编译通过**

Run: `pnpm --filter agent-api exec tsc --noEmit`
Expected: 无编译错误

- [ ] **Step 3: 提交**

```bash
git add apps/agent-api/src/modules/god-mode/profile-manager.ts
git commit -m "feat(agent-api): add ProfileManager class for profile CRUD operations"
```

---

## Task 5: Agent API — 集成 ProfileManager 到 Registry + GodModeService

**Files:**
- Modify: `apps/agent-api/src/runtime/registry.ts`
- Modify: `apps/agent-api/src/modules/god-mode/service.ts`

- [ ] **Step 1: 在 Registry 中集成 ProfileManager**

在 `apps/agent-api/src/runtime/registry.ts` 中进行以下修改：

1. 添加 import：

```typescript
import { ProfileManager } from '../modules/god-mode/profile-manager.js';
```

2. 在 `RuntimeRegistry` 接口（约第 30-41 行）添加 `profileManager` 字段：

```typescript
export interface RuntimeRegistry extends AgentRuntimeDeps {
  config: AppConfig;
  metrics: MetricsStore;
  sessionStore: SessionStoreService;
  overrideStore: OverrideStoreService;
  scenarioRegistry: ScenarioRegistryService;
  profiles: Map<string, ProfileData>;
  profileManager: ProfileManager;
  getRawProfile(profileId: string): ProfileData;
  reloadProfiles(): void;
}
```

3. 在 `createRuntimeRegistry` 函数中，在 `reloadProfiles` 函数定义之后（约第 152-158 行之后）创建 ProfileManager 实例：

```typescript
const profileManager = new ProfileManager({
  dataDir: config.dataDir,
  reloadProfiles,
});
```

4. 在 return 对象中添加 `profileManager`：

```typescript
return {
  // ... 现有字段 ...
  profileManager,
  // ...
};
```

- [ ] **Step 2: 在 GodModeService 中添加 CRUD 方法**

在 `apps/agent-api/src/modules/god-mode/service.ts` 中进行以下修改：

1. 添加 import（文件顶部）：

```typescript
import type { UpdateProfilePayload, CloneProfilePayload } from '@health-advisor/shared';
```

2. 在 `GodModeService` 类中添加以下 4 个方法（在 `recalibrate` 方法之后，`invalidateSessionAnalytical` 之前）：

```typescript
  /** 更新 profile 字段（局部更新） */
  updateProfile(profileId: string, changes: UpdateProfilePayload) {
    return this.registry.profileManager.updateProfile(profileId, changes);
  }

  /** 克隆创建新 profile */
  cloneProfile(sourceProfileId: string, newProfileId: string, overrides?: CloneProfilePayload['overrides']) {
    return this.registry.profileManager.cloneProfile(sourceProfileId, newProfileId, overrides);
  }

  /** 删除 profile */
  deleteProfile(profileId: string) {
    const currentProfileId = this.registry.overrideStore.getCurrentProfileId();
    this.registry.profileManager.deleteProfile(profileId);

    // 如果删除的是当前活跃 profile，切换到第一个可用 profile
    if (currentProfileId === profileId) {
      const remaining = [...this.registry.profiles.keys()];
      if (remaining.length > 0) {
        this.registry.overrideStore.switchProfile(remaining[0]!);
      }
    }

    return { deletedProfileId: profileId };
  }

  /** 恢复 profile 到原始模板 */
  resetProfile(profileId: string) {
    return this.registry.profileManager.resetProfile(profileId);
  }
```

3. 在 `getStateForProfile` 私有方法中（约第 129-154 行），在 return 语句中添加 `availableProfiles`：

在 `return {` 块内、最后一个字段 `recentDerivedStates` 之后追加：

```typescript
    availableProfiles: [...this.registry.profiles.values()].map((p) => ({
      profileId: p.profile.profileId,
      name: p.profile.name,
    })),
```

- [ ] **Step 3: 验证编译通过**

Run: `pnpm --filter agent-api exec tsc --noEmit`
Expected: 无编译错误

- [ ] **Step 4: 运行现有测试确认无回归**

Run: `pnpm --filter agent-api vitest run src/__tests__/modules/god-mode/routes.test.ts`
Expected: PASS（所有现有测试应通过；注意 `availableProfiles` 为新增字段，不影响现有断言）

- [ ] **Step 5: 提交**

```bash
git add apps/agent-api/src/runtime/registry.ts \
  apps/agent-api/src/modules/god-mode/service.ts
git commit -m "feat(agent-api): integrate ProfileManager into registry and service"
```

---

## Task 6: Agent API — 添加 Profile CRUD 路由

**Files:**
- Modify: `apps/agent-api/src/modules/god-mode/routes.ts`

- [ ] **Step 1: 添加 import 和路由处理函数**

在 `apps/agent-api/src/modules/god-mode/routes.ts` 中进行修改：

1. 在 import 区（文件顶部）添加新的 schema 和 type import：

```typescript
import {
  UpdateProfileRequestSchema,
  CloneProfileRequestSchema,
} from '@health-advisor/shared';
```

注意：`createSuccessResponse`, `createErrorResponse`, `ErrorCode`, `buildMeta` 已经在现有 import 中。

2. 添加请求体类型定义（在现有 `interface` 定义区域之后追加）：

```typescript
interface UpdateProfileBody {
  name?: string;
  age?: number;
  gender?: 'male' | 'female';
  avatar?: string;
  tags?: string[];
  baseline?: {
    restingHr?: number;
    hrv?: number;
    spo2?: number;
    avgSleepMinutes?: number;
    avgSteps?: number;
  };
}

interface CloneProfileBody {
  sourceProfileId: string;
  newProfileId: string;
  overrides?: Record<string, unknown>;
}
```

3. 在 `godModeRoutes` 函数内，recalibrate 路由之后（文件末尾 `}` 之前）添加 4 个新路由：

```typescript
  // Profile CRUD: 更新 profile 字段
  app.put<{ Params: { profileId: string }; Body: UpdateProfileBody }>(
    '/god-mode/profiles/:profileId',
    async (request, reply) => {
      const parsed = UpdateProfileRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send(
          createErrorResponse(
            ErrorCode.VALIDATION_ERROR,
            parsed.error.issues.map((i) => i.message).join('; '),
            buildMeta(request),
          ),
        );
      }

      try {
        const result = service.updateProfile(request.params.profileId, parsed.data);
        return createSuccessResponse(result, buildMeta(request));
      } catch (error) {
        const statusCode = (error as unknown as { statusCode?: number }).statusCode ?? 500;
        const message = error instanceof Error ? error.message : 'Unknown error';
        const code =
          statusCode === 422 ? ErrorCode.VALIDATION_ERROR
          : statusCode === 404 ? ErrorCode.PROFILE_NOT_FOUND
          : ErrorCode.UNKNOWN;
        return reply.status(statusCode).send(createErrorResponse(code, message, buildMeta(request)));
      }
    },
  );

  // Profile CRUD: 克隆创建新 profile
  app.post<{ Body: CloneProfileBody }>('/god-mode/profiles', async (request, reply) => {
    const parsed = CloneProfileRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send(
        createErrorResponse(
          ErrorCode.VALIDATION_ERROR,
          parsed.error.issues.map((i) => i.message).join('; '),
          buildMeta(request),
        ),
      );
    }

    try {
      const result = service.cloneProfile(
        parsed.data.sourceProfileId,
        parsed.data.newProfileId,
        parsed.data.overrides,
      );
      return createSuccessResponse(result, buildMeta(request));
    } catch (error) {
      const statusCode = (error as unknown as { statusCode?: number }).statusCode ?? 500;
      const message = error instanceof Error ? error.message : 'Unknown error';
      const code =
        statusCode === 409 ? ErrorCode.CONFLICT
        : statusCode === 404 ? ErrorCode.PROFILE_NOT_FOUND
        : ErrorCode.UNKNOWN;
      return reply.status(statusCode).send(createErrorResponse(code, message, buildMeta(request)));
    }
  });

  // Profile CRUD: 删除 profile
  app.delete<{ Params: { profileId: string } }>(
    '/god-mode/profiles/:profileId',
    async (request, reply) => {
      try {
        const result = service.deleteProfile(request.params.profileId);
        return createSuccessResponse(result, buildMeta(request));
      } catch (error) {
        const statusCode = (error as unknown as { statusCode?: number }).statusCode ?? 500;
        const message = error instanceof Error ? error.message : 'Unknown error';
        const code =
          statusCode === 400 ? ErrorCode.VALIDATION_ERROR
          : statusCode === 404 ? ErrorCode.PROFILE_NOT_FOUND
          : ErrorCode.UNKNOWN;
        return reply.status(statusCode).send(createErrorResponse(code, message, buildMeta(request)));
      }
    },
  );

  // Profile CRUD: 恢复 profile 到原始模板
  app.post<{ Params: { profileId: string } }>(
    '/god-mode/profiles/:profileId/reset',
    async (request, reply) => {
      try {
        const result = service.resetProfile(request.params.profileId);
        return createSuccessResponse(result, buildMeta(request));
      } catch (error) {
        const statusCode = (error as unknown as { statusCode?: number }).statusCode ?? 500;
        const message = error instanceof Error ? error.message : 'Unknown error';
        return reply.status(statusCode).send(
          createErrorResponse(
            statusCode === 404 ? ErrorCode.PROFILE_NOT_FOUND : ErrorCode.UNKNOWN,
            message,
            buildMeta(request),
          ),
        );
      }
    },
  );
```

- [ ] **Step 2: 验证编译通过**

Run: `pnpm --filter agent-api exec tsc --noEmit`
Expected: 无编译错误

- [ ] **Step 3: 提交**

```bash
git add apps/agent-api/src/modules/god-mode/routes.ts
git commit -m "feat(agent-api): add profile CRUD API routes"
```

---

## Task 7: 后端集成测试

**Files:**
- Create: `apps/agent-api/src/__tests__/modules/god-mode/profile-crud.test.ts`

- [ ] **Step 1: 创建测试文件**

创建 `apps/agent-api/src/__tests__/modules/god-mode/profile-crud.test.ts`：

```typescript
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';
import path from 'node:path';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { buildApp } from '../../../app.js';
import type { FastifyInstance } from 'fastify';

const SOURCE_DATA_DIR = path.resolve(import.meta.dirname, '../../../../../../data/sandbox');

describe('Profile CRUD Routes', () => {
  let app: FastifyInstance;
  let dataDir: string;

  beforeAll(async () => {
    // 复制数据目录到临时目录，避免测试修改原始数据
    dataDir = mkdtempSync(path.join(tmpdir(), 'profile-crud-test-'));
    cpSync(SOURCE_DATA_DIR, dataDir, { recursive: true });

    process.env.FALLBACK_ONLY_MODE = 'true';
    process.env.ENABLE_GOD_MODE = 'true';
    process.env.NODE_ENV = 'test';
    process.env.DATA_DIR = dataDir;
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
    rmSync(dataDir, { recursive: true, force: true });
    delete process.env.FALLBACK_ONLY_MODE;
    delete process.env.ENABLE_GOD_MODE;
    delete process.env.NODE_ENV;
    delete process.env.DATA_DIR;
  });

  describe('PUT /god-mode/profiles/:profileId', () => {
    test('更新 profile 基本字段返回 200', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/god-mode/profiles/profile-a',
        payload: { name: '测试用户' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.profile.name).toBe('测试用户');
      expect(body.data.regenerated).toBe(false);

      // 恢复
      await app.inject({
        method: 'POST',
        url: '/god-mode/profiles/profile-a/reset',
      });
    });

    test('更新 baseline 触发 history 重生成', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/god-mode/profiles/profile-a',
        payload: { baseline: { restingHr: 70 } },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.profile.baseline.restingHr).toBe(70);
      expect(body.data.regenerated).toBe(true);

      // 恢复
      await app.inject({
        method: 'POST',
        url: '/god-mode/profiles/profile-a/reset',
      });
    });

    test('不存在的 profile 返回 404', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/god-mode/profiles/nonexistent',
        payload: { name: '测试' },
      });

      expect(response.statusCode).toBe(404);
    });

    test('无效字段值返回 400', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/god-mode/profiles/profile-a',
        payload: { age: -1 },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /god-mode/profiles', () => {
    afterEach(async () => {
      // 清理可能创建的测试 profile
      try {
        await app.inject({
          method: 'DELETE',
          url: '/god-mode/profiles/test-clone',
        });
      } catch {
        // 忽略清理失败
      }
    });

    test('克隆 profile 返回 200', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/god-mode/profiles',
        payload: {
          sourceProfileId: 'profile-a',
          newProfileId: 'test-clone',
          overrides: { name: '克隆用户' },
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.profile.profileId).toBe('test-clone');
      expect(body.data.profile.name).toBe('克隆用户');

      // 验证 manifest 中存在新 profile
      const stateResponse = await app.inject({
        method: 'GET',
        url: '/god-mode/state',
      });
      const state = stateResponse.json();
      const profileIds = state.data.availableProfiles.map((p: { profileId: string }) => p.profileId);
      expect(profileIds).toContain('test-clone');
    });

    test('重复 profileId 返回 409', async () => {
      // 先创建一个
      await app.inject({
        method: 'POST',
        url: '/god-mode/profiles',
        payload: {
          sourceProfileId: 'profile-a',
          newProfileId: 'test-clone',
        },
      });

      // 再创建同 ID 的
      const response = await app.inject({
        method: 'POST',
        url: '/god-mode/profiles',
        payload: {
          sourceProfileId: 'profile-a',
          newProfileId: 'test-clone',
        },
      });

      expect(response.statusCode).toBe(409);
    });

    test('非法 profileId 格式返回 400', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/god-mode/profiles',
        payload: {
          sourceProfileId: 'profile-a',
          newProfileId: 'INVALID_ID',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    test('缺少 sourceProfileId 返回 400', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/god-mode/profiles',
        payload: { newProfileId: 'test-clone' },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('DELETE /god-mode/profiles/:profileId', () => {
    test('删除 profile 返回 200', async () => {
      // 先克隆一个用于删除
      await app.inject({
        method: 'POST',
        url: '/god-mode/profiles',
        payload: {
          sourceProfileId: 'profile-a',
          newProfileId: 'test-delete',
        },
      });

      const response = await app.inject({
        method: 'DELETE',
        url: '/god-mode/profiles/test-delete',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.deletedProfileId).toBe('test-delete');
    });

    test('不存在的 profile 返回 404', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/god-mode/profiles/nonexistent',
      });

      expect(response.statusCode).toBe(404);
    });

    test('删除最后一个 profile 返回 400', async () => {
      // 删除到只剩 1 个
      await app.inject({
        method: 'DELETE',
        url: '/god-mode/profiles/profile-c',
      });

      // 此时剩 2 个，再删 1 个
      await app.inject({
        method: 'DELETE',
        url: '/god-mode/profiles/profile-b',
      });

      // 此时只剩 1 个
      const response = await app.inject({
        method: 'DELETE',
        url: '/god-mode/profiles/profile-a',
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /god-mode/profiles/:profileId/reset', () => {
    test('恢复 profile 到默认返回 200', async () => {
      // 先修改
      await app.inject({
        method: 'PUT',
        url: '/god-mode/profiles/profile-a',
        payload: { name: '已修改' },
      });

      // 恢复
      const response = await app.inject({
        method: 'POST',
        url: '/god-mode/profiles/profile-a/reset',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.profile.name).toBe('张健康'); // 原始名称
      expect(body.data.regenerated).toBe(true);
    });

    test('不存在的 profile 返回 404', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/god-mode/profiles/nonexistent/reset',
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('GET /god-mode/state — availableProfiles', () => {
    test('返回 availableProfiles 列表', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/god-mode/state',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data.availableProfiles)).toBe(true);
      expect(body.data.availableProfiles.length).toBeGreaterThanOrEqual(1);
      expect(body.data.availableProfiles[0]).toHaveProperty('profileId');
      expect(body.data.availableProfiles[0]).toHaveProperty('name');
    });
  });
});
```

- [ ] **Step 2: 运行测试确认通过**

Run: `pnpm --filter agent-api vitest run src/__tests__/modules/god-mode/profile-crud.test.ts`
Expected: PASS

- [ ] **Step 3: 运行全量测试确认无回归**

Run: `pnpm --filter agent-api vitest run`
Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add apps/agent-api/src/__tests__/modules/god-mode/profile-crud.test.ts
git commit -m "test(agent-api): add integration tests for profile CRUD routes"
```

---

## Task 8: 前端 — Profile Actions Hook

**Files:**
- Create: `apps/web/src/hooks/use-profile-actions.ts`

- [ ] **Step 1: 创建 Profile Actions Hook**

创建 `apps/web/src/hooks/use-profile-actions.ts`：

```typescript
'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useProfileStore } from '@/stores/profile.store';
import type {
  UpdateProfileResponse,
  CloneProfileResponse,
  DeleteProfileResponse,
  ResetProfileResponse,
} from '@health-advisor/shared';

export function useProfileActions() {
  const queryClient = useQueryClient();
  const { setProfileId } = useProfileStore();

  /** 失效所有受 profile 影响的查询 */
  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.homepage.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.dataCenter.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.profile.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.godMode.all });
  };

  /** 更新 profile 字段 */
  const updateProfileMutation = useMutation({
    mutationFn: async (params: {
      profileId: string;
      changes: Record<string, unknown>;
    }) => {
      return apiClient.put<UpdateProfileResponse>(
        `/god-mode/profiles/${params.profileId}`,
        params.changes,
      );
    },
    onSuccess: () => {
      invalidateAll();
    },
  });

  /** 克隆创建新 profile */
  const cloneProfileMutation = useMutation({
    mutationFn: async (params: {
      sourceProfileId: string;
      newProfileId: string;
      overrides?: Record<string, unknown>;
    }) => {
      return apiClient.post<CloneProfileResponse>('/god-mode/profiles', params);
    },
    onSuccess: (data) => {
      // 切换到新 profile
      setProfileId(data.profile.profileId);
      invalidateAll();
    },
  });

  /** 删除 profile */
  const deleteProfileMutation = useMutation({
    mutationFn: async (params: { profileId: string }) => {
      return apiClient.delete<DeleteProfileResponse>(
        `/god-mode/profiles/${params.profileId}`,
      );
    },
    onSuccess: () => {
      invalidateAll();
    },
  });

  /** 恢复 profile 到默认 */
  const resetProfileMutation = useMutation({
    mutationFn: async (params: { profileId: string }) => {
      return apiClient.post<ResetProfileResponse>(
        `/god-mode/profiles/${params.profileId}/reset`,
        {},
      );
    },
    onSuccess: () => {
      invalidateAll();
    },
  });

  return {
    updateProfile: updateProfileMutation.mutateAsync,
    isUpdatingProfile: updateProfileMutation.isPending,
    cloneProfile: cloneProfileMutation.mutateAsync,
    isCloningProfile: cloneProfileMutation.isPending,
    deleteProfile: deleteProfileMutation.mutateAsync,
    isDeletingProfile: deleteProfileMutation.isPending,
    resetProfile: resetProfileMutation.mutateAsync,
    isResettingProfile: resetProfileMutation.isPending,
  };
}
```

- [ ] **Step 2: 验证编译通过**

Run: `pnpm --filter web exec tsc --noEmit`
Expected: 无编译错误

- [ ] **Step 3: 提交**

```bash
git add apps/web/src/hooks/use-profile-actions.ts
git commit -m "feat(web): add profile CRUD mutations hook"
```

---

## Task 9: 前端 — ProfileEditor 组件

**Files:**
- Create: `apps/web/src/components/god-mode/ProfileEditor.tsx`

- [ ] **Step 1: 创建 ProfileEditor 组件**

创建 `apps/web/src/components/god-mode/ProfileEditor.tsx`：

```tsx
'use client';

import { useState } from 'react';
import { useProfileStore } from '@/stores/profile.store';
import { useProfileActions } from '@/hooks/use-profile-actions';
import { useGodModeState } from '@/hooks/use-god-mode-actions';

export function ProfileEditor() {
  const { currentProfile } = useProfileStore();
  const { data: godModeState } = useGodModeState();
  const {
    updateProfile,
    isUpdatingProfile,
    cloneProfile,
    isCloningProfile,
    deleteProfile,
    isDeletingProfile,
    resetProfile,
    isResettingProfile,
  } = useProfileActions();

  const [cloneDialogOpen, setCloneDialogOpen] = useState(false);
  const [newProfileId, setNewProfileId] = useState('');
  const [newProfileName, setNewProfileName] = useState('');

  if (!currentProfile) return null;

  const profileCount = godModeState?.availableProfiles?.length ?? 0;
  const isBusy = isUpdatingProfile || isCloningProfile || isDeletingProfile || isResettingProfile;

  const handleBlur = async (field: string, value: unknown) => {
    if (isBusy) return;
    try {
      await updateProfile({
        profileId: currentProfile.profileId,
        changes: { [field]: value },
      });
    } catch (error) {
      console.error('更新失败:', error);
    }
  };

  const handleBaselineBlur = async (field: string, value: number) => {
    if (isBusy) return;
    try {
      await updateProfile({
        profileId: currentProfile.profileId,
        changes: { baseline: { [field]: value } },
      });
    } catch (error) {
      console.error('基线更新失败:', error);
    }
  };

  const handleClone = async () => {
    if (!newProfileId.trim()) return;
    try {
      await cloneProfile({
        sourceProfileId: currentProfile.profileId,
        newProfileId: newProfileId.trim(),
        overrides: newProfileName.trim() ? { name: newProfileName.trim() } : undefined,
      });
      setCloneDialogOpen(false);
      setNewProfileId('');
      setNewProfileName('');
    } catch (error) {
      console.error('克隆失败:', error);
    }
  };

  const handleDelete = async () => {
    const confirmed = window.confirm(
      `确定删除 Profile「${currentProfile.name}」？此操作不可恢复。`,
    );
    if (!confirmed) return;
    try {
      await deleteProfile({ profileId: currentProfile.profileId });
    } catch (error) {
      console.error('删除失败:', error);
    }
  };

  const handleReset = async () => {
    const confirmed = window.confirm(
      `确定恢复 Profile「${currentProfile.name}」到默认状态？将重新生成历史数据。`,
    );
    if (!confirmed) return;
    try {
      await resetProfile({ profileId: currentProfile.profileId });
    } catch (error) {
      console.error('恢复失败:', error);
    }
  };

  return (
    <div className="space-y-4">
      {/* 操作按钮 */}
      <div className="flex gap-2">
        <button
          onClick={() => setCloneDialogOpen(true)}
          disabled={isBusy}
          className="px-3 py-1.5 text-xs rounded-lg bg-slate-900 border-2 border-slate-800 text-slate-400 hover:border-slate-700 transition-all disabled:opacity-50"
        >
          + 复制新建
        </button>
        <button
          onClick={handleReset}
          disabled={isBusy}
          className="px-3 py-1.5 text-xs rounded-lg bg-slate-900 border-2 border-slate-800 text-slate-400 hover:border-slate-700 transition-all disabled:opacity-50"
        >
          {isResettingProfile ? '恢复中...' : '恢复默认'}
        </button>
      </div>

      {/* 基本信息 */}
      <div className="space-y-3">
        <div className="text-[10px] text-slate-500 uppercase tracking-wide font-bold">基本信息</div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-slate-500">姓名</label>
            <input
              key={currentProfile.profileId + currentProfile.name}
              defaultValue={currentProfile.name}
              onBlur={(e) => handleBlur('name', e.target.value)}
              disabled={isBusy}
              className="w-full px-2 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-300 focus:border-blue-500 focus:outline-none disabled:opacity-50"
            />
          </div>
          <div>
            <label className="text-[10px] text-slate-500">年龄</label>
            <input
              key={currentProfile.profileId + currentProfile.age}
              type="number"
              defaultValue={currentProfile.age}
              onBlur={(e) => handleBlur('age', Number(e.target.value))}
              disabled={isBusy}
              className="w-full px-2 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-300 focus:border-blue-500 focus:outline-none disabled:opacity-50"
            />
          </div>
        </div>
        <div>
          <label className="text-[10px] text-slate-500">性别</label>
          <select
            key={currentProfile.profileId + currentProfile.gender}
            defaultValue={currentProfile.gender}
            onBlur={(e) => handleBlur('gender', e.target.value)}
            disabled={isBusy}
            className="w-full px-2 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-300 focus:border-blue-500 focus:outline-none disabled:opacity-50"
          >
            <option value="male">男</option>
            <option value="female">女</option>
          </select>
        </div>
      </div>

      {/* 基线指标 */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="text-[10px] text-slate-500 uppercase tracking-wide font-bold">基线指标</div>
          <span className="text-[9px] text-amber-500/70">修改将重生成 30 天数据</span>
        </div>
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-slate-500">静息心率 (bpm)</label>
              <input
                key={currentProfile.profileId + currentProfile.baseline.restingHr}
                type="number"
                defaultValue={currentProfile.baseline.restingHr}
                onBlur={(e) => handleBaselineBlur('restingHr', Number(e.target.value))}
                disabled={isBusy}
                className="w-full px-2 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-300 focus:border-amber-500 focus:outline-none disabled:opacity-50"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-500">HRV (ms)</label>
              <input
                key={currentProfile.profileId + currentProfile.baseline.hrv}
                type="number"
                defaultValue={currentProfile.baseline.hrv}
                onBlur={(e) => handleBaselineBlur('hrv', Number(e.target.value))}
                disabled={isBusy}
                className="w-full px-2 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-300 focus:border-amber-500 focus:outline-none disabled:opacity-50"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[10px] text-slate-500">血氧 (%)</label>
              <input
                key={currentProfile.profileId + currentProfile.baseline.spo2}
                type="number"
                defaultValue={currentProfile.baseline.spo2}
                onBlur={(e) => handleBaselineBlur('spo2', Number(e.target.value))}
                disabled={isBusy}
                className="w-full px-2 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-300 focus:border-amber-500 focus:outline-none disabled:opacity-50"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-500">睡眠 (分钟)</label>
              <input
                key={currentProfile.profileId + currentProfile.baseline.avgSleepMinutes}
                type="number"
                defaultValue={currentProfile.baseline.avgSleepMinutes}
                onBlur={(e) => handleBaselineBlur('avgSleepMinutes', Number(e.target.value))}
                disabled={isBusy}
                className="w-full px-2 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-300 focus:border-amber-500 focus:outline-none disabled:opacity-50"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-500">步数</label>
              <input
                key={currentProfile.profileId + currentProfile.baseline.avgSteps}
                type="number"
                defaultValue={currentProfile.baseline.avgSteps}
                onBlur={(e) => handleBaselineBlur('avgSteps', Number(e.target.value))}
                disabled={isBusy}
                className="w-full px-2 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-300 focus:border-amber-500 focus:outline-none disabled:opacity-50"
              />
            </div>
          </div>
        </div>
      </div>

      {/* 删除按钮 */}
      <button
        onClick={handleDelete}
        disabled={isBusy || profileCount <= 1}
        className="w-full px-3 py-2 text-xs rounded-lg bg-red-950/30 border-2 border-red-900/30 text-red-400 hover:border-red-800 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
      >
        {isDeletingProfile ? '删除中...' : `删除此 Profile${profileCount <= 1 ? '（至少保留 1 个）' : ''}`}
      </button>

      {/* 克隆对话框 */}
      {cloneDialogOpen && (
        <div className="p-3 rounded-xl bg-slate-900/80 border-2 border-slate-700 space-y-2">
          <div className="text-xs text-slate-400 font-bold">复制新建</div>
          <input
            placeholder="新 Profile ID（小写字母/数字/连字符）"
            value={newProfileId}
            onChange={(e) => setNewProfileId(e.target.value)}
            pattern="^[a-z0-9-]+$"
            className="w-full px-2 py-1.5 text-xs bg-slate-800 border border-slate-700 rounded-lg text-slate-300 focus:border-blue-500 focus:outline-none"
          />
          <input
            placeholder="名称（可选）"
            value={newProfileName}
            onChange={(e) => setNewProfileName(e.target.value)}
            className="w-full px-2 py-1.5 text-xs bg-slate-800 border border-slate-700 rounded-lg text-slate-300 focus:border-blue-500 focus:outline-none"
          />
          <div className="flex gap-2">
            <button
              onClick={handleClone}
              disabled={isCloningProfile || !newProfileId.trim()}
              className="flex-1 px-3 py-1.5 text-xs rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-all disabled:opacity-50"
            >
              {isCloningProfile ? '创建中...' : '创建'}
            </button>
            <button
              onClick={() => {
                setCloneDialogOpen(false);
                setNewProfileId('');
                setNewProfileName('');
              }}
              className="px-3 py-1.5 text-xs rounded-lg bg-slate-800 text-slate-400 hover:bg-slate-700 transition-all"
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 验证编译通过**

Run: `pnpm --filter web exec tsc --noEmit`
Expected: 无编译错误

- [ ] **Step 3: 提交**

```bash
git add apps/web/src/components/god-mode/ProfileEditor.tsx
git commit -m "feat(web): add ProfileEditor component with baseline editing"
```

---

## Task 10: 前端 — 集成到 GodModePanel + 动态 Profile 切换器

**Files:**
- Modify: `apps/web/src/components/god-mode/GodModePanel.tsx`

- [ ] **Step 1: 修改 GodModePanel — Profile 切换器改为动态 + 添加 ProfileEditor 区块**

在 `apps/web/src/components/god-mode/GodModePanel.tsx` 中进行修改：

1. 在文件顶部 import 区添加：

```typescript
import { ProfileEditor } from './ProfileEditor';
```

2. 将硬编码的 profile 切换器区块（`<Section title="Profile Switch">`，约第 198-216 行）替换为动态版本：

将这段代码：
```tsx
{['profile-a', 'profile-b', 'profile-c'].map((id) => (
  <button
    key={id}
    disabled={isSwitchingProfile || isRunningScenario}
    onClick={() => handleProfileSwitch(id)}
    className={`px-5 py-3 rounded-2xl text-sm font-medium text-left transition-all border-2 ${
      currentProfileId === id
        ? 'bg-blue-600 border-blue-500 text-white shadow-xl shadow-blue-500/20'
        : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700 hover:bg-slate-800/80'
    } ${isSwitchingProfile || isRunningScenario ? 'opacity-50 cursor-not-allowed' : ''}`}
  >
    {id === 'profile-a' ? '👨‍💻 用户 A (平衡型)' : id === 'profile-b' ? '🏃 用户 B (运动型)' : '🧘 用户 C (静息型)'}
    {isSwitchingProfile && currentProfileId !== id && ' ...'}
  </button>
))}
```

替换为：
```tsx
{(godModeState?.availableProfiles ?? []).map((p) => (
  <button
    key={p.profileId}
    disabled={isSwitchingProfile || isRunningScenario}
    onClick={() => handleProfileSwitch(p.profileId)}
    className={`px-5 py-3 rounded-2xl text-sm font-medium text-left transition-all border-2 ${
      currentProfileId === p.profileId
        ? 'bg-blue-600 border-blue-500 text-white shadow-xl shadow-blue-500/20'
        : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700 hover:bg-slate-800/80'
    } ${isSwitchingProfile || isRunningScenario ? 'opacity-50 cursor-not-allowed' : ''}`}
  >
    {p.name}
    {isSwitchingProfile && currentProfileId !== p.profileId && ' ...'}
  </button>
))}
```

3. 在 Profile Switch Section 之后、Timeline Control Section 之前，添加 ProfileEditor 区块。在 `</Section>` （Profile Switch 的结束标签）之后追加：

```tsx
{/* Profile 编辑器 */}
<Section title="Profile Management" className="space-y-4">
  <ProfileEditor />
</Section>
```

- [ ] **Step 2: 验证编译通过**

Run: `pnpm --filter web exec tsc --noEmit`
Expected: 无编译错误

- [ ] **Step 3: 启动开发服务器进行手动验证**

Run: `pnpm --filter web dev`
验证以下功能：
1. God Mode 面板中 Profile 切换器显示动态 profile 列表
2. ProfileEditor 区块显示当前 profile 的基本信息和基线指标
3. 修改姓名/年龄后失焦自动保存
4. 修改基线指标后失焦自动保存，触发 history 重生成
5. 「+ 复制新建」按钮弹出克隆对话框
6. 「恢复默认」按钮触发确认后恢复
7. 「删除此 Profile」按钮在只有 1 个 profile 时禁用

- [ ] **Step 4: 提交**

```bash
git add apps/web/src/components/god-mode/GodModePanel.tsx
git commit -m "feat(web): integrate ProfileEditor and dynamic profile switcher into GodModePanel"
```

---

## Self-Review Checklist

- [x] **Spec 覆盖度:** 所有 5 个需求（运行时编辑、持久化、增删 profile、Baseline 联动、恢复默认）都有对应 Task
- [x] **API 覆盖度:** 4 个 API 端点（PUT update、POST clone、DELETE、POST reset）全部实现
- [x] **前端覆盖度:** ProfileEditor 实现了所有 UI 交互（即时保存、Baseline 警告、删除确认、克隆对话框）
- [x] **错误处理覆盖度:** 写文件失败回滚、无效字段 422、409 重复 ID、400 删除最后一个、404 不存在
- [x] **无占位符:** 每个 Step 都包含完整代码
- [x] **类型一致性:** 所有方法签名和属性名在 Task 间保持一致（`profileId`, `changes`, `baseline`, `regenerated`）
