# 系统性修复：跨简报周期的行动建议去重

## Context

当前 Mock Timeline 中，用户触发"短距离步行"后触发"早餐"，LLM 在进餐简报中仍然推荐"饭后慢走"，与上一次的步行建议重复。

根因不在某个具体事件转换上，而在于 **系统不跟踪上一轮推荐了什么行动**。当前的 `buildActionSuppressions` 只做事件类型间的硬编码抑制（workout→非workout、同类别重复），对 meal、rest_break、stress_spike 等事件场景完全失效。

需要建立一个 **基于历史的行动类别去重机制**：记录历次简报推荐了哪些类别的行动，在下一轮自动抑制相同或语义相近的类别，不依赖事件类型组合。

---

## 抑制策略：双维度 + 语义分层

### 语义分组

```
strenuous_activity（高强度体力活动）:
  - movement_reset（步行/慢走）
  - training_adjustment（有氧/拉伸）

light_posture（低强度体态调整）:
  - posture（站立/坐姿调整）

nervous_system_reset（神经系统恢复）:
  - breathing_reset（呼吸练习）
  - sleep_protection（睡眠保护）

recovery_intake（摄入恢复）:
  - hydration（补水）
  - nutrition（营养）

data / safety:
  - data_quality / medical_attention（不会被重复推荐）
```

### 双维度规则

| 条件 | 效果 |
|------|------|
| 同语义组距上次推荐 < 4h | **冷却抑制**（不管出现几次） |
| 同语义组距上次推荐 ≥ 4h 且 24h 内已出现 ≥ 2 次 | **频率抑制** |
| 同语义组距上次推荐 ≥ 4h 且 24h 内出现 < 2 次 | **允许** |

### 效果示例

| 轮次 | 时间 | 事件 | 推荐 | 结果 |
|------|------|------|------|------|
| 1 | 08:00 | 初始 | movement_reset（短距离步行） | 展示，strenuous 计数=1 |
| 2 | 08:20 | 早餐 | ~~movement_reset~~ | **冷却抑制**（< 4h），改为 hydration/breathing |
| 3 | 10:00 | 久坐 | posture（站立活动） | 允许（light_posture 不受 strenuous 冷却影响） |
| 4 | 12:30 | 午餐 | movement_reset | 允许（≥ 4h，今日第 2 次） |
| 5 | 14:00 | 久坐 | ~~movement_reset~~ | **冷却抑制**，改为 posture/breathing |
| 6 | 18:00 | 运动 | hydration + nutrition | 允许（不同组） |

---

## 实施步骤

### Step 1: 扩展 AnalyticalMemory 类型

**文件**: `packages/agent-core/src/types/memory.ts`

```typescript
export interface RecentRecommendedAction {
  category: string;        // RecommendedFocus['category']
  microEventType?: string; // MicroEventType
  title: string;
  timestamp: number;       // Date.now()
}

export interface AnalyticalMemory {
  // ... 现有字段 ...
  /** 历次 homepage 简报推荐的行动类别（累计，上限 20 条） */
  latestHomepageActions?: RecentRecommendedAction[];
}
```

### Step 2: 扩展 AnalyticalMemoryStore

**文件**: `packages/agent-core/src/memory/analytical-memory-store.ts`

新增方法：
```typescript
setHomepageActions(sessionId: string, profileId: string, actions: RecentRecommendedAction[]): void;
```

- 新 actions 追加到现有列表（不覆盖）
- 列表总长上限 20 条（FIFO 淘汰最旧的）
- `invalidateOnProfileSwitch` 和 `invalidateOnOverride` 中清除 `latestHomepageActions`

### Step 3: 传递历史到 AgentContext

**文件**: `packages/agent-core/src/types/agent-context.ts`

`AgentContext.memory` 新增：
```typescript
latestHomepageActions?: RecentRecommendedAction[];
```

**文件**: `packages/agent-core/src/context/context-builder.ts`

在 `buildAgentContext` 中读取：
```typescript
latestHomepageActions: analytical?.latestHomepageActions,
```

### Step 4: 语义组映射 + 双维度抑制逻辑

**文件**: `packages/agent-core/src/context/homepage-event-insights.ts`

