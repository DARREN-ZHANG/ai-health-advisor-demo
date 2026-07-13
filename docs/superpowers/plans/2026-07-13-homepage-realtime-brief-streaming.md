# 首页实时简报流式传输实施文档

> **For agentic workers:** Implement this plan task-by-task, keep checkbox state current, and commit after every task card. Do not combine unrelated task cards into one commit.

**Goal:** 将首页 morning brief 改为真正的 LLM 流式传输：`summary` 随 GPT-5.6 生成逐步显示，其余结构化字段只在完整校验通过后一次发布。

**Architecture:** 保留当前 OpenAI-compatible `ChatOpenAI`/Chat Completions 调用与完整 JSON 输出，通过标准增量 JSON parser 从模型 token 流中只提取 `$.summary`。Agent API 新增 POST SSE 端点，将上游 token 翻译成稳定的业务事件；Web 使用 `fetch` 读取 SSE，把未完成 summary 存在独立的临时 store，只有 `brief.completed` 才写入 React Query cache。

**Tech Stack:** TypeScript, LangChain `@langchain/openai` 0.4.9, `@streamparser/json`, Fastify 5, Server-Sent Events over `fetch`, Next.js 15, React Query 5, Zustand 5, Zod, Vitest, Playwright.

---

## Context Summary

### 当前实现

- 首页通过 `useMorningBrief()` POST `/ai/morning-brief`，等待完整 `ApiResponse<AgentResponseEnvelope>` 后一次渲染。
- `HealthAgent.invoke()` 调用 `ChatOpenAI.invoke()`；`agent-runtime.ts` 在完整模型文本到齐后解析 JSON，再执行 chart token 白名单、安全清理、customer content policy、memory 写回和缓存。
- 模型输出不是普通正文，而是包含 `summary`、`actions`、`futureSuggestions`、`statusColor` 等字段的完整 JSON。直接把原始 token 转发给浏览器会暴露 JSON 语法和未完成结构，不能采用。
- 当前安装的 `@langchain/openai@0.4.9` 已实现 `ChatOpenAI.stream()`：默认仍走 `/v1/chat/completions`，请求参数为 `stream: true`；只有显式 `useResponsesApi` 或 Responses-only 参数才切换 `/v1/responses`。

### 已确认的产品口径

- 只流式展示 `summary`；`actions`、`futureSuggestions`、`statusColor`、`chartTokens`、`meta` 在终态一次提交。
- 允许用户在完整结果校验前看到正在生成的 summary。该文本在客户端属于 provisional draft，不进入 React Query cache、memory 或后端 cache。
- 完整解析、customer content policy 或其他终态校验失败时发送 `brief.failed`，客户端立即清除 draft；不得发布 actions，不得把失败结果写入 query cache。
- 现有 `/ai/morning-brief` JSON 端点保留；首页改用新 `/ai/morning-brief/stream`，其他调用方不被强制迁移。
- 不做自动重连、不把已生成文本人工切片伪装成流、不以非流式端点作为隐式降级、不用正则抽取半截 JSON。

### Provider 结论与上线门槛

