# 记忆机制技术总结

---

## 文件索引

### 类型定义

| 文件 | 说明 |
|------|------|
| `packages/agent-core/src/types/memory.ts` | 会话记忆 & 分析记忆基础类型 |
| `packages/agent-core/src/types/durable-memory.ts` | 持久记忆核心类型 & Store 接口 |
| `packages/agent-core/src/types/workflow-memory.ts` | 工作流记忆类型（联系人、授权、发件箱） |

### Schema & 校验

| 文件 | 说明 |
|------|------|
| `packages/agent-core/src/memory/durable-memory-schema.ts` | 持久记忆 Zod Schema |

### 记忆存储

| 文件 | 说明 |
|------|------|
| `packages/agent-core/src/memory/session-memory-store.ts` | 会话记忆 — 内存 Map，按 sessionId 索引 |
| `packages/agent-core/src/memory/analytical-memory-store.ts` | 分析记忆 — 昂贵计算结果的 TTL 缓存 |
| `packages/agent-core/src/memory/in-memory-durable-memory-store.ts` | 持久记忆内存实现（开发/降级用） |
| `packages/agent-core/src/memory/in-memory-agent-cache-store.ts` | Agent 响应缓存（内存实现） |
| `packages/agent-core/src/memory/in-memory-workflow-state-store.ts` | 工作流状态（内存实现） |

### 业务逻辑

| 文件 | 说明 |
|------|------|
| `packages/agent-core/src/memory/memory-extraction-service.ts` | LLM 驱动的记忆候选提取 |
| `packages/agent-core/src/memory/memory-candidate-validator.ts` | 候选记忆校验（证据、来源、类型） |
| `packages/agent-core/src/memory/memory-policy.ts` | 记忆策略配置 |
| `packages/agent-core/src/memory/durable-memory-context.ts` | 将持久事实渲染为 Agent prompt 片段 |

### 持久化（Supabase）

| 文件 | 说明 |
|------|------|
| `apps/agent-api/src/persistence/supabase/memory-store.ts` | 持久记忆 SQL 存储（候选 + 事实 + 修订） |
| `apps/agent-api/src/persistence/supabase/cache-store.ts` | Agent 缓存 SQL 存储 |
| `apps/agent-api/src/persistence/supabase/workflow-store.ts` | 工作流状态 SQL 存储 |
| `apps/agent-api/src/persistence/supabase/client.ts` | Supabase 客户端连接 |
| `apps/agent-api/src/runtime/memory-services.ts` | 记忆后端工厂（Supabase / 内存切换） |

### API 路由

| 文件 | 说明 |
|------|------|
| `apps/agent-api/src/modules/memory/routes.ts` | 记忆候选确认/拒绝端点 |
| `apps/agent-api/src/modules/ai/routes.ts` | AI 端点（集成记忆提取） |

### 数据库

| 文件 | 说明 |
|------|------|
| `supabase/migrations/202605180001_memory_upgrade.sql` | 记忆系统完整数据库 Schema |

### 前端

| 文件 | 说明 |
|------|------|
| `apps/web/src/hooks/use-memory-query.ts` | 记忆操作 React Hook |
| `apps/web/src/components/advisor/MemoryCandidateCard.tsx` | 记忆候选确认 UI 组件 |

### 测试 & 评测

| 文件 | 说明 |
|------|------|
| `packages/agent-core/src/__tests__/memory/*.test.ts` | 记忆模块单元测试 |
| `packages/agent-core/evals/cases/core/advisor-chat/chat-*.json` | 记忆相关评测场景 |
| `docs/test/memory-upgrade-demo-runbook.md` | 记忆升级演示手册 |

---

## 一、三层记忆架构

系统按生命周期和用途划分为三个独立的记忆层：

```
┌─────────────────────────────────────────────────────┐
│  用户消息                                            │
│    ↓                                                 │
│  Session Memory ──→ 会话级聊天历史                    │
│    ↓                                                 │
│  Analytical Memory ──→ 缓存计算结果（首页摘要等）     │
│    ↓                                                 │
│  Durable Memory ──→ 持久健康事实（用户确认后写入）    │
│    ↓                                                 │
│  注入 Agent Context ──→ AI 回复时引用                 │
└─────────────────────────────────────────────────────┘
```

### 1.1 会话记忆（Session Memory）

**职责**: 保存当前对话上下文，为 AI 提供连续对话能力。

```typescript
interface SessionConversationMemory {
  sessionId: string;
  profileId: string;
  messages: ConversationMessage[];
  updatedAt: number;
}
```

- **存储**: 内存 Map
- **生命周期**: 会话级别，切换 profile 时清除
- **实现**: `packages/agent-core/src/memory/session-memory-store.ts`

### 1.2 分析记忆（Analytical Memory）

**职责**: 缓存昂贵的 AI 计算结果，避免重复调用 LLM。