**4a. 语义组常量**：

```typescript
export const ACTION_SEMANTIC_GROUPS: Record<string, string> = {
  movement_reset: 'strenuous_activity',
  training_adjustment: 'strenuous_activity',
  posture: 'light_posture',
  breathing_reset: 'nervous_system_reset',
  sleep_protection: 'nervous_system_reset',
  hydration: 'recovery_intake',
  nutrition: 'recovery_intake',
  data_quality: 'data',
  medical_attention: 'safety',
};

const COOLDOWN_MS = 4 * 60 * 60 * 1000;     // 4h 冷却
const DAILY_CAP = 2;                          // 每语义组 24h 内最多 2 次
const DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;  // 24h 滑动窗口
```

**4b. 扩展 BuildHomepageEventInsightsInput**：

```typescript
export interface BuildHomepageEventInsightsInput {
  homepage: Pick<HomepageContextPacket, 'recentEvents' | 'latest24h' | 'trend7d' | 'rulesInsights'>;
  demoNow?: string;
  previousRecommendedActions?: RecentRecommendedAction[];
}
```

**4c. 双维度抑制函数**：

```typescript
function buildHistoryBasedSuppressions(
  previousActions: RecentRecommendedAction[],
  now: number = Date.now(),
): ActionSuppression[] {
  const suppressions: ActionSuppression[] = [];

  // 按语义组聚合
  const groupEntries = new Map<string, RecentRecommendedAction[]>();
  for (const action of previousActions) {
    const group = ACTION_SEMANTIC_GROUPS[action.category];
    if (!group) continue;
    const list = groupEntries.get(group) ?? [];
    list.push(action);
    groupEntries.set(group, list);
  }

  // 对每个语义组判断是否抑制
  for (const [group, actions] of groupEntries) {
    // 按时间排序（最新在前）
    const sorted = actions.sort((a, b) => b.timestamp - a.timestamp);
    const lastTime = sorted[0]!.timestamp;

    // 维度一：冷却检查（距上次 < 4h）
    const inCooldown = (now - lastTime) < COOLDOWN_MS;

    // 维度二：24h 频率检查
    const recentCount = sorted.filter(a => (now - a.timestamp) < DAILY_WINDOW_MS).length;
    const overDailyCap = recentCount >= DAILY_CAP;

    if (inCooldown || overDailyCap) {
      // 抑制该语义组下所有 category
      for (const [category, g] of Object.entries(ACTION_SEMANTIC_GROUPS)) {
        if (g === group) {
          suppressions.push({
            category,
            reason: inCooldown
              ? `语义组 '${group}' 在冷却期内（距上次 ${(now - lastTime) / 60000 | 0} min）`
              : `语义组 '${group}' 24h 内已推荐 ${recentCount} 次，达到每日上限`,
          });
        }
      }

      // 同时抑制该组下的 microEventType
      for (const action of sorted) {
        if (action.microEventType) {
          suppressions.push({
            interactionMicroEventType: action.microEventType,
            reason: `属于已抑制语义组 '${group}'`,
          });
        }
      }
    }
  }

  return suppressions;
}
```

**4d. 合并到 buildHomepageEventInsights**：

在 `buildHomepageEventInsights` 中，将 historySuppressions 传入 `buildRecommendedFocus`。

`buildRecommendedFocus` 内部在每个 case 的 `applyActionSuppressions` 调用中，追加 historySuppressions。

### Step 5: 传递历史到 ContextPacket

**文件**: `packages/agent-core/src/context/context-packet.ts`

`HomepageContextPacket` 新增：
```typescript
previousRecommendedActions?: RecentRecommendedAction[];
```

**文件**: `packages/agent-core/src/context/context-packet-builder.ts`

在 `buildHomepagePacket` 中传递：
```typescript
const previousActions = context.memory.latestHomepageActions;
return {
  ...homepageWithoutInsights,
  eventInsights: buildHomepageEventInsights({
    homepage: homepageWithoutInsights,
    demoNow: context.demoNow,
    previousRecommendedActions: previousActions,
  }),
  previousRecommendedActions: previousActions,
};
```

