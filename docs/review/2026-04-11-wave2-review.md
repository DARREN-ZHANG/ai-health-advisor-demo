# Wave 2 实现评审（对照 `docs/full-project-task-backlog.md`）

日期：2026-04-11

## 评审范围

本次仅对照 backlog 中 Wave 2（`AGT-001` ~ `AGT-021`）检查当前仓库实现是否闭环，重点核查：

- `packages/agent-core`
- `data/sandbox/prompts`
- `data/sandbox/fallbacks`
- 相关测试与验证脚本

本次实际验证过的命令：

- `pnpm --filter @health-advisor/agent-core test`
- `pnpm exec tsx data/validate.ts`

两条命令当前都能通过，但通过并不等于 Wave 2 已完全按文档闭环。

## 总结结论

当前仓库的 Wave 2 **主体已经实现**：agent-core 包骨架、provider 配置、任务路由、memory store、context builder、rule engine、prompt loader / builder、结构化输出 parser、fallback engine、timeout wrapper、runtime facade 和单测都已经存在。

但如果严格按 `docs/full-project-task-backlog.md` 验收，**Wave 2 仍有若干 P0 闭环没有完成**。主要问题集中在：

1. `low-data` 只被标记，没有真正触发 fallback；
2. timeout 只是在调用方返回 fallback，没有真正中断底层 LLM 调用；
3. session / analytical memory 虽然实现了 store，但没有接进 `executeAgent()` 的真实执行闭环；
4. context builder 预留了 event merge 依赖，但当前没有真正消费它。

结论：**当前状态更接近“Wave 2 大部分完成，但尚未达到 backlog 意义上的 fully done”。**

## 已实现部分（可视为基本达标）

以下任务从代码存在性和基础测试角度看，已经基本落地：

- `AGT-001`：`packages/agent-core` 包骨架存在，可被 workspace 引用；
- `AGT-002`：provider 配置与模型选择适配层已实现；
- `AGT-003`：单 Agent 初始化封装已存在；
- `AGT-004`：任务路由与 taskType 分流已存在；
- `AGT-005` / `AGT-006`：memory store 抽象本身已实现；
- `AGT-007`：`AgentContext` 领域模型已定义；
- `AGT-008`：context builder 主体已存在；
- `AGT-009` ~ `AGT-011`：rule engine、homepage rules、view-summary rules 已实现；
- `AGT-012` ~ `AGT-014`：prompt loader / builder 已实现；
- `AGT-015` ~ `AGT-017`：response parser、token validator、safety cleaner 已实现；
- `AGT-018`：fallback engine 主体已实现；
- `AGT-019`：timeout wrapper 已实现；
- `AGT-020`：`executeAgent()` 总入口已实现；
- `AGT-021`：agent-core 单测已补齐，且当前能跑通。

## 未按文档闭环的点

### 1. `AGT-018`：`low-data` 场景没有真正走 fallback

**文档要求**：`AGT-018` 要求 timeout / provider error / invalid output / low-data 都能稳定返回 fallback。

**当前实现**：

- `packages/agent-core/src/context/context-builder.ts` 会计算 `signals.lowData`；
- `packages/agent-core/src/prompts/system-builder.ts` 只是在 prompt 里追加“当前为低数据状态”的提示；
- `packages/agent-core/src/runtime/agent-runtime.ts` 里没有任何基于 `context.signals.lowData` 的 fallback 分支。

**结论**：当前仅实现了“识别 low-data”，没有实现“low-data 直接走稳定 fallback”。这意味着数据不足时仍然会继续调用 LLM，和 backlog 对 `AGT-018` 的完成定义不一致。

---

### 2. `AGT-019`：timeout 触发后没有真正中断底层 LLM 调用

**文档要求**：`AGT-019` 要求 AI 执行能在 6 秒阈值内被中断并转 fallback。

**当前实现**：

- `packages/agent-core/src/runtime/agent-runtime.ts` 使用 `withTimeout(...)` 包裹 `deps.agent.invoke(...)`；
- `packages/agent-core/src/runtime/timeout-controller.ts` 本质是 `Promise.race(...)`；
- 同文件注释已经明确写明：当前 `withTimeout` **并未自动关联** `AbortController` 的 abort 逻辑，后续集成真实 LLM SDK 时还需要手动把 `signal` 传入 invoke。

**结论**：当前实现做到了“6 秒后调用方拿到 timeout fallback”，但没有做到“真正中断底层模型调用”。严格按 backlog，`AGT-019` 目前只能算**部分完成**。

---

### 3. `AGT-005` + `AGT-020`：session memory 只实现了 store，没有接入 runtime 写回闭环