```typescript
interface AnalyticalMemory {
  sessionId: string;
  profileId: string;
  latestHomepageBrief?: string;              // 首页摘要缓存
  latestViewSummaryByScope?: Record<string, string>;  // 视图级摘要
  latestRuleSummary?: string;                // 规则评估结果
  updatedAt: number;
}
```

- **存储**: 内存或 SQL 缓存
- **生命周期**: TTL 驱动，默认 2 小时过期
- **实现**: `packages/agent-core/src/memory/analytical-memory-store.ts`

### 1.3 持久记忆（Durable Memory）

**职责**: 持久存储用户确认的健康事实，跨会话保留。

```typescript
interface UserMemoryFact {
  id: string;
  userScopeId: string;              // 多租户隔离
  profileId: string;                // Profile 隔离
  kind: MemoryKind;                 // 事实类型
  canonicalKey: string;             // 唯一标识（如 "allergy:peanut"）
  payload: Record<string, unknown>; // 结构化数据
  status: 'active' | 'revoked' | 'superseded';
  sensitivity: 'standard' | 'health' | 'workflow';
  sourceCandidateId: string;        // 溯源到候选记录
  createdAt: number;
  updatedAt: number;
  revokedAt?: number;
}
```

- **存储**: Supabase PostgreSQL（生产） / 内存 Map（开发/降级）
- **生命周期**: 持久化，直到用户主动撤销
- **实现**: `packages/agent-core/src/types/durable-memory.ts`（类型）, `apps/agent-api/src/persistence/supabase/memory-store.ts`（存储）

---

## 二、记忆类型（MemoryKind）

持久记忆支持 8 种事实类型：

| 类型 | 说明 | 示例 |
|------|------|------|
| `allergy` | 过敏信息 | 花生过敏、海鲜过敏 |
| `medical_constraint` | 医学限制 | 服用降压药、孕期 |
| `goal` | 健康目标 | 每周运动 3 次、减重 5kg |
| `preference` | 用户偏好 | 偏好中医、不喜欢跑步 |
| `workflow_contact` | 医疗联系人 | 理疗师、主治医生联系方式 |
| `workflow_consent` | 授权同意 | 允许联系理疗师 |
| `correction` | 修正信息 | 更正之前的过敏信息 |
| `revocation` | 撤销事实 | 不再对某物过敏 |

---

## 三、记忆生命周期

### 3.1 完整流程

```
用户消息："我对花生过敏"
      ↓
 ① LLM 提取候选记忆（MemoryExtractionService）
      ↓
 ② 校验候选（MemoryCandidateValidator）
      ├── 必须有用户声明的来源
      ├── 必须有原文证据引用
      ├── 必须需要用户确认
      └── 类型必须合法
      ↓
 ③ 写入 memory_candidates 表（status: pending, TTL 24h）
      ↓
 ④ 前端展示 MemoryCandidateCard，用户确认或拒绝
      ↓
 ⑤ 确认 → 事务处理：
      ├── 查找已有 active 事实
      ├── 已存在 → 更新（旧事实标记 superseded）
      ├── 不存在 → 创建新事实
      ├── 写入 memory_revisions 审计记录
      └── 更新候选状态为 confirmed
      ↓
 ⑥ 事实生效，注入 AI Context
```

### 3.2 候选记忆（Candidate）

候选记忆是用户确认前的中间状态：

```typescript
interface MemoryCandidate {
  id: string;
  kind: MemoryKind;
  canonicalKey: string;
  payload: Record<string, unknown>;
  evidenceQuote: string;           // 原文证据
  confidence: 'explicit' | 'ambiguous';
  proposedConfirmationText: string; // 向用户展示的确认文本
  status: 'pending' | 'confirmed' | 'rejected' | 'expired' | 'superseded';
  expiresAt: number;               // 自动过期时间
}
```

---

## 四、数据库 Schema

### 4.1 核心表

**`memory_candidates`** — 待确认的候选记忆

| 列 | 类型 | 说明 |
|----|------|------|
| `id` | UUID PK | 主键 |
| `user_scope_id` | TEXT | 多租户隔离 |
| `profile_id` | TEXT | Profile 隔离 |
| `session_id` | TEXT | 来源会话 |
| `source_message_id` | TEXT | 来源消息 |
| `kind` | TEXT (CHECK) | 事实类型 |
| `canonical_key` | TEXT | 唯一标识 |
| `payload_json` | JSONB | 结构化数据 |
| `evidence_quote` | TEXT | 原文证据 |
| `confidence` | TEXT (CHECK) | explicit / ambiguous |
| `proposed_confirmation_text` | TEXT | 用户确认文本 |
| `status` | TEXT (CHECK) | pending / confirmed / rejected / expired / superseded |
| `expires_at` | TIMESTAMPTZ | 过期时间 |

**`user_memory_facts`** — 已确认的持久事实