- MoreCode 文档展示了 GPT/Codex 模型、Codex 工具兼容和 OpenAI 工具调用兼容性，但没有声明 Chat Completions SSE、`stream_options.include_usage` 或结构化输出 streaming 的协议保证。因此不能只凭文档认定这些扩展可用。
- 当前非流式调用已经通过同一 `LLM_BASE_URL` 工作，实施继续使用 Chat Completions，不迁移 Responses API。
- 流式请求显式设置 `streamUsage: false`，不发送非必需的 `stream_options.include_usage`。上线前必须运行真实中转站兼容测试，验证多 chunk、终止原因、取消和 UTF-8 完整性。
- OpenAI 官方定义 Chat Completions `stream=true` 为 data-only SSE，并通过 `choices[0].delta.content` 增量返回内容：[Streaming API responses](https://developers.openai.com/api/docs/guides/streaming-responses)。

### 与 customer content policy 的边界

当前 runtime 的 customer content policy 是完整输出后的 fail-closed 闸门。启用真流式后，fail-closed 仍严格约束 `brief.completed`、memory、cache 和结构化字段，但无法撤回用户已经看过的 provisional summary token。用户本轮已明确接受该取舍；终态失败时必须清除 draft 并显示错误，不能把 draft 标记为正式简报。

---

## Public Interfaces

### 新端点

```http
POST /ai/morning-brief/stream
Accept: text/event-stream
Content-Type: application/json
X-Session-Id: <optional existing session>
X-Request-Id: <client generated UUID>

{
  "profileId": "profile-a",
  "pageContext": { "profileId": "profile-a", "page": "homepage", "timeframe": "week" },
  "bustCache": false
}
```

请求体与现有 morning brief 相同。请求校验在发送 SSE headers 前完成；校验失败继续返回当前 JSON error envelope 和 4xx。进入 200 stream 后只允许以下事件，且必须恰好以一个 `brief.completed` 或 `brief.failed` 结束：

```text
event: brief.started
data: {"requestId":"req-1"}

event: brief.summary.delta
data: {"requestId":"req-1","delta":"你的身体"}

event: brief.completed
data: {"requestId":"req-1","response":{...AgentResponseEnvelope}}
```

失败终态：

```text
event: brief.failed
data: {"requestId":"req-1","error":{"code":"BRIEF_GENERATION_FAILED","message":"实时简报生成失败"}}
```

协议不发送 SSE `retry:` 字段。`X-Session-Id` 继续通过 response header 签发；CORS 已暴露该 header。

### 共享类型

```ts
export type BriefStreamEvent =
  | { type: 'brief.started'; requestId: string }
  | { type: 'brief.summary.delta'; requestId: string; delta: string }
  | { type: 'brief.completed'; requestId: string; response: AgentResponseEnvelope }
  | {
      type: 'brief.failed';
      requestId: string;
      error: { code: 'BRIEF_GENERATION_FAILED' | 'STREAM_ABORTED'; message: string };
    };
```

每种事件均提供 Zod schema。客户端只接受 schema 通过且 `requestId` 等于当前请求的事件；未知事件、非法 JSON、EOF 前无终态都作为协议错误处理，不重试。

---

## File Structure

| 文件 | 职责 |
| --- | --- |
| `packages/shared/src/schemas/brief-stream.ts` / `types/brief-stream.ts` | SSE 业务事件与 Zod 契约。 |
| `packages/agent-core/src/output/streaming-summary-extractor.ts` | 标准增量 JSON 解析，只释放 `$.summary`。 |
| `packages/agent-core/src/executor/create-agent.ts` | 暴露 `HealthAgent.stream()`，将 LangChain chunk 转为字符串。 |
| `packages/agent-core/src/runtime/agent-runtime.ts` | 收集模型流、回调 summary delta、完整输出继续走现有终态管线。 |
| `apps/agent-api/src/services/ai-orchestrator.ts` | 缓存、取消、timing 与 stream callback 编排。 |
| `apps/agent-api/src/modules/ai/routes.ts` | 新增 POST SSE route 和带背压的事件 writer。 |
| `apps/web/src/lib/brief-stream-client.ts` | `fetch` SSE、事件校验、终态 Promise 与 AbortSignal。 |
| `apps/web/src/stores/brief-stream.store.ts` | profile/request scoped provisional summary。 |
| `apps/web/src/hooks/use-ai-query.ts` | 初始 query 与 bust-cache mutation 接入同一 stream client。 |
| `apps/web/src/app/page.tsx` / `components/homepage/BriefTimeline.tsx` | 正文逐步展示、busy/error/final commit 状态。 |

---

## 模块 1：Provider 与流式 JSON 基础

**目标：** 建立可验证的上游 streaming 能力、共享业务协议和严格的 summary 增量提取器。

**依赖：** 无。

**产出：**

- [ ] 真实中转站 streaming probe 可独立运行且不打印 API key 或模型正文。
- [ ] SSE 业务事件有共享 TypeScript/Zod 契约。
- [ ] `HealthAgent.stream()` 可返回模型内容 chunk；任意 JSON chunk 边界都能正确提取 summary。

### 任务 1.1：固定 Chat Completions streaming 配置并增加中转站探针

**所属模块：** 模块 1 - Provider 与流式 JSON 基础

**目标：** 明确使用 Chat Completions，移除非必需 stream usage 扩展，并用真实 provider 验证流式能力。

**前置条件：**

- `apps/agent-api/.env` 已包含当前可用的 `LLM_PROVIDER=openai`、`LLM_MODEL=gpt-5.6`、`LLM_BASE_URL` 和 `LLM_API_KEY`。

**涉及文件：**

- 修改：`packages/agent-core/src/provider/model-factory.ts`
- 测试：`packages/agent-core/src/__tests__/provider/model-factory.test.ts`
- 创建：`apps/agent-api/src/scripts/test-llm-stream.mjs`
- 修改：`apps/agent-api/package.json`

**上下文：**

`ChatOpenAI` 当前已收到 `modelName`、API key、base URL、temperature、retry 和 timeout。新增的唯一 provider 配置是 `streamUsage: false`；不要设置 `useResponsesApi: true`，不要修改默认模型常量，也不要把真实 key 写入仓库。

探针调用 solver 配置并使用 `chatModel.stream()`。输出仅包含 provider、model、脱敏 origin、first-token latency、total latency、非空 content chunk 数和 finish reason；禁止打印响应正文。通过条件固定为：收到至少 2 个非空 content chunk、流正常结束、总文本非空、AbortSignal 取消测试在超时预算内停止。

**实现步骤：**

- [ ] 在 OpenAI `ChatOpenAI` 构造参数中显式加入 `streamUsage: false`，测试 invocation params 在 streaming 模式不含 `stream_options`，且 `stream` 为 true。
- [ ] 新建 `test-llm-stream.mjs`，复用现有 `test-llm.mjs` 的 env/role 解析和 key masking，但不记录正文。
- [ ] 给 agent-api 增加 `test:llm:stream` script：`node src/scripts/test-llm-stream.mjs --role solver`。
- [ ] 使用真实 MoreCode 配置运行探针；若 chunk 数、finish reason 或取消行为不满足条件，停止后续上线，不引入模拟 chunk 或自动切换端点。

**验证方式：**

```bash
pnpm --filter @health-advisor/agent-core test -- src/__tests__/provider/model-factory.test.ts
pnpm --filter @health-advisor/agent-api test:llm:stream
```

预期结果：单元测试通过；真实探针打印 `chunks >= 2`、有效 finish reason 和两项 latency，不打印生成正文或完整 API key。

**提交说明：**

```bash
git add packages/agent-core/src/provider/model-factory.ts packages/agent-core/src/__tests__/provider/model-factory.test.ts apps/agent-api/src/scripts/test-llm-stream.mjs apps/agent-api/package.json
git commit -m "feat(agent-core): verify openai-compatible streaming"
```

### 任务 1.2：定义 morning brief SSE 事件契约

**所属模块：** 模块 1 - Provider 与流式 JSON 基础

**目标：** 让 API 与 Web 共用同一套可验证的 stream event 类型。

**前置条件：** 无。

**涉及文件：**

- 创建：`packages/shared/src/types/brief-stream.ts`
- 创建：`packages/shared/src/schemas/brief-stream.ts`
- 修改：`packages/shared/src/index.ts`
- 测试：`packages/shared/src/__tests__/schemas.test.ts`

**上下文：**

使用 Public Interfaces 中的四类 discriminated union。`delta` 必须是非空字符串；`requestId` 必须非空；completed response 必须通过现有 `AgentResponseEnvelopeSchema`。failed code 只允许 `BRIEF_GENERATION_FAILED` 和 `STREAM_ABORTED`，不得把 provider 原始错误、API key、base URL 或 prompt 放入事件。

**实现步骤：**

- [ ] 建立四个事件 interface、联合类型和对应 Zod schema，并从 shared root 导出。
- [ ] 增加 schema 测试：合法四事件通过；空 delta、未知事件、非法 terminal envelope、未知错误码被拒绝。
- [ ] 固定 terminal invariant 的辅助函数 `isBriefStreamTerminalEvent(event)`，只对 completed/failed 返回 true。

**验证方式：**

```bash
pnpm --filter @health-advisor/shared test -- src/__tests__/schemas.test.ts
pnpm --filter @health-advisor/shared typecheck
```

预期结果：所有事件 schema 与类型导出可被 agent-api/web 使用，非法 payload 全部被拒绝。

**提交说明：**

```bash
git add packages/shared/src/types/brief-stream.ts packages/shared/src/schemas/brief-stream.ts packages/shared/src/index.ts packages/shared/src/__tests__/schemas.test.ts
git commit -m "feat(shared): define brief streaming protocol"
```

### 任务 1.3：实现 HealthAgent stream 与标准 JSON summary 提取器

**所属模块：** 模块 1 - Provider 与流式 JSON 基础

**目标：** 从任意模型 chunk 边界中增量释放已解码的 summary 文本，同时保留完整 raw JSON 供现有 parser 使用。

**前置条件：** 无。

**涉及文件：**

- 修改：`packages/agent-core/package.json`
- 修改：`pnpm-lock.yaml`
- 创建：`packages/agent-core/src/output/streaming-summary-extractor.ts`
- 创建：`packages/agent-core/src/output/__tests__/streaming-summary-extractor.test.ts`
- 修改：`packages/agent-core/src/executor/create-agent.ts`
- 测试：`packages/agent-core/src/__tests__/executor/agent-initializer.test.ts`
- 修改：`packages/agent-core/src/index.ts`

**上下文：**

安装 `@streamparser/json`，使用 `paths: ['$.summary']`、`emitPartialTokens: true`、`emitPartialValues: true`。parser 给出的 partial value 是“当前完整前缀”，提取器保存上次值并只返回新增 suffix；若新 partial 不是旧值前缀、summary 出现两次、summary 不是字符串或 JSON 未完整结束，抛出 typed parse error。不要接受 markdown code fence，不要对不完整 JSON 调用 `JSON.parse`，不要用正则定位引号。

`HealthAgent` 新增：

```ts
stream(input: AgentInvokeInput): AsyncIterable<AgentInvokeOutput>;
```

实现用同一组 SystemMessage/HumanMessage 调用 `chatModel.stream(messages, { signal })`，只接受 string content；每个非空 string 作为一个 `AgentInvokeOutput` yield。

**实现步骤：**

- [ ] 安装 `@streamparser/json` 并实现 `StreamingSummaryExtractor.push(chunk): string[]`、`finish(): void`。
- [ ] 用逐字符、随机固定种子边界和真实 Unicode 边界测试 escaped quote、backslash、`\n\n`、emoji、summary 非首字段、重复 summary、markdown fence 和截断 JSON。
- [ ] 给 `HealthAgent`/`createHealthAgent` 增加 stream 接口，确保 AbortSignal 原样传给 LangChain。
- [ ] 从 agent-core root 导出 extractor 类型与 error，供 runtime 使用。

**验证方式：**

```bash
pnpm --filter @health-advisor/agent-core test -- src/output/__tests__/streaming-summary-extractor.test.ts src/__tests__/executor/agent-initializer.test.ts
pnpm --filter @health-advisor/agent-core typecheck
```

预期结果：所有合法 chunk 切分拼接出的 delta 与最终 `summary` 完全相等；所有协议违规确定性失败。

**提交说明：**

```bash
git add packages/agent-core/package.json pnpm-lock.yaml packages/agent-core/src/output/streaming-summary-extractor.ts packages/agent-core/src/output/__tests__/streaming-summary-extractor.test.ts packages/agent-core/src/executor/create-agent.ts packages/agent-core/src/__tests__/executor/agent-initializer.test.ts packages/agent-core/src/index.ts
git commit -m "feat(agent-core): stream structured brief summaries"
```

---

## 模块 2：Agent Runtime 与 Fastify SSE

**目标：** 在不复制业务管线的前提下，把模型 summary delta 推到 HTTP stream，并保持终态校验、memory、cache 和日志语义正确。

**依赖：** 模块 1。

**产出：**

- [ ] stream 与 invoke 共用同一套 context/prompt/finalization 逻辑。
- [ ] 新 SSE route 支持缓存命中、背压、取消和唯一终态。
- [ ] 只有完整且 approved 的结果可发送 completed、写 memory/cache。

### 任务 2.1：给 Agent Runtime 增加可取消的 summary delta 回调

**所属模块：** 模块 2 - Agent Runtime 与 Fastify SSE

**目标：** 让 homepage runtime 在第 7 步使用 `HealthAgent.stream()`，其余步骤和非流式调用保持单一实现。

**前置条件：**

- 任务 1.3 已完成，`HealthAgent.stream()` 与 `StreamingSummaryExtractor` 可用。

**涉及文件：**

- 修改：`packages/agent-core/src/runtime/agent-runtime.ts`
- 修改：`packages/agent-core/src/runtime/timeout-controller.ts`
- 测试：`packages/agent-core/src/__tests__/runtime/agent-runtime.test.ts`
- 测试：`packages/agent-core/src/__tests__/fallback/timeout-controller.test.ts`
- 修改：`packages/agent-core/src/index.ts`

**上下文：**

在现有 executeAgent 尾部增加可选参数，保持所有旧调用兼容：

```ts
export interface AgentExecutionOptions {
  signal?: AbortSignal;
  onSummaryDelta?: (delta: string) => void | Promise<void>;
}
```

仅当 taskType 是 `HOMEPAGE_SUMMARY` 且提供 `onSummaryDelta` 时进入 stream 分支。分支遍历 `deps.agent.stream()`，把每个 content chunk 同时追加到 raw string 和 extractor，逐个 `await onSummaryDelta(delta)` 以传递 HTTP backpressure；流结束调用 extractor.finish()，然后把完整 raw 交给现有 `parseAgentResponse` 及后续管线。

timeout 与外部 signal 使用 `AbortSignal.any()` 合并，任一取消都必须终止 LangChain iterator。不要在 stream 分支返回新的 fallback 内容；现有 low-data/timeout/provider/customer-policy envelope 若 `finishReason !== complete`，由 SSE adapter 转为 failed terminal。

**实现步骤：**

- [ ] 扩展 executeAgent options 和 timeout helper，保证 timeout、request abort、provider error 都清理 timer 与 iterator。
- [ ] 抽取“获取模型完整 raw output”的内部函数：invoke 分支返回单次内容，stream 分支收集 chunk 并触发 delta；后续 parser/cleaner/policy/memory 代码只保留一份。
- [ ] 增加 runtime 测试：delta 顺序正确、raw 仍通过现有 parser、callback 背压被 await、abort 停止 provider、invalid final JSON 不写 session/analytical memory。
- [ ] 增加 customer policy 测试：第一轮 provisional delta 可以出现，但 policy 最终失败返回非-complete envelope，memory 不写入。

**验证方式：**

```bash
pnpm --filter @health-advisor/agent-core test -- src/__tests__/runtime/agent-runtime.test.ts src/__tests__/fallback/timeout-controller.test.ts
pnpm --filter @health-advisor/agent-core typecheck
```

预期结果：非流式回归测试不变；流式测试严格按 provider chunk 顺序回调，取消和终态失败均不写 memory。

**提交说明：**

```bash
git add packages/agent-core/src/runtime/agent-runtime.ts packages/agent-core/src/runtime/timeout-controller.ts packages/agent-core/src/__tests__/runtime/agent-runtime.test.ts packages/agent-core/src/__tests__/fallback/timeout-controller.test.ts packages/agent-core/src/index.ts
git commit -m "feat(agent-core): stream homepage summary deltas"
```

### 任务 2.2：新增 orchestrator streaming 选项与 Fastify SSE route

**所属模块：** 模块 2 - Agent Runtime 与 Fastify SSE

**目标：** 将 runtime delta 翻译成稳定 SSE，并保持缓存、日志、session 和断连取消一致。

**前置条件：**

- 任务 1.2 已完成，shared stream schemas 可用。
- 任务 2.1 已完成，executeAgent 支持 delta callback 和 AbortSignal。

**涉及文件：**

- 修改：`apps/agent-api/src/services/ai-orchestrator.ts`
- 修改：`apps/agent-api/src/modules/ai/routes.ts`
- 创建：`apps/agent-api/src/utils/sse-writer.ts`
- 测试：`apps/agent-api/src/__tests__/services/ai-orchestrator.test.ts`
- 测试：`apps/agent-api/src/__tests__/modules/ai/routes.test.ts`
- 修改：`apps/agent-api/src/plugins/request-context.ts`

**上下文：**

复用现有 request body 校验、pending-event app_open sync 和 bust-cache 逻辑，抽成 route 内部 helper，避免两个 endpoint 漂移。stream route 在校验完成后设置：

```http
Content-Type: text/event-stream; charset=utf-8
Cache-Control: no-cache, no-transform
Connection: keep-alive
X-Accel-Buffering: no
X-Session-Id: <session>
```

`sse-writer.ts` 只接受已通过 shared schema 的 `BriefStreamEvent`，序列化为单行 JSON data；`reply.raw.write()` 返回 false 时 await `drain`。用 `request.raw` 的 `aborted` 事件和 `reply.raw` 的 `close` 事件监听断连，仅在尚未发送 terminal 且 response 未 `writableEnded` 时 abort runtime；writer 禁止 close 后写入。

Orchestrator 继续先查 cache：cache hit 不伪造 summary delta，直接发送 completed，response meta 保留 `cached`。cache miss 才传 onSummaryDelta；只有 `finishReason === complete` 才发送 completed 并沿用现有 cache set。任何其他 finishReason、异常或终态 parser error发送 failed，且不得再发送 completed。

timings 新增 `llmFirstTokenMs`、`streamChunkCount`、`streamDurationMs`，写入当前 request completed 日志；日志不记录 delta 文本。

**实现步骤：**

- [ ] 抽取 morning brief request preparation helper，让 JSON/SSE 两个 route 共用校验、sync、cache bust 和 AgentRequest 构建。
- [ ] 实现 schema-checked SSE writer、背压等待和 exactly-one-terminal guard。
- [ ] 扩展 AiOrchestrator execute options，将 signal/delta 传给 executeAgent，并记录首 token/chunk/stream timing。
- [ ] 实现 `/ai/morning-brief/stream`：started → zero-or-more delta → exactly one terminal；在 Fastify hijack 前显式写入 session/CORS 已需 headers。
- [ ] 测试 cache hit 无 delta、cache miss 多 delta、invalid output failed、provider timeout failed、client disconnect abort、4xx 仍为 JSON。

**验证方式：**

```bash
pnpm --filter @health-advisor/agent-api test -- src/__tests__/services/ai-orchestrator.test.ts src/__tests__/modules/ai/routes.test.ts
pnpm --filter @health-advisor/agent-api typecheck
```

预期结果：SSE 帧可被标准 parser 读取，所有路径只有一个终态；断连停止上游调用；非流式 route 测试保持通过。

**提交说明：**

```bash
git add apps/agent-api/src/services/ai-orchestrator.ts apps/agent-api/src/modules/ai/routes.ts apps/agent-api/src/utils/sse-writer.ts apps/agent-api/src/__tests__/services/ai-orchestrator.test.ts apps/agent-api/src/__tests__/modules/ai/routes.test.ts apps/agent-api/src/plugins/request-context.ts
git commit -m "feat(agent-api): expose morning brief sse stream"
```

---

## 模块 3：Web 流客户端与首页渐进渲染

**目标：** 读取 POST SSE、跨 hook 共享 provisional summary，并在终态原子提交完整 envelope。

**依赖：** 模块 1 的 shared contract；后端可与本模块并行开发，集成时需要模块 2。

**产出：**

- [ ] 初次加载和所有 bust-cache 刷新都使用 stream endpoint。
- [ ] provisional summary 不污染 React Query cache。
- [ ] actions/status/future suggestions 只在 completed 后切换。

### 任务 3.1：实现 fetch SSE client 与 request-scoped draft store

**所属模块：** 模块 3 - Web 流客户端与首页渐进渲染

**目标：** 建立严格的浏览器 stream consumer 和跨组件实例共享的临时状态。

**前置条件：**

- 任务 1.2 已完成，`BriefStreamEventSchema` 可用。

**涉及文件：**

- 修改：`apps/web/package.json`
- 修改：`pnpm-lock.yaml`
- 创建：`apps/web/src/lib/brief-stream-client.ts`
- 创建：`apps/web/src/lib/brief-stream-client.test.ts`
- 创建：`apps/web/src/stores/brief-stream.store.ts`
- 创建：`apps/web/src/stores/brief-stream.store.test.ts`
- 修改：`apps/web/src/lib/api-client.ts`

**上下文：**

安装 `eventsource-parser`，使用 `fetch` 而不是 EventSource，因为请求需要 POST body、自定义 session/lang headers 和 AbortSignal。把 api-client 现有 URL、session 与 locale header 逻辑抽成可复用 request helper；收到 response headers 后立即保存 `X-Session-Id`。

client API 固定为：

```ts
streamMorningBrief(
  payload: MorningBriefRequest,
  options: {
    requestId: string;
    signal: AbortSignal;
    onEvent(event: BriefStreamEvent): void;
  },
): Promise<AgentResponseEnvelope>;
```

Promise 只在 matching completed 时 resolve；matching failed、HTTP error、非法 frame、未知 event、requestId 不匹配、重复 terminal 或 EOF 无 terminal 时 reject。

Zustand store 以 profileId 保存 `{ requestId, phase, draftSummary }`。`begin/append/complete/fail` 都必须校验 requestId；旧请求事件不能覆盖新请求。fail 清空 draft，complete 清空临时条目。

**实现步骤：**

- [ ] 抽取 api request headers/session helper，保证普通 JSON client 行为不变。
- [ ] 实现 eventsource-parser consumer 和严格 terminal 状态机，不添加 retry/reconnect。
- [ ] 实现 profile/request-scoped store；delta 只 append，不写 React Query cache。
- [ ] 测试任意网络 chunk 边界、同一 SSE data 跨 chunk、多个 event 同 chunk、HTTP 4xx JSON、failed、截断、重复 terminal、stale requestId 和 AbortError。

**验证方式：**

```bash
pnpm --filter @health-advisor/web test -- src/lib/brief-stream-client.test.ts src/stores/brief-stream.store.test.ts src/lib/api-client.test.ts
pnpm --filter @health-advisor/web typecheck
```

预期结果：合法流 resolve 完整 envelope；所有协议违规 reject 并清除 draft；普通 api-client 测试不变。

**提交说明：**

```bash
git add apps/web/package.json pnpm-lock.yaml apps/web/src/lib/brief-stream-client.ts apps/web/src/lib/brief-stream-client.test.ts apps/web/src/stores/brief-stream.store.ts apps/web/src/stores/brief-stream.store.test.ts apps/web/src/lib/api-client.ts apps/web/src/lib/api-client.test.ts
git commit -m "feat(web): consume brief sse streams"
```

### 任务 3.2：接入 React Query hooks 与首页 streaming UI

**所属模块：** 模块 3 - Web 流客户端与首页渐进渲染

**目标：** 首 token 到达后逐步显示新 summary，终态才更新完整首页数据。

**前置条件：**

- 任务 3.1 已完成，stream client/store 可用。

**涉及文件：**

- 修改：`apps/web/src/hooks/use-ai-query.ts`
- 创建：`apps/web/src/hooks/use-ai-query.test.tsx`
- 修改：`apps/web/src/app/page.tsx`
- 修改：`apps/web/src/components/homepage/BriefTimeline.tsx`
- 测试：`apps/web/src/components/homepage/BriefTimeline.test.tsx`
- 测试：`apps/web/src/hooks/use-action-interactions.test.tsx`
- 测试：`apps/web/src/hooks/use-demo-control-actions.test.tsx`

**上下文：**

`useMorningBrief` queryFn 使用 React Query 提供的 `signal` 和新的 UUID 调用 stream client。`useRefetchBrief` mutation 同样使用 stream client；on completed 继续 `setQueryData`，保持现有 action/demo-control 刷新逻辑。所有 hook 实例通过 brief-stream store 共享 draft，因此 page 能看到其他组件发起的刷新 token。

首页显示规则固定为：

1. 无旧数据、尚无 delta：显示现有 skeleton。
2. 收到首个 delta：立即显示 draft，summary 容器保持 `aria-busy=true`；不要给每个 token 设置 `aria-live`。
3. 有旧数据刷新、尚无 delta：保留旧 summary 和 updating indicator。
4. 有旧数据刷新、收到 delta：summary 切到新 draft；旧 actions/futureSuggestions/statusColor 保留到 completed。
5. completed：React Query cache 原子替换完整 envelope，清除 draft，`aria-busy=false`。
6. failed：清除 draft；首次加载进入现有 error UI，刷新失败则保留旧完整 envelope 并由现有调用方 toast 报错。

Hero、LifeLog disabled 和 `briefIsLoading` 在终态前保持 true，因为 status/actions 尚未正式提交。

**实现步骤：**

- [ ] 让 initial query 和 bust-cache mutation 共用 `runBriefStream(profileId, bustCache, signal)`，统一 begin/append/complete/fail 生命周期。
- [ ] 保持 mutation completed 后的 `queryClient.setQueryData`，确认 provisional delta 从未进入 query cache。
- [ ] page 订阅当前 profile draft，按上述六条规则计算 displayedSummary、isInitialBriefLoading、isBriefUpdating/isStreaming。
- [ ] 扩展 BriefTimeline busy 语义：draft 可见期间保留 updating 状态，不增加打字机计时器、光标动画或 token 人工节流。
- [ ] 更新 hook/component 测试，覆盖初始流、跨 hook refresh、final atomic commit、failed clear、profile switch stale event。

**验证方式：**

```bash
pnpm --filter @health-advisor/web test -- src/hooks/use-ai-query.test.tsx src/components/homepage/BriefTimeline.test.tsx src/hooks/use-action-interactions.test.tsx src/hooks/use-demo-control-actions.test.tsx
pnpm --filter @health-advisor/web typecheck
```

预期结果：首 delta 后 summary 逐步增长；结构化字段直到 completed 才变化；失败和 profile switch 不留下旧 draft。

**提交说明：**

```bash
git add apps/web/src/hooks/use-ai-query.ts apps/web/src/hooks/use-ai-query.test.tsx apps/web/src/app/page.tsx apps/web/src/components/homepage/BriefTimeline.tsx apps/web/src/components/homepage/BriefTimeline.test.tsx apps/web/src/hooks/use-action-interactions.test.tsx apps/web/src/hooks/use-demo-control-actions.test.tsx
git commit -m "feat(web): render streaming homepage briefs"
```

---

## 模块 4：集成验收与运行观测

**目标：** 用真实 provider、协议测试和前端集成测试证明流式链路可上线，并记录运维边界。

**依赖：** 模块 1、2、3。

**产出：**

- [ ] 首 token、完整终态、缓存命中、取消、失败和 refresh 路径全部验收。
- [ ] 日志能区分 provider latency、TTFT、stream duration 与 chunk count。
- [ ] 部署文档明确代理缓冲和环境配置要求。

### 任务 4.1：完成 streaming 集成、E2E 与部署验收

**所属模块：** 模块 4 - 集成验收与运行观测

**目标：** 验证从 MoreCode GPT-5.6 到首页 DOM 的真实端到端流动，以及生产代理不会缓冲 SSE。

**前置条件：**

- 任务 1.1、2.2、3.2 已完成。

**涉及文件：**

- 创建：`apps/agent-api/src/__tests__/integration/morning-brief-stream.test.ts`
- 修改：`apps/web/e2e/valo-ui.spec.ts`
- 修改：`docs/detailed-tech-design/realtime-brief-generation-logic.md`
- 修改：`docs/INDEX.md`

**上下文：**

集成测试使用 fake streaming HealthAgent，按可控 chunk 输出合法 JSON，验证 HTTP/SSE/Web parser，而不是用计时 sleep 判断。Web E2E mock `/ai/morning-brief/stream` 的完整 SSE contract，验证 completed 后首页结构化字段；渐进 DOM 时序由 Vitest ReadableStream 测试负责，避免 Playwright `route.fulfill` 一次性 body 冒充真实时间行为。

真实 provider 与部署 smoke 不进入 CI：使用任务 1.1 探针和浏览器 Network/页面观察，记录结果但不提交 API key 或模型正文。生产反向代理必须保持 `Content-Type: text/event-stream`、chunked transfer、`Cache-Control: no-transform`，且不能在完整 response 后才 flush。

**实现步骤：**

- [ ] 增加 agent-api integration test，覆盖合法多 delta、cache hit 直达 completed、invalid JSON failed、断连 abort 和 exactly-one-terminal。
- [ ] 更新 Web E2E mock 到新 stream endpoint，验证首页最终 summary/actions/status；保留旧 JSON route mock 供未迁移场景测试。
- [ ] 更新实时简报技术文档，加入 upstream Chat Completions → incremental JSON parser → Fastify SSE → fetch consumer → provisional store → final query cache 数据流。
- [ ] 运行真实 MoreCode probe；在本地首页确认首 token 明显早于 completed，刷新期间旧结构化字段不提前变化。
- [ ] 在生产同域与跨域各做一次 smoke，检查 response headers、首 chunk 时间、取消后后端日志、无 proxy buffering；失败则阻止发布，不加客户端重连或非流式降级。
- [ ] 执行全仓 lint、typecheck、test、build，确认现有 advisor/view-summary/JSON morning brief 不受影响。

**验证方式：**

```bash
pnpm --filter @health-advisor/agent-api test -- src/__tests__/integration/morning-brief-stream.test.ts
pnpm --filter @health-advisor/web test
pnpm --filter @health-advisor/web test:e2e -- valo-ui.spec.ts
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm --filter @health-advisor/agent-api test:llm:stream
```

预期结果：所有自动化命令通过；真实 probe `chunks >= 2`；首页 TTFT 小于完整生成耗时；取消请求后 provider iteration 停止；日志含 `llmFirstTokenMs`、`streamChunkCount`、`streamDurationMs` 且无正文。

**提交说明：**

```bash
git add apps/agent-api/src/__tests__/integration/morning-brief-stream.test.ts apps/web/e2e/valo-ui.spec.ts docs/detailed-tech-design/realtime-brief-generation-logic.md docs/INDEX.md
git commit -m "test(streaming): verify morning brief delivery"
```

---

## 执行顺序

### 依赖关系

| 任务 | blockedBy | 说明 |
| --- | --- | --- |
| 1.1 Provider 配置与探针 | - | 可立即验证真实中转站能力。 |
| 1.2 SSE 事件契约 | - | 可独立建立前后端共享类型。 |
| 1.3 Agent stream 与 JSON extractor | - | 与 1.1/1.2 修改区域不重叠。 |
| 2.1 Runtime delta callback | 1.3 | 依赖 HealthAgent.stream 与 extractor。 |
| 2.2 Orchestrator 与 SSE route | 1.2, 2.1 | 依赖共享事件与 runtime callback。 |
| 3.1 Web client 与 draft store | 1.2 | 可用 mock event 独立开发。 |
| 3.2 Query hooks 与首页 UI | 3.1 | 依赖 client/store API。 |
| 4.1 集成与部署验收 | 1.1, 2.2, 3.2 | 汇合真实 provider、后端和 Web。 |

### 执行阶段

**Phase 1（可并行）：**

- 任务 1.1：Provider 配置与真实 streaming probe
- 任务 1.2：SSE 共享事件契约
- 任务 1.3：HealthAgent stream 与 JSON extractor

**Phase 2（可并行）：**

- 任务 2.1：Runtime summary delta callback
- 任务 3.1：Web fetch SSE client 与 draft store

**Phase 3（可并行）：**

- 任务 2.2：Orchestrator 与 Fastify SSE route
- 任务 3.2：React Query hooks 与首页 UI

**Phase 4：**

- 任务 4.1：集成、E2E、真实 provider 与部署验收

### 关键路径

两条等长关键路径在任务 4.1 汇合：

```text
1.3 -> 2.1 -> 2.2 -> 4.1
1.2 -> 3.1 -> 3.2 -> 4.1
```

任务 1.1 不阻塞本地代码开发，但未通过真实中转站 probe 时禁止发布。

---

## Acceptance Criteria

- [ ] 首页首次加载在完整 envelope 到达前显示逐步增长的真实模型 summary，不显示 JSON 语法。
- [ ] refresh 首 delta 前保留旧 summary；首 delta 后切换 provisional summary；旧 actions/status/futureSuggestions 保留到 completed。
- [ ] completed response 通过现有 parse、token whitelist、safety、customer policy 后才写 memory、后端 cache 和 React Query cache。
- [ ] invalid JSON、customer policy fail、timeout、provider error、截断 SSE、requestId mismatch 均不发布结构化字段，draft 被清除。
- [ ] cache hit 直接 completed，不人工切片；客户端不自动重连、不调用旧端点降级。
- [ ] profile 切换或组件卸载通过 AbortSignal 终止 fetch 和上游 provider iteration，旧事件不能污染新 profile。
- [ ] MoreCode GPT-5.6 实测产生至少 2 个非空 content chunk；若不满足，功能不得上线。
- [ ] 现有 `/ai/morning-brief`、`/ai/view-summary`、`/ai/chat` 行为和测试保持不变。
- [ ] 日志记录 TTFT/chunk count/stream duration，不记录 prompt、delta、完整模型正文或 secret。
- [ ] 每个任务卡独立 conventional commit；不得把当前工作区已有 sandbox 数据变更混入 streaming commits。

## Assumptions

- 部署环境继续将 `LLM_PROVIDER=openai`、`LLM_MODEL=gpt-5.6`、`LLM_BASE_URL=<MoreCode OpenAI-compatible base URL>` 和 secret API key 注入 agent-api；仓库默认模型不改为 GPT-5.6。
- MoreCode 文档未证明 streaming contract，任务 1.1 的真实探针结果是唯一上线判据。
- provisional summary 的短暂可见性是用户明确接受的产品选择；终态 customer content policy 不能撤回已显示 token，只能阻止正式提交并清除 draft。
- 本轮仅迁移首页 morning brief；advisor chat 与 data-center view summary 继续使用非流式 JSON API。
