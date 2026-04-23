# Profile 可定制化改造设计

> 日期：2026-04-23
> 状态：待实现

## 背景

当前 mock profile 系统基于静态 JSON 文件，在服务启动时一次性加载到内存，运行时只读。无法满足 demo 演示中实时修改 profile 个人信息、创建/删除 profile、以及持久化自定义配置的需求。

## 需求

1. **运行时实时编辑**：修改 profile 字段后立即生效（AI 分析、前端展示同步更新）
2. **持久化**：编辑结果保存到文件，重启后保留
3. **增删 profile**：可基于现有 profile 复制创建新 profile，也可删除
4. **Baseline 联动**：修改 baseline 指标时自动重新生成 30 天 history 数据
5. **恢复默认**：支持将 profile 恢复到服务启动时的原始状态

## 方案：内存 Override + 自动持久化

编辑操作同时更新文件和内存，保证即时性和持久化。保留原始模板快照用于恢复默认。

### 架构

```
God Mode Panel (前端)
    │ API 调用
God Mode Routes (后端)
    │
ProfileManager (新增服务)
    ├── updateProfile(id, changes)    → 写文件 + reloadRegistry
    ├── cloneProfile(fromId, newId)   → 复制文件 + 注册
    ├── deleteProfile(id)             → 删文件 + 注销
    └── resetProfile(id)              → 写回快照 + reload
    内部:
    - baseline 变更时调用 generateHistory() 重生成数据
    - 启动时保存原始 profile 快照
```

## API 设计

基于现有 `/api/god-mode/...` 路由扩展。

### PUT /god-mode/profiles/:profileId

更新 profile 字段（局部更新）。

请求体：
```typescript
interface UpdateProfileRequest {
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
```

响应体：
```typescript
interface UpdateProfileResponse {
  profile: SandboxProfile;  // 更新后的完整 profile
  regenerated: boolean;     // 是否触发了 history 重生成
}
```

处理逻辑：
1. 读取当前 profile JSON 文件
2. 浅合并 profile 层字段，baseline 做深合并
3. Zod schema 校验
4. 写回 JSON 文件
5. 检测 baseline 是否变化
   - 变化 → `generateHistory()` + `generateTimelineScript()` + `reloadRegistry()`
   - 未变 → `reloadRegistry()`

### POST /god-mode/profiles

从现有 profile 复制创建新 profile。

请求体：
```typescript
interface CloneProfileRequest {
  sourceProfileId: string;
  newProfileId: string;
  overrides?: Partial<SandboxProfile>;
}
```

处理逻辑：
1. 校验 newProfileId 不重复，格式合法（`[a-z0-9-]`）
2. 复制源 profile JSON → 新文件
3. 合并 overrides
4. 复制源 history/timeline 文件 → 新文件
5. 更新 manifest.json
6. 如有 baseline overrides，重生成 history
7. `reloadRegistry()`

### DELETE /god-mode/profiles/:profileId

删除 profile。至少保留 1 个 profile。

处理逻辑：
1. 检查剩余 profile 数量 >= 2
2. 删除 profile JSON 文件
3. 删除对应的 history/timeline 文件
4. 更新 manifest.json
5. `reloadRegistry()`
6. 如果删除的是当前活跃 profile，自动切换到第一个可用 profile

### POST /god-mode/profiles/:profileId/reset

恢复到原始模板。

处理逻辑：
1. 从内存取出启动时保存的原始快照
2. 写回 profile JSON 文件
3. 重生成 history（原始 baseline 可能与当前不同）
4. `reloadRegistry()`

## 数据模型

### 原始快照存储

```typescript
// ProfileManager 内部
private originalSnapshots: Map<string, string>; // profileId → 原始 JSON 字符串

// 启动时保存
loadAllProfiles() 时，对每个 profile 读取文件内容并保存快照
```

### Profile 文件结构（不变）

```json
{
  "profile": {
    "profileId": "profile-a",
    "name": "张健康",
    "age": 32,
    "gender": "male",
    "avatar": "avatar-a.png",
    "tags": ["精力充沛", "睡眠质量优"],
    "baseline": { ... }
  },
  "initialDemoTime": "...",
  "historyRef": { "file": "history/profile-a-daily-records.json" },
  "timelineScriptRef": { "file": "timeline-scripts/profile-a-day-1.json" }
}
```

## 前端 UI

在现有 God Mode Panel 中新增 Profile 管理区块，位于 profile 切换器下方。

### 布局

```
┌─ God Mode Panel ──────────────────────┐
│  [Profile 切换下拉]                    │
│                                       │
│  ── Profile 管理 ──────────────────   │
│  [+ 复制新建]  [恢复默认]             │
│                                       │
│  基本信息                              │
│   姓名: [input]                       │
│   年龄: [input]   性别: [select]      │
│   标签: [tag list] [+ 添加]           │
│                                       │
│  基线指标                              │
│   静息心率: [input] bpm               │
│   HRV:      [input] ms                │
│   血氧:     [input] %                 │
│   日均睡眠: [input] 分钟              │
│   日均步数: [input]                   │
│   ⚠ 修改基线将重生成30天数据          │
│                                       │
│  [删除此 Profile]                     │
└───────────────────────────────────────┘
```

### 交互

- **即时保存**：字段失焦（blur）时自动提交 API，无确认按钮
- **Baseline 警告**：baseline 字段旁显示提示「修改将重生成 30 天数据」
- **重生成反馈**：baseline 修改时 toast 提示「正在重新生成历史数据...」
- **表单校验**：复用 Zod schema，前端即时校验，字段级错误提示
- **删除确认**：弹出确认对话框，且至少保留 1 个 profile 时禁用删除
- **复制新建**：弹出对话框输入新 profile ID（必填）和名称（可选）

## 错误处理

| 场景 | 处理 |
|------|------|
| 写文件失败 | API 500，toast「保存失败」，内存不变 |
| History 重生成失败 | 回滚 profile 文件，API 500 + 错误详情 |
| 无效字段值 | Zod 校验失败 → 422 + 字段级错误，前端标红 |
| 删除最后一个 profile | 前端禁用按钮，API 400 |
| Profile ID 重复 | API 409 |
| 非法 Profile ID | 前端正则 `[a-z0-9-]`，后端再校验 |

## 边界情况

- **切换 profile 后编辑**：即时保存模式，无未保存中间状态
- **并发编辑**：单用户单会话场景，不处理并发。文件写入用同步 `writeFileSync`
- **新增 profile 的文件**：克隆时复制源文件，baseline 有变时重生成。命名遵循 `profile-xxx-daily-records.json`
- **Manifest 同步**：新增/删除时同步更新 manifest.json，先写 profile 文件再写 manifest

## 受影响的现有模块

| 模块 | 变更类型 |
|------|---------|
| `apps/agent-api/src/modules/god-mode/service.ts` | 新增 profile CRUD 方法 |
| `apps/agent-api/src/modules/god-mode/routes.ts` | 新增 4 个路由 |
| `apps/agent-api/src/runtime/registry.ts` | 暴露 reloadProfiles 供 ProfileManager 使用 |
| `packages/sandbox/src/loader.ts` | 新增写回文件的 helper 函数 |
| `packages/sandbox/src/generators/history.ts` | 导出 generateHistory 供联动调用 |
| `packages/sandbox/src/generators/timeline-script.ts` | 导出 generateTimelineScript 供联动调用 |
| `apps/web/src/components/god-mode/GodModePanel.tsx` | 新增 Profile 管理区块 |
| `apps/web/src/stores/profile.store.ts` | 监听 profile 变更事件 |