| 列 | 类型 | 说明 |
|----|------|------|
| `id` | UUID PK | 主键 |
| `user_scope_id` | TEXT | 多租户隔离 |
| `profile_id` | TEXT | Profile 隔离 |
| `kind` | TEXT | 事实类型 |
| `canonical_key` | TEXT | 唯一标识 |
| `payload_json` | JSONB | 结构化数据 |
| `status` | TEXT (CHECK) | active / revoked / superseded |
| `sensitivity` | TEXT (CHECK) | standard / health / workflow |
| `source_candidate_id` | UUID FK → memory_candidates | 溯源 |
| `revoked_at` | TIMESTAMPTZ | 撤销时间（可选） |

唯一约束：`UNIQUE (user_scope_id, profile_id, canonical_key) WHERE status = 'active'`

**`memory_revisions`** — 完整审计日志

| 列 | 类型 | 说明 |
|----|------|------|
| `id` | UUID PK | 主键 |
| `memory_fact_id` | UUID FK → user_memory_facts | 关联事实 |
| `revision_type` | TEXT (CHECK) | create / update / revoke / supersede |
| `previous_payload_json` | JSONB | 变更前数据 |
| `next_payload_json` | JSONB | 变更后数据 |
| `source_candidate_id` | UUID FK → memory_candidates | 触发来源 |

### 4.2 辅助表

| 表 | 说明 |
|----|------|
| `workflow_contacts` | 医疗联系人（理疗师、医生） |
| `workflow_consents` | 用户授权记录 |
| `workflow_outbox` | 待执行的联络任务 |
| `workflow_events` | 工作流事件审计日志 |
| `agent_cache_entries` | Agent 响应缓存 |

---

## 五、与 Agent 运行时的集成

### 5.1 上下文构建

记忆通过 `buildAgentContext()` 注入 Agent 运行时：

```typescript
// packages/agent-core/src/context/context-builder.ts
export function buildAgentContext(
  request: AgentRequest,
  deps: ContextBuilderDeps,
  durableFacts: UserMemoryFact[] = [],  // ← 持久事实在此注入
): AgentContext {
  return {
    memory: {
      recentMessages,                // 会话记忆
      latestHomepageBrief,           // 分析记忆
      latestViewSummary,
      latestRuleSummary,
      durableFacts,                  // 持久记忆
    },
  };
}
```

### 5.2 Prompt 渲染

持久事实通过 `renderDurableMemoryFacts()` 渲染为 prompt 段落，AI 在生成回复时可直接引用：

```typescript
// packages/agent-core/src/prompts/task-builder.ts
const durableMemoryContext = renderDurableMemoryFacts(
  context.memory.durableFacts,
  locale
);
sections.push(...durableMemoryContext);
```

渲染效果示例：

```
## 用户已确认记忆
- allergy:peanut {"allergen":"peanut","severity":"unknown"}
- goal:exercise-weekly {"frequency":"3x/week"}
```

### 5.3 后端工厂

通过环境变量 `MEMORY_BACKEND` 切换存储后端：

```typescript
// apps/agent-api/src/runtime/memory-services.ts
export function createMemoryServices(config: MemoryServicesConfig): MemoryServices {
  if (config.MEMORY_BACKEND === 'supabase') {
    return {
      candidates: new SupabaseMemoryStore(sql),
      durable: new SupabaseMemoryStore(sql),
      cache: new SupabaseAgentCacheStore(sql),
      workflow: new SupabaseWorkflowStateStore(sql),
    };
  }
  // 降级到内存存储
  return { /* InMemory 实现 */ };
}
```

相关环境变量：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `MEMORY_BACKEND` | `memory` | 存储后端（`supabase` / `memory`） |
| `SUPABASE_DB_URL` | — | PostgreSQL 连接字符串 |
| `MEMORY_CANDIDATE_TTL_HOURS` | `24` | 候选记忆过期时间 |
| `DEMO_USER_SCOPE_ID` | `demo` | 演示模式多租户 ID |

---

## 六、关键设计决策

| 决策 | 理由 |
|------|------|
| **用户确认必须** | 健康数据敏感，LLM 提取可能出错，需要用户显式批准 |
| **证据溯源** | 每条事实关联原始消息和引用文本，支持审计和纠错 |
| **唯一性约束** | 同一 profile 下每个 `canonicalKey` 只保留一条活跃事实，避免冲突 |
| **多租户隔离** | `userScopeId` + `profileId` 双重隔离，防止数据越权 |
| **敏感度分级** | `standard` / `health` / `workflow` 三级，差异化保护策略 |
| **优雅降级** | 数据库不可用时回退到内存存储，保证核心功能可用 |
| **候选 TTL** | 24 小时自动过期，避免无效候选堆积 |
| **完整审计** | `memory_revisions` 记录所有变更，支持回溯和合规 |

---

*最后更新：2026-05-20*