**文档要求**：`AGT-005` 要求支持最近 N 轮消息读写；`AGT-020` 要求 runtime facade 把前面依赖组装为 backend 可直接调用的统一入口。

**当前实现**：

- `buildAgentContext()` 会从 `sessionMemory.getRecentMessages(sessionId)` 读取历史消息；
- 但在 `packages/agent-core/src/runtime/agent-runtime.ts` 中，`executeAgent()` 全流程里没有调用 `sessionMemory.appendMessage(...)`；
- 全仓库里 `appendMessage(...)` 的实际调用只出现在 memory / context 的测试里，没有出现在真正 runtime 执行链路中。

**影响**：当前真实运行时不会在一次对话结束后写回用户消息和 assistant 消息，因此后续同 session 的对话并不能形成 backlog 所要求的“短多轮聊天”闭环。

**结论**：`AGT-005` 的 store 层已实现，但 `AGT-020` 没有把它组装进 runtime 主路径，Wave 2 还未闭环。

---

### 4. `AGT-006` + `AGT-020`：analytical memory 既没有写回，也没有真正参与 prompt 生成

**文档要求**：`AGT-006` 要支持最近摘要 / 最近视图总结 / 最近规则输出的读写，并在 profile switch / override 大改动后失效；`AGT-020` 需要把这些能力装配进统一 runtime。

**当前实现**：

- `InMemoryAnalyticalMemoryStore` 已提供 `setHomepageBrief()`、`setViewSummary()`、`setRuleSummary()`、失效方法；
- 但这些写接口在当前仓库中只出现在单测，未出现在 `executeAgent()` 主链路；
- `buildAgentContext()` 虽然会读出 `latestViewSummary` / `latestRuleSummary`，但 `task-builder.ts` 当前只消费 `recentMessages`，并没有把这些 analytical memory 内容注入 prompt；
- `latestHomepageBrief` 在 agent-core 中甚至没有任何运行时消费点。

**影响**：view summary、homepage brief、rule summary 现在都不会沉淀回 runtime，也不会在后续请求中影响模型上下文，因此 `AGT-006` 目前仍停留在“store 已写好，但未接线”的状态。

**结论**：analytical memory 还没有形成读写闭环，不能算按文档完成。

---

### 5. `AGT-008`：context builder 预留了 event merge 依赖，但当前没有真正使用

**文档要求**：`AGT-008` 要求给定 request 与 runtime state 产出完整 `AgentContext`，并依赖 `SAN-006` 的 event merge。

**当前实现**：

- `ContextBuilderDeps` 定义了 `mergeEvents(...)` 依赖；
- 但 `packages/agent-core/src/context/context-builder.ts` 没有调用 `mergeEvents(...)`；
- 当前 `signals.events` 仅来自 `getInjectedEvents(profileId)`，并且直接映射为字符串，没有 merged base events 的处理。

**影响**：从接口设计看，Wave 2 预期是要消费 sandbox 的事件合并结果，但当前 AgentContext 只接到了 injected events 这一半能力，`SAN-006` 在 Agent 层尚未真正闭环。

**结论**：`AGT-008` 主体已做，但事件上下文这一块仍是部分实现。

## 文档对齐问题（非核心功能缺口，但建议确认）

### 6. `DAT-006` / `AGT-012` 的 prompt 目录与 backlog 字面描述不一致

`docs/full-project-task-backlog.md` 中 `DAT-006` 写的是 prompt 模板位于 `data/prompts`；但当前实现和验证脚本都使用：

- `data/sandbox/prompts`
- `packages/agent-core/src/prompts/prompt-loader.ts`
- `data/validate.ts`

这更像是“实现已统一，但 backlog 文案没有同步更新”。它不一定是功能 bug，但如果后续继续按 backlog 验收，会持续造成歧义，建议在文档和目录之间做一次统一。

## 建议的收口顺序

建议按下面顺序补齐：

1. **先补 `AGT-018` + `AGT-019`**：把 low-data fallback 和真实 abort 打通；
2. **再补 `AGT-020` 对 memory 的接线**：至少补 session memory 与 analytical memory 的写回；
3. **补 `AGT-008` 的 event merge 接入**：确保 AgentContext 使用 merged sandbox snapshot；
4. **最后处理目录/文档对齐**：统一 `data/prompts` vs `data/sandbox/prompts` 的口径。

## 最终判断

如果按“代码骨架和基础单测是否存在”来看，Wave 2 已经完成了大部分工作；但如果按 backlog 的完成定义验收，**当前仓库不应判定为 Wave 2 fully complete**。

更准确的状态判断是：**Wave 2 已进入收尾阶段，但至少还差 low-data fallback、真实 timeout 中断、memory 闭环、event merge 接入这四类 P0 问题。**