### Step 6: 写回行动历史到 AnalyticalMemory

**文件**: `packages/agent-core/src/runtime/agent-runtime.ts`

修改 `writeAnalyticalMemory`：
1. 新增 `packet` 参数
2. HOMEPAGE_SUMMARY 时从 packet 提取 recommendedFocus，追加写入 latestHomepageActions

```typescript
function writeAnalyticalMemory(
  deps: AgentRuntimeDeps,
  request: AgentRequest,
  context: AgentContext,
  summary: string,
  rulesResult: RuleEvaluationResult,
  packet?: TaskContextPacket,  // 新增
): void {
  // ... 现有逻辑 ...

  if (taskType === AgentTaskType.HOMEPAGE_SUMMARY && packet?.homepage) {
    const currentInsight = packet.homepage.eventInsights.find(
      (i) => i.mentionPolicy?.summary === 'allowed'
    );
    if (currentInsight) {
      const newActions: RecentRecommendedAction[] = currentInsight.recommendedFocus.map((focus, idx) => {
        const intent = currentInsight.actionIntents[idx];
        return {
          category: focus.category,
          microEventType: intent?.interaction?.kind === 'micro_event'
            ? intent.interaction.microEvent.type
            : undefined,
          title: intent?.title ?? focus.action,
          timestamp: Date.now(),
        };
      });
      deps.analyticalMemory.setHomepageActions(sessionId, profileId, newActions);
    }
  }
}
```

更新所有 `writeAnalyticalMemory` 调用点，传入 `packet`。

### Step 7: Prompt 层注入历史抑制指令

**文件**: `packages/agent-core/src/prompts/context-packet-renderer.ts`

在 `renderHomepage` 中，internalAnalysisSection 之后新增：

```typescript
if (homepage.previousRecommendedActions && homepage.previousRecommendedActions.length > 0) {
  // 按语义组聚合渲染，标注冷却状态和剩余次数
  lines.push('## 近期已推荐行动（禁止重复）');
  lines.push('以下行动类型近期已推荐过，本轮 summary 和 actions 中不得出现相同或语义相近的建议：');
  // ... 按组渲染，标注每组的状态（冷却中/已达上限）...
}
```

### Step 8: 加强 template.md 规则

**文件**: `data/sandbox/prompts/homepage/template.md`

修改写作红线第 8 条，增加对「近期已推荐行动」区块的引用。

---

## 修改文件清单

| 文件 | 改动内容 |
|------|----------|
| `packages/agent-core/src/types/memory.ts` | 新增 `RecentRecommendedAction`，扩展 `AnalyticalMemory` |
| `packages/agent-core/src/memory/analytical-memory-store.ts` | 新增 `setHomepageActions`（追加模式，FIFO 上限 20） |
| `packages/agent-core/src/types/agent-context.ts` | memory 新增 `latestHomepageActions` |
| `packages/agent-core/src/context/context-builder.ts` | 读取新字段 |
| `packages/agent-core/src/context/context-packet.ts` | HomepageContextPacket 新增字段 |
| `packages/agent-core/src/context/context-packet-builder.ts` | 传递 previousRecommendedActions |
| `packages/agent-core/src/context/homepage-event-insights.ts` | 语义组常量 + 双维度抑制 + 合并逻辑 |
| `packages/agent-core/src/runtime/agent-runtime.ts` | writeAnalyticalMemory 新增 packet 参数，追加写回 |
| `packages/agent-core/src/prompts/context-packet-renderer.ts` | 渲染近期推荐历史区块 |
| `data/sandbox/prompts/homepage/template.md` | 加强写作红线第 8 条 |

---

## 验证方式

1. **单元测试**：
   - movement_reset 冷却期内 → strenuous_activity 全组抑制，light_posture 不受影响
   - movement_reset 冷却期外但 24h 内已 2 次 → 频率抑制
   - hydration 推荐 → breathing_reset 不受影响（不同组）
   - 空历史时行为不变

2. **Mock Timeline 集成测试**：
   - walk → meal → 久坐 → 午餐 → 运动，验证各轮 actions 符合双维度规则

3. **端到端验证**：完整 Mock Timeline 走查
