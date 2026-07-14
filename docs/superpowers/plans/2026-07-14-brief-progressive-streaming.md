# 晨间简报渐进式流式渲染 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把首页 morning brief 从"summary 流式 + 卡片/预测批量渲染"升级为"summary 流式 + 卡片逐张就绪 + 预测逐条就绪 + 说明文本打字机"的渐进式体验。

**Architecture:** 后端新建 `StreamingStructureExtractor`（与已有 `StreamingSummaryExtractor` 并存，同一 chunk 双解析），用 `@streamparser/json` 的 `$.actions.*` / `$.futureSuggestions.*` 路径在每个数组元素闭合时释放就绪信号；新增 3 种 SSE 事件（`brief.action.ready` / `brief.forecast.started` / `brief.future_suggestion.ready`）。前端 store 累积 draft actions/suggestions，卡片逐张替换 Skeleton，预测区在 `forecast.started` 后展开、每条预测的 `predictedState`/`rationale` 用组件内定时器打字机逐字 reveal。

**Tech Stack:** TypeScript, `@streamparser/json` 0.0.22, Zod, Fastify 5 SSE, Next.js 15, React Query 5, Zustand 5, Vitest。

**Spec:** [docs/superpowers/specs/2026-07-14-brief-progressive-streaming-design.md](../specs/2026-07-14-brief-progressive-streaming-design.md)

---

## File Structure

| 文件 | 责任 | 动作 |
|---|---|---|
| `packages/shared/src/types/brief-stream.ts` | 3 个新事件 interface + union 扩展 | 修改 |
| `packages/shared/src/schemas/brief-stream.ts` | 3 个新 zod object + discriminatedUnion | 修改 |
| `packages/agent-core/src/output/chunk-safety.ts` | surrogate + fence 守卫 helper | 新建 |
| `packages/agent-core/src/output/streaming-summary-extractor.ts` | 改为复用 chunk-safety | 修改 |
| `packages/agent-core/src/output/streaming-structure-extractor.ts` | actions/futureSuggestions 元素就绪提取器 | 新建 |
| `packages/agent-core/src/runtime/agent-runtime.ts` | stream 分支双提取器、Options 扩展 | 修改 |
| `apps/agent-api/src/services/ai-orchestrator.ts` | options 透传 | 修改 |
| `apps/agent-api/src/modules/ai/routes.ts` | stream route 新增 3 个回调 + 单元素校验 | 修改 |
| `apps/web/src/stores/brief-stream.store.ts` | entry 扩展 + 3 个新方法 | 修改 |
| `apps/web/src/hooks/use-ai-query.ts` | onEvent 分发 | 修改 |
| `apps/web/src/components/homepage/FutureTimelineBlock.tsx` | 打字机 | 修改 |
| `apps/web/src/components/homepage/FutureTimelineBlockSkeleton.tsx` | 预测 Skeleton | 新建 |
| `apps/web/src/components/homepage/ActionCardSkeleton.tsx` | 卡片 Skeleton | 新建 |
| `apps/web/src/app/page.tsx` | 渲染推导 + Skeleton 整合 | 修改 |

---

## Task 1: shared — BriefStreamEvent 新增 3 个事件

**Files:**
- Modify: `packages/shared/src/types/brief-stream.ts`
- Modify: `packages/shared/src/schemas/brief-stream.ts`
- Test: `packages/shared/src/__tests__/brief-stream-events.test.ts`（新建）

- [ ] **Step 1: 写失败测试**

新建 `packages/shared/src/__tests__/brief-stream-events.test.ts`：

```typescript
import { describe, it, expect } from 'vitest';
import { BriefStreamEventSchema, isBriefStreamTerminalEvent } from '../schemas/brief-stream';

const action = { id: 'a1', emoji: '💧', title: '补水', description: '多喝水', aiPromise: '记录' };
const suggestion = {
  timePoint: '15:30', predictedState: '低谷', rationale: '咖啡因',
  action: { id: 'f1', emoji: '🧘', title: '呼吸', description: '深呼吸', aiPromise: '记录' },
};

describe('BriefStreamEventSchema 新增 3 个事件', () => {
  it('brief.action.ready 合法', () => {
    const e = { type: 'brief.action.ready', requestId: 'r1', index: 0, action };
    expect(BriefStreamEventSchema.parse(e).type).toBe('brief.action.ready');
  });
  it('brief.forecast.started 合法', () => {
    const e = { type: 'brief.forecast.started', requestId: 'r1' };
    expect(BriefStreamEventSchema.parse(e).type).toBe('brief.forecast.started');
  });
  it('brief.future_suggestion.ready 合法', () => {
    const e = { type: 'brief.future_suggestion.ready', requestId: 'r1', index: 0, suggestion };
    expect(BriefStreamEventSchema.parse(e).type).toBe('brief.future_suggestion.ready');
  });
  it('brief.action.ready 缺 action 字段拒绝', () => {
    expect(() => BriefStreamEventSchema.parse({ type: 'brief.action.ready', requestId: 'r1', index: 0 })).toThrow();
  });
  it('brief.action.ready index 负数拒绝', () => {
    expect(() => BriefStreamEventSchema.parse({ type: 'brief.action.ready', requestId: 'r1', index: -1, action })).toThrow();
  });
  it('三种新事件均非终态', () => {
    expect(isBriefStreamTerminalEvent({ type: 'brief.action.ready', requestId: 'r1', index: 0, action } as never)).toBe(false);
    expect(isBriefStreamTerminalEvent({ type: 'brief.forecast.started', requestId: 'r1' } as never)).toBe(false);
    expect(isBriefStreamTerminalEvent({ type: 'brief.future_suggestion.ready', requestId: 'r1', index: 0, suggestion } as never)).toBe(false);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @health-advisor/shared exec vitest run src/__tests__/brief-stream-events.test.ts`
Expected: FAIL（schema 不认识新 type）

- [ ] **Step 3: 扩展 types**

在 `packages/shared/src/types/brief-stream.ts` 的 `BriefFailedEvent` 之后、`BriefStreamEvent` union 之前插入：

```typescript
import type { ActionOption, FutureSuggestion } from './agent';

export interface BriefActionReadyEvent {
  type: 'brief.action.ready';
  requestId: string;
  /** actions 数组下标，从 0 起 */
  index: number;
  action: ActionOption;
}

export interface BriefForecastStartedEvent {
  type: 'brief.forecast.started';
  requestId: string;
}

export interface BriefFutureSuggestionReadyEvent {
  type: 'brief.future_suggestion.ready';
  requestId: string;
  /** futureSuggestions 数组下标，从 0 起 */
  index: number;
  suggestion: FutureSuggestion;
}
```

把 `BriefStreamEvent` union 扩展为：

```typescript
export type BriefStreamEvent =
  | BriefStartedEvent
  | BriefSummaryDeltaEvent
  | BriefActionReadyEvent
  | BriefForecastStartedEvent
  | BriefFutureSuggestionReadyEvent
  | BriefCompletedEvent
  | BriefFailedEvent;
```

注意：文件顶部已 import `AgentResponseEnvelope`，新增一行 import `ActionOption, FutureSuggestion`（合并到现有 import 语句）。

- [ ] **Step 4: 扩展 schemas**

在 `packages/shared/src/schemas/brief-stream.ts` 的 `BriefFailedEventSchema` 之后、`BriefStreamEventSchema` 之前插入。顶部 import 追加 `ActionOptionSchema, FutureSuggestionSchema`：

```typescript
import { AgentResponseEnvelopeSchema, ActionOptionSchema, FutureSuggestionSchema } from './agent';
```

新增 schema：

```typescript
const BriefActionReadyEventSchema = z.object({
  type: z.literal('brief.action.ready'),
  requestId: requestIdSchema,
  index: z.number().int().nonnegative(),
  action: ActionOptionSchema,
});

const BriefForecastStartedEventSchema = z.object({
  type: z.literal('brief.forecast.started'),
  requestId: requestIdSchema,
});

const BriefFutureSuggestionReadyEventSchema = z.object({
  type: z.literal('brief.future_suggestion.ready'),
  requestId: requestIdSchema,
  index: z.number().int().nonnegative(),
  suggestion: FutureSuggestionSchema,
});
```

`BriefStreamEventSchema` 的 discriminatedUnion 数组按事件顺序插入 3 个新 schema（放在 SummaryDelta 之后、Completed 之前）。

- [ ] **Step 5: 跑测试确认通过**

Run: `pnpm --filter @health-advisor/shared exec vitest run src/__tests__/brief-stream-events.test.ts`
Expected: PASS

- [ ] **Step 6: typecheck + 提交**

Run: `pnpm --filter @health-advisor/shared typecheck`
Expected: 无错误

```bash
git add packages/shared/src/types/brief-stream.ts packages/shared/src/schemas/brief-stream.ts packages/shared/src/__tests__/brief-stream-events.test.ts
git commit -m "feat(shared): add action.ready/forecast.started/future_suggestion.ready stream events"
```

---

## Task 2: agent-core — 抽取 chunk-safety helper

把 `StreamingSummaryExtractor` 里的 `safeForParser`（surrogate pair 缓冲）和 `detectMarkdownFence`（前导 fence 检测）抽到独立 helper，供新旧两个提取器复用，避免漂移。

**Files:**
- Create: `packages/agent-core/src/output/chunk-safety.ts`
- Modify: `packages/agent-core/src/output/streaming-summary-extractor.ts`
- Test: `packages/agent-core/src/output/__tests__/chunk-safety.test.ts`（新建）

- [ ] **Step 1: 写失败测试**

新建 `packages/agent-core/src/output/__tests__/chunk-safety.test.ts`：

```typescript
import { describe, it, expect } from 'vitest';
import { safeForParser, detectMarkdownFence, MarkdownFenceError } from '../chunk-safety';

describe('safeForParser', () => {
  it('完整码元原样返回', () => {
    const buf = { tail: '' };
    expect(safeForParser(buf, 'abc')).toBe('abc');
    expect(buf.tail).toBe('');
  });
  it('末尾落单 high surrogate 暂存', () => {
    const buf = { tail: '' };
    // "𝄞" = U+1D11E = surrogate pair \uD834\uDD1E
    const safe = safeForParser(buf, 'a\uD834');
    expect(safe).toBe('a');
    expect(buf.tail).toBe('\uD834');
  });
  it('下个 chunk 拼回 surrogate', () => {
    const buf = { tail: '\uD834' };
    expect(safeForParser(buf, '\uDD1Eb')).toBe('\uD834\uDD1Eb');
    expect(buf.tail).toBe('');
  });
});

describe('detectMarkdownFence', () => {
  it('合法 JSON 起始不抛', () => {
    const st = { done: false, buffer: '' };
    expect(() => detectMarkdownFence(st, '{')).not.toThrow();
    expect(st.done).toBe(true);
  });
  it('前导空白后反引号抛 MarkdownFenceError', () => {
    const st = { done: false, buffer: '' };
    expect(() => detectMarkdownFence(st, '  \n```')).toThrow(MarkdownFenceError);
  });
  it('跨 chunk 的前导空白 + 反引号', () => {
    const st = { done: false, buffer: '' };
    detectMarkdownFence(st, '  ');
    expect(st.done).toBe(false);
    expect(() => detectMarkdownFence(st, '\n`')).toThrow(MarkdownFenceError);
  });
  it('done 后不再检测', () => {
    const st = { done: true, buffer: '' };
    expect(() => detectMarkdownFence(st, '```')).not.toThrow();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @health-advisor/agent-core exec vitest run src/output/__tests__/chunk-safety.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 chunk-safety.ts**

新建 `packages/agent-core/src/output/chunk-safety.ts`。把 `streaming-summary-extractor.ts` 里的 `safeForParser` / `detectMarkdownFence` 逻辑搬过来，改造为接收"状态对象"的纯函数（无 this 依赖）：

```typescript
/**
 * chunk-safety：跨提取器共享的 LLM chunk 预处理守卫。
 *
 * 两个守卫（原先散落在 StreamingSummaryExtractor 内部）：
 * - safeForParser：缓冲末尾落单 high surrogate，避免 @streamparser/json 0.0.22
 *   在 chunk 边界切断 UTF-16 surrogate pair 时产生乱码。
 * - detectMarkdownFence：检测模型用 ```json fence 包裹 JSON 的违规，前导空白
 *   可能跨 chunk，需缓冲直到遇到第一个实质字符。
 *
 * 抽到独立 helper 的理由：StreamingStructureExtractor 与 StreamingSummaryExtractor
 * 各自解析同一份 chunk 流，两份守卫必须行为一致，集中维护避免漂移。
 */

export interface SurrogateBuffer {
  /** 落单 high surrogate 暂存区 */
  tail: string;
}

export interface FenceCheckState {
  /** 是否已完成前导检测 */
  done: boolean;
  /** 前导空白缓冲 */
  buffer: string;
}

export class MarkdownFenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MarkdownFenceError';
    Object.setPrototypeOf(this, MarkdownFenceError.prototype);
  }
}

/**
 * 确保 chunk 不在 UTF-16 surrogate pair 中间断开。
 * 读取并清空 buf.tail，返回可安全交给 parser 的字符串，可能把新的落单 high
 * surrogate 写回 buf.tail。
 */
export function safeForParser(buf: SurrogateBuffer, chunk: string): string {
  const combined = buf.tail + chunk;
  buf.tail = '';
  if (combined.length === 0) return '';
  const lastCharCode = combined.charCodeAt(combined.length - 1);
  if (lastCharCode >= 0xd800 && lastCharCode <= 0xdbff) {
    buf.tail = combined.charAt(combined.length - 1);
    return combined.slice(0, -1);
  }
  return combined;
}

/**
 * 检测 markdown code fence。前导空白（空格/\t/\n/\r）可能跨 chunk，缓冲直到
 * 遇到第一个非空白字符；若该字符是反引号，抛 MarkdownFenceError。
 * st.done=true 后直接返回（检测已完成）。
 */
export function detectMarkdownFence(st: FenceCheckState, chunk: string): void {
  if (st.done) return;
  st.buffer += chunk;
  const buf = st.buffer;
  for (let i = 0; i < buf.length; i++) {
    const ch = buf.charAt(i);
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') continue;
    st.done = true;
    if (ch === '`') {
      throw new MarkdownFenceError('输入以 markdown code fence（```）开头，期望纯 JSON 流');
    }
    st.buffer = '';
    return;
  }
  if (st.buffer.length > 64) {
    throw new MarkdownFenceError('前导空白过长（>64 字符），疑似异常输入');
  }
}
```

- [ ] **Step 4: 跑 helper 测试确认通过**

Run: `pnpm --filter @health-advisor/agent-core exec vitest run src/output/__tests__/chunk-safety.test.ts`
Expected: PASS

- [ ] **Step 5: 改造 StreamingSummaryExtractor 复用 helper**

修改 `packages/agent-core/src/output/streaming-summary-extractor.ts`：

1. 顶部 import：`import { safeForParser, detectMarkdownFence, MarkdownFenceError, type SurrogateBuffer, type FenceCheckState } from './chunk-safety';`
2. 删除类的私有字段 `pendingSurrogateTail` / `leadingWhitespaceBuffer` / `leadingCheckDone`，替换为：
   ```typescript
   private readonly surrogateBuf: SurrogateBuffer = { tail: '' };
   private readonly fenceState: FenceCheckState = { done: false, buffer: '' };
   ```
3. `push` 里把 `this.detectMarkdownFence(chunk)` 改为 `detectMarkdownFence(this.fenceState, chunk)`，`this.safeForParser(chunk)` 改为 `safeForParser(this.surrogateBuf, chunk)`。
4. 删除类的私有方法 `safeForParser` / `detectMarkdownFence`（已搬到 helper）。
5. `finish()` 里 `this.pendingSurrogateTail` 改为 `this.surrogateBuf.tail`。
6. detectMarkdownFence 抛的 `StreamingSummaryParseError` 改为 `MarkdownFenceError` 的地方：保留向调用方暴露为 `StreamingSummaryParseError` 的契约——最简做法是让 `push` 的 fence 调用包一层 try/catch，把 `MarkdownFenceError` 重新包装成 `StreamingSummaryParseError`：
   ```typescript
   try {
     detectMarkdownFence(this.fenceState, chunk);
   } catch (err) {
     if (err instanceof MarkdownFenceError) {
       throw new StreamingSummaryParseError(err.message);
     }
     throw err;
   }
   ```

注意：保留 `StreamingSummaryParseError` 的对外契约不变（runtime 用 instanceof 区分），内部实现复用 helper。

- [ ] **Step 6: 跑 streaming-summary-extractor 现有测试确认无回归**

Run: `pnpm --filter @health-advisor/agent-core exec vitest run src/output/__tests__/streaming-summary-extractor.test.ts`
Expected: PASS（全部既有用例）

- [ ] **Step 7: typecheck + 提交**

Run: `pnpm --filter @health-advisor/agent-core typecheck`

```bash
git add packages/agent-core/src/output/chunk-safety.ts packages/agent-core/src/output/__tests__/chunk-safety.test.ts packages/agent-core/src/output/streaming-summary-extractor.ts
git commit -m "refactor(agent-core): extract chunk-safety helpers shared by extractors"
```

---

## Task 3: agent-core — StreamingStructureExtractor

**Files:**
- Create: `packages/agent-core/src/output/streaming-structure-extractor.ts`
- Test: `packages/agent-core/src/output/__tests__/streaming-structure-extractor.test.ts`（新建）

- [ ] **Step 1: 写失败测试**

新建 `packages/agent-core/src/output/__tests__/streaming-structure-extractor.test.ts`：

```typescript
import { describe, it, expect } from 'vitest';
import { StreamingStructureExtractor } from '../streaming-structure-extractor';

const fullJson = JSON.stringify({
  summary: '今天状态不错',
  chartTokens: ['CHART_TOKEN_1'],
  actions: [
    { id: 'action_1', emoji: '💧', title: '补水', description: '运动后补水', aiPromise: '记录' },
    { id: 'action_2', emoji: '🧘', title: '拉伸', description: '放松肌肉', aiPromise: '记录' },
  ],
  actionsSectionTitle: '今天可以这样调整',
  futureSuggestions: [
    { timePoint: '15:30', predictedState: 'HRV低谷', rationale: '咖啡因影响', action: { id: 'f1', emoji: '🧘', title: '呼吸', description: '深呼吸', aiPromise: '记录' } },
    { timePoint: '20:00', predictedState: '入睡困难', rationale: '晚运动', action: { id: 'f2', emoji: '🛌', title: '放松', description: '冥想', aiPromise: '记录' } },
  ],
});

describe('StreamingStructureExtractor', () => {
  it('按顺序释放 action×2 → forecastStarted → suggestion×2', () => {
    const ext = new StreamingStructureExtractor();
    const signals = ext.push(fullJson);
    ext.finish();
    const kinds = signals.map((s) => s.kind);
    expect(kinds).toEqual(['action', 'action', 'forecastStarted', 'suggestion', 'suggestion']);
  });

  it('action 信号带正确 index 与 value', () => {
    const ext = new StreamingStructureExtractor();
    const signals = ext.push(fullJson);
    ext.finish();
    const actions = signals.filter((s) => s.kind === 'action');
    expect(actions[0]).toMatchObject({ kind: 'action', index: 0 });
    expect((actions[0] as { action: { id: string } }).action.id).toBe('action_1');
    expect(actions[1]).toMatchObject({ kind: 'action', index: 1 });
  });

  it('suggestion 信号带正确 index 与 value', () => {
    const ext = new StreamingStructureExtractor();
    const signals = ext.push(fullJson);
    ext.finish();
    const suggestions = signals.filter((s) => s.kind === 'suggestion');
    expect(suggestions[0]).toMatchObject({ kind: 'suggestion', index: 0 });
    expect((suggestions[0] as { suggestion: { timePoint: string } }).suggestion.timePoint).toBe('15:30');
  });

  it('forecastStarted 只释放一次（在第一个 suggestion 之前）', () => {
    const ext = new StreamingStructureExtractor();
    const signals = ext.push(fullJson);
    ext.finish();
    const forecastCount = signals.filter((s) => s.kind === 'forecastStarted').length;
    expect(forecastCount).toBe(1);
    const firstSuggestionIdx = signals.findIndex((s) => s.kind === 'suggestion');
    const forecastIdx = signals.findIndex((s) => s.kind === 'forecastStarted');
    expect(forecastIdx).toBeLessThan(firstSuggestionIdx);
  });

  it('多 chunk 切分（每 5 字符）结果一致', () => {
    const ext = new StreamingStructureExtractor();
    const signals = [];
    for (let i = 0; i < fullJson.length; i += 5) {
      signals.push(...ext.push(fullJson.slice(i, i + 5)));
    }
    ext.finish();
    expect(signals.map((s) => s.kind)).toEqual(['action', 'action', 'forecastStarted', 'suggestion', 'suggestion']);
  });

  it('futureSuggestions 缺省时只释放 action，无 forecastStarted/suggestion', () => {
    const ext = new StreamingStructureExtractor();
    const signals = ext.push(JSON.stringify({ summary: 'x', actions: [{ id: 'a1', title: 't', emoji: '💧', description: 'd', aiPromise: 'p' }] }));
    ext.finish();
    expect(signals.map((s) => s.kind)).toEqual(['action']);
  });

  it('futureSuggestions 空数组时不释放 forecastStarted', () => {
    const ext = new StreamingStructureExtractor();
    const signals = ext.push(JSON.stringify({ summary: 'x', actions: [], futureSuggestions: [] }));
    ext.finish();
    expect(signals).toEqual([]);
  });

  it('surrogate pair 跨 chunk 边界不乱码', () => {
    const json = JSON.stringify({
      actions: [{ id: 'a1', emoji: '𝄞', title: 't', description: 'd', aiPromise: 'p' }],
    });
    // 在 surrogate pair 中间切
    const cut = json.indexOf('\uD834');
    const ext = new StreamingStructureExtractor();
    const signals = [
      ...ext.push(json.slice(0, cut + 1)),
      ...ext.push(json.slice(cut + 1)),
    ];
    ext.finish();
    expect(signals.length).toBe(1);
    expect((signals[0] as { action: { emoji: string } }).action.emoji).toBe('𝄞');
  });

  it('markdown fence 前导抛错', () => {
    const ext = new StreamingStructureExtractor();
    expect(() => ext.push('```json\n{')).toThrow();
  });

  it('畸形 JSON 中途：已释放信号保留，finish 不抛（吞错）', () => {
    const ext = new StreamingStructureExtractor();
    const signals = ext.push(JSON.stringify({
      actions: [{ id: 'a1', title: 't', emoji: '💧', description: 'd', aiPromise: 'p' }],
    }) + '}'); // 末尾多余 }
    expect(signals.length).toBe(1); // action_1 已释放
    expect(() => ext.finish()).not.toThrow(); // 吞错，不抛
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @health-advisor/agent-core exec vitest run src/output/__tests__/streaming-structure-extractor.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 StreamingStructureExtractor**

新建 `packages/agent-core/src/output/streaming-structure-extractor.ts`：

```typescript
import { JSONParser } from '@streamparser/json';
import type { ParsedElementInfo } from '@streamparser/json/utils/types/parsedElementInfo';
import {
  safeForParser,
  detectMarkdownFence,
  MarkdownFenceError,
  type SurrogateBuffer,
  type FenceCheckState,
} from './chunk-safety';

/**
 * StreamingStructureExtractor
 *
 * 从模型流式输出的增量 JSON 文本中，释放 actions / futureSuggestions 数组元素的
 * "就绪"信号（元素对象完整闭合时）。与 StreamingSummaryExtractor 并存，runtime
 * 在 stream 分支把同一份 chunk 喂给两个提取器。
 *
 * 设计要点：
 * - 依赖 @streamparser/json 的 paths: ['$.actions.*', '$.futureSuggestions.*']，
 *   在每个数组元素（对象）闭合时触发 onValue，key 为数组 index，stack 第二层
 *   key 区分 'actions' / 'futureSuggestions'（探针验证，0.0.22）。
 * - forecastStarted 在第一个 futureSuggestions 元素就绪时释放一次（去重），
 *   紧邻其后的 suggestion 信号之前。若 LLM 不生成 futureSuggestions，不释放。
 * - 不做 ActionOptionSchema / FutureSuggestionSchema 的完整 zod 校验（终态 parser
 *   的职责）；streamparser 保证 JSON 结构合法，route 层做单元素业务校验。
 * - 复用 chunk-safety 的 surrogate + fence 守卫，与 summary 提取器行为一致。
 * - 畸形 JSON：吞错（不抛），已释放信号保留。与 summary 提取器（抛错）不同——
 *   结构提取器的错误不应中断 summary 流式。
 */
export type StructureSignal =
  | { kind: 'action'; index: number; action: Record<string, unknown> }
  | { kind: 'forecastStarted' }
  | { kind: 'suggestion'; index: number; suggestion: Record<string, unknown> };

export class StreamingStructureExtractor {
  private readonly parser: JSONParser;
  private readonly surrogateBuf: SurrogateBuffer = { tail: '' };
  private readonly fenceState: FenceCheckState = { done: false, buffer: '' };
  private readonly pendingSignals: StructureSignal[] = [];
  private forecastEmitted = false;
  private finished = false;

  constructor() {
    // paths 语法是 $.actions.* 不是 $.actions[*]（探针验证）
    this.parser = new JSONParser({
      paths: ['$.actions.*', '$.futureSuggestions.*'],
    });
    this.parser.onValue = (event) => this.handleValue(event);
  }

  /**
   * 喂入一个 chunk，返回本次新产生的结构信号数组。
   * 畸形 JSON 不抛（吞错），返回已释放的信号。
   */
  push(chunk: string): StructureSignal[] {
    if (this.finished) return [];
    if (typeof chunk !== 'string') return [];

    try {
      detectMarkdownFence(this.fenceState, chunk);
    } catch (err) {
      if (err instanceof MarkdownFenceError) {
        // fence 违规：标记结束，吞错（summary 提取器会单独抛，runtime 统一处理）
        this.finished = true;
        return this.flush();
      }
      throw err;
    }

    const safeChunk = safeForParser(this.surrogateBuf, chunk);
    if (safeChunk.length > 0) {
      try {
        this.parser.write(safeChunk);
      } catch {
        // 畸形 JSON：吞错，保留已释放信号，后续 push 不再处理
        this.finished = true;
      }
    }
    return this.flush();
  }

  /** 标记输入结束。本提取器吞错，finish 不抛。 */
  finish(): void {
    this.finished = true;
    if (this.surrogateBuf.tail.length > 0) {
      try {
        this.parser.write(this.surrogateBuf.tail);
      } catch {
        // 吞错
      }
      this.surrogateBuf.tail = '';
    }
    try {
      this.parser.end();
    } catch {
      // 吞错：streamparser end() 的怪癖或截断，都不中断结构流
    }
    // pendingSignals 已在最后 push 时 flush，这里无需再处理
  }

  private handleValue(event: ParsedElementInfo): void {
    const { value, key, stack } = event;
    if (value === undefined || typeof key !== 'number') return;
    // stack 第二层 key 标识父数组
    const parentKey = stack.length >= 2 ? stack[stack.length - 1].key : undefined;
    if (parentKey === 'futureSuggestions') {
      // 第一次见到 futureSuggestions 元素：先发 forecastStarted
      if (!this.forecastEmitted) {
        this.forecastEmitted = true;
        this.pendingSignals.push({ kind: 'forecastStarted' });
      }
      this.pendingSignals.push({ kind: 'suggestion', index: key, suggestion: value as Record<string, unknown> });
    } else if (parentKey === 'actions') {
      this.pendingSignals.push({ kind: 'action', index: key, action: value as Record<string, unknown> });
    }
  }

  private flush(): StructureSignal[] {
    const out = this.pendingSignals;
    if (out.length > 0) {
      this.pendingSignals.length = 0;
    }
    return out;
  }
}
```

注意：`@streamparser/json/utils/types/parsedElementInfo` 的子路径 import 需要确认。若 tsconfig 不允许深层子路径，改为 `import type { ParsedElementInfo } from '@streamparser/json'`（从主入口 re-export）。实现时若类型解析失败，用主入口。

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter @health-advisor/agent-core exec vitest run src/output/__tests__/streaming-structure-extractor.test.ts`
Expected: PASS

- [ ] **Step 5: 导出 + typecheck**

在 `packages/agent-core/src/index.ts` 追加：
```typescript
export { StreamingStructureExtractor, type StructureSignal } from './output/streaming-structure-extractor';
```

Run: `pnpm --filter @health-advisor/agent-core typecheck`
Expected: 无错误

- [ ] **Step 6: 提交**

```bash
git add packages/agent-core/src/output/streaming-structure-extractor.ts packages/agent-core/src/output/__tests__/streaming-structure-extractor.test.ts packages/agent-core/src/index.ts
git commit -m "feat(agent-core): add StreamingStructureExtractor for element-ready signals"
```

---

## Task 4: agent-core — agent-runtime stream 分支双提取器

**Files:**
- Modify: `packages/agent-core/src/runtime/agent-runtime.ts`
- Test: `packages/agent-core/src/runtime/__tests__/agent-runtime-stream-structure.test.ts`（新建）

- [ ] **Step 1: 写失败测试**

新建 `packages/agent-core/src/runtime/__tests__/agent-runtime-stream-structure.test.ts`。复用 `packages/agent-core/src/__tests__/runtime/agent-runtime.test.ts` 的 mock 模式（`makeDeps` / `makeRequest` / `chunksToStream` helper 与 `COMPLIANT_SUMMARY`）——**从该文件复制这四个 helper 到新测试文件**（测试文件间不互相 import 私有 helper 是该项目的惯例）：

```typescript
import { describe, it, expect, vi } from 'vitest';
import { executeAgent, type AgentRuntimeDeps } from '../../runtime/agent-runtime';
import type { AgentRequest } from '../../types/agent-request';
import type { HealthAgent } from '../../executor/create-agent';
import type { PromptLoader } from '../../prompts/prompt-loader';
import type { FallbackEngine } from '../../fallback/fallback-engine';
import type { ProfileData, DailyRecord } from '@health-advisor/shared';
import type { DatedEvent } from '@health-advisor/sandbox';
import { AgentTaskType } from '@health-advisor/shared';
import { InMemorySessionMemoryStore } from '../../memory/session-memory-store';
import { InMemoryAnalyticalMemoryStore } from '../../memory/analytical-memory-store';

// 复制自 agent-runtime.test.ts（保持一致）
const COMPLIANT_SUMMARY =
  '今天整体状态良好，各项生理指标处于稳定区间。夜间睡眠时长充足，深睡与浅睡比例合理，晨起恢复状况良好；白天活动量适中，心率与血氧饱和度保持在正常水平，压力负荷处于较低区间。当前没有出现明显的生理异常或需要关注的事件，身体处于稳态。建议继续保持规律的作息安排与均衡饮食结构，适当安排户外散步或轻度运动，以维持当前的稳态并促进长期健康。如出现任何不适或数据异常，请及时咨询专业医疗人员获取准确的评估和指导。今日可关注夜间睡眠质量与明日晨起准备度之间的关联。';

// makeRecord / makeProfileData / makeRequest / mockPromptLoader / mockFallbackEngine / makeDeps
// 全部从 agent-runtime.test.ts 原样复制（它们是文件私有 helper）

async function* chunksToStream(chunks: string[]): AsyncGenerator<{ content: string }> {
  for (const chunk of chunks) { yield { content: chunk }; }
}

describe('executeAgent stream 分支结构信号', () => {
  it('onActionReady 按 index 递增、onForecastStarted 先于 onFutureSuggestionReady、onFutureSuggestionReady 按 index 递增', async () => {
    const fullJson = JSON.stringify({
      summary: COMPLIANT_SUMMARY,
      source: 'llm',
      statusColor: 'good',
      chartTokens: ['CHART_TOKEN_HRV_7DAYS'],
      actions: [
        { id: 'action_1', emoji: '💧', title: '补水', description: '运动后补水', aiPromise: '记录' },
        { id: 'action_2', emoji: '🧘', title: '拉伸', description: '放松肌肉', aiPromise: '记录' },
      ],
      actionsSectionTitle: '今天可以这样调整',
      futureSuggestions: [
        { timePoint: '15:30', predictedState: '低谷', rationale: '咖啡因', action: { id: 'f1', emoji: '🧘', title: '呼吸', description: '深呼吸', aiPromise: '记录' } },
        { timePoint: '20:00', predictedState: '入睡困难', rationale: '晚运动', action: { id: 'f2', emoji: '🛌', title: '冥想', description: '放松', aiPromise: '记录' } },
      ],
    });
    // 每 7 字符切一个 chunk，模拟 token 流
    const chunks = Array.from({ length: Math.ceil(fullJson.length / 7) }, (_, i) => fullJson.slice(i * 7, i * 7 + 7));
    const deps = makeDeps({ stream: vi.fn(() => chunksToStream(chunks)) });

    const calls: string[] = [];
    const onActionReady = vi.fn((index: number) => { calls.push(`action-${index}`); });
    const onForecastStarted = vi.fn(() => { calls.push('forecast'); });
    const onFutureSuggestionReady = vi.fn((index: number) => { calls.push(`suggestion-${index}`); });

    await executeAgent(makeRequest(), deps, undefined, undefined, {
      onSummaryDelta: () => {},
      onActionReady,
      onForecastStarted,
      onFutureSuggestionReady,
    });

    expect(onActionReady).toHaveBeenCalledTimes(2);
    expect(onActionReady.mock.calls[0][0]).toBe(0);
    expect(onActionReady.mock.calls[1][0]).toBe(1);
    expect(onForecastStarted).toHaveBeenCalledTimes(1);
    expect(onFutureSuggestionReady).toHaveBeenCalledTimes(2);
    expect(onFutureSuggestionReady.mock.calls[0][0]).toBe(0);
    expect(onFutureSuggestionReady.mock.calls[1][0]).toBe(1);
    // 顺序：action×2 → forecast → suggestion×2
    expect(calls).toEqual(['action-0', 'action-1', 'forecast', 'suggestion-0', 'suggestion-1']);
  });

  it('futureSuggestions 缺省时 onForecastStarted/onFutureSuggestionReady 不调用', async () => {
    const fullJson = JSON.stringify({
      summary: COMPLIANT_SUMMARY, source: 'llm', statusColor: 'good', chartTokens: [],
      actions: [{ id: 'a1', emoji: '💧', title: 't', description: 'd', aiPromise: 'p' }],
    });
    const chunks = [fullJson];
    const deps = makeDeps({ stream: vi.fn(() => chunksToStream(chunks)) });
    const onForecastStarted = vi.fn();
    const onFutureSuggestionReady = vi.fn();
    await executeAgent(makeRequest(), deps, undefined, undefined, {
      onSummaryDelta: () => {}, onActionReady: () => {}, onForecastStarted, onFutureSuggestionReady,
    });
    expect(onForecastStarted).not.toHaveBeenCalled();
    expect(onFutureSuggestionReady).not.toHaveBeenCalled();
  });

  it('结构回调全缺时 summary 仍正常流式（不构造 structure 提取器）', async () => {
    const chunks = [`{"summary":"${COMPLIANT_SUMMARY}","chartTokens":[],"microTips":[]}`];
    const deps = makeDeps({ stream: vi.fn(() => chunksToStream(chunks)) });
    const deltas: string[] = [];
    const result = await executeAgent(makeRequest(), deps, undefined, undefined, {
      onSummaryDelta: (d) => deltas.push(d),
    });
    expect(deltas.join('')).toBe(COMPLIANT_SUMMARY);
    expect(result.meta.finishReason).toBe('complete');
  });
});
```

注：`executeAgent` 的完整签名是 `executeAgent(request, deps, locale?, observer?, options?)`——确认参数顺序与现有测试一致。`makeRequest`/`makeDeps` 等辅助函数从 `src/__tests__/runtime/agent-runtime.test.ts` 原样复制到本文件顶部（该项目测试 helper 不跨文件共享）。

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @health-advisor/agent-core exec vitest run src/runtime/__tests__/agent-runtime-stream-structure.test.ts`
Expected: FAIL（回调未触发）

- [ ] **Step 3: 扩展 AgentExecutionOptions**

修改 `packages/agent-core/src/runtime/agent-runtime.ts`，`AgentExecutionOptions` interface（约第 151-154 行）新增 3 个可选回调：

```typescript
export interface AgentExecutionOptions {
  signal?: AbortSignal;
  onSummaryDelta?: (delta: string) => void | Promise<void>;
  onActionReady?: (index: number, action: ActionOption) => void | Promise<void>;
  onForecastStarted?: () => void | Promise<void>;
  onFutureSuggestionReady?: (index: number, suggestion: FutureSuggestion) => void | Promise<void>;
}
```

顶部 import 追加（从 shared）：
```typescript
import type { ActionOption, FutureSuggestion } from '@health-advisor/shared';
```

并把第 820-821 行的 `useStream` 触发条件保持不变（`HOMEPAGE_SUMMARY + onSummaryDelta`）。

- [ ] **Step 4: stream 分支接入 StreamingStructureExtractor**

在 `obtainRawOutput` 的 stream 分支（约第 832-870 行），import `StreamingStructureExtractor`：

```typescript
import { StreamingSummaryExtractor, StreamingSummaryParseError } from '../output/streaming-summary-extractor';
import { StreamingStructureExtractor, type StructureSignal } from '../output/streaming-structure-extractor';
```

在创建 summary 提取器之后（约第 839 行），条件创建结构提取器：

```typescript
const summaryExtractor = new StreamingSummaryExtractor();
const hasStructureCallback = Boolean(
  options?.onActionReady || options?.onForecastStarted || options?.onFutureSuggestionReady
);
const structureExtractor = hasStructureCallback ? new StreamingStructureExtractor() : null;
```

chunk 循环里（约第 855-865 行），把每个 chunk 同时喂给两个提取器：

```typescript
const summaryDeltas = summaryExtractor.push(chunk.content);
for (const delta of summaryDeltas) {
  await onSummaryDelta(delta);
}
if (structureExtractor) {
  const signals = structureExtractor.push(chunk.content);
  for (const signal of signals) {
    await dispatchStructureSignal(signal, options);
  }
}
```

流结束后（约第 867 行），structure 提取器也 finish（吞错）：

```typescript
extractor.finish();
structureExtractor?.finish();
```

在 `obtainRawOutput` 函数体内加一个本地 dispatch helper：

```typescript
async function dispatchStructureSignal(
  signal: StructureSignal,
  options: AgentExecutionOptions | undefined,
): Promise<void> {
  if (signal.kind === 'action') {
    await options?.onActionReady?.(signal.index, signal.action as ActionOption);
  } else if (signal.kind === 'forecastStarted') {
    await options?.onForecastStarted?.();
  } else {
    await options?.onFutureSuggestionReady?.(signal.index, signal.suggestion as FutureSuggestion);
  }
}
```

注意 `as ActionOption` / `as FutureSuggestion` 的类型断言：提取器释放的是 `Record<string, unknown>`，runtime 信任 JSON 结构；业务校验在 route 层。若 dispatch 想更安全，可在这里做一次 `ActionOptionSchema.safeParse`，失败跳过——但 spec 把单元素校验放在 route 层，runtime 层只透传。

- [ ] **Step 5: 跑测试确认通过**

Run: `pnpm --filter @health-advisor/agent-core exec vitest run src/runtime/__tests__/agent-runtime-stream-structure.test.ts`
Expected: PASS

- [ ] **Step 6: 跑 agent-core 全部测试确认无回归**

Run: `pnpm --filter @health-advisor/agent-core test`
Expected: 全部 PASS

- [ ] **Step 7: typecheck + 提交**

Run: `pnpm --filter @health-advisor/agent-core typecheck`

```bash
git add packages/agent-core/src/runtime/agent-runtime.ts packages/agent-core/src/runtime/__tests__/agent-runtime-stream-structure.test.ts
git commit -m "feat(agent-core): wire StreamingStructureExtractor into stream branch"
```

---

## Task 5: agent-api — AiOrchestrator 透传回调

**Files:**
- Modify: `apps/agent-api/src/services/ai-orchestrator.ts`

- [ ] **Step 1: 定位 execute 签名与 options 透传**

Read `apps/agent-api/src/services/ai-orchestrator.ts`，找到 `execute` 方法的 options 类型与透传到 `runtime.execute` 的位置。当前 options 应含 `signal` 与 `onSummaryDelta`，透传给 runtime。

- [ ] **Step 2: 扩展 options 类型**

在 `execute` 的 options interface 新增 3 个可选回调（与 runtime 的 `AgentExecutionOptions` 对齐）：

```typescript
interface AiOrchestratorExecuteOptions {
  signal?: AbortSignal;
  onSummaryDelta?: (delta: string) => void | Promise<void>;
  onActionReady?: (index: number, action: ActionOption) => void | Promise<void>;
  onForecastStarted?: () => void | Promise<void>;
  onFutureSuggestionReady?: (index: number, suggestion: FutureSuggestion) => void | Promise<void>;
  onTimings?: (timings: AiExecutionTimings) => void;
}
```

import `ActionOption, FutureSuggestion` from `@health-advisor/shared`。

- [ ] **Step 3: 透传到 runtime**

在调 `runtime.execute(...)` 的 options 对象里追加：

```typescript
{
  signal: options?.signal,
  onSummaryDelta: options?.onSummaryDelta,
  onActionReady: options?.onActionReady,
  onForecastStarted: options?.onForecastStarted,
  onFutureSuggestionReady: options?.onFutureSuggestionReady,
}
```

- [ ] **Step 4: typecheck + 提交**

Run: `pnpm --filter @health-advisor/agent-api typecheck`

```bash
git add apps/agent-api/src/services/ai-orchestrator.ts
git commit -m "feat(agent-api): thread structure callbacks through AiOrchestrator"
```

---

## Task 6: agent-api — stream route 新增 3 个回调 + 单元素校验

**Files:**
- Modify: `apps/agent-api/src/modules/ai/routes.ts`（`/ai/morning-brief/stream` handler）
- Test: `apps/agent-api/src/__tests__/integration/morning-brief-stream.test.ts`

- [ ] **Step 1: 写失败测试**

在 `morning-brief-stream.test.ts` 新增 3 个 test（复用文件已有的 `mockedExecuteAgent` / `parseSseFrames` / `validateFrameSchema` / `defaultPageContext` / `validEnvelope`）。注意 `executeAgent` 的 mock 签名第 6 个参数是 `options`，其中含 `onSummaryDelta` / `onActionReady` / `onForecastStarted` / `onFutureSuggestionReady`：

```typescript
test('完整流：started → action.ready+ → forecast.started → future_suggestion.ready+ → completed', async () => {
  mockedExecuteAgent.mockReset();
  app.briefCache.clearAll();
  app.runtime.getSessionSandbox('sess-int-struct').overrideStore.reset('all');

  const action1 = { id: 'a1', emoji: '💧', title: '补水', description: '多喝水', aiPromise: '记录' };
  const action2 = { id: 'a2', emoji: '🧘', title: '拉伸', description: '放松', aiPromise: '记录' };
  const suggestion = {
    timePoint: '15:30', predictedState: '低谷', rationale: '咖啡因',
    action: { id: 'f1', emoji: '🧘', title: '呼吸', description: '深呼吸', aiPromise: '记录' },
  };

  mockedExecuteAgent.mockImplementationOnce(
    async (_req, _deps, _timeout, _observer, _locale, options) => {
      await options?.onSummaryDelta?.('摘要');
      await options?.onActionReady?.(0, action1);
      await options?.onActionReady?.(1, action2);
      await options?.onForecastStarted?.();
      await options?.onFutureSuggestionReady?.(0, suggestion);
      return { ...validEnvelope, actions: [action1, action2], futureSuggestions: [suggestion] };
    },
  );

  const response = await app.inject({
    method: 'POST',
    url: '/ai/morning-brief/stream',
    payload: { profileId: 'profile-a', pageContext: defaultPageContext, bustCache: true },
    headers: { 'x-session-id': 'sess-int-struct' },
  });
  const events = parseSseFrames(response.body).map(validateFrameSchema);
  const types = events.map((e) => e.type);

  expect(types[0]).toBe('brief.started');
  expect(types[types.length - 1]).toBe('brief.completed');
  // 顺序 invariant
  const lastActionIdx = types.lastIndexOf('brief.action.ready');
  const forecastIdx = types.indexOf('brief.forecast.started');
  const firstSuggestionIdx = types.indexOf('brief.future_suggestion.ready');
  expect(forecastIdx).toBeGreaterThan(lastActionIdx);
  expect(firstSuggestionIdx).toBeGreaterThan(forecastIdx);
  // action.ready index 递增
  const actionEvents = events.filter((e) => e.type === 'brief.action.ready') as Extract<BriefStreamEvent, { type: 'brief.action.ready' }>[];
  expect(actionEvents.map((e) => e.index)).toEqual([0, 1]);
  expect(actionEvents[0].action.id).toBe('a1');
});

test('action 字段非法（缺 emoji）时该 action.ready 被跳过，流不中断', async () => {
  mockedExecuteAgent.mockReset();
  app.briefCache.clearAll();
  app.runtime.getSessionSandbox('sess-int-skip').overrideStore.reset('all');

  mockedExecuteAgent.mockImplementationOnce(
    async (_req, _deps, _timeout, _observer, _locale, options) => {
      // 第一个 action 缺 emoji，ActionOptionSchema 拒绝 → route 层跳过
      await options?.onActionReady?.(0, { id: 'bad', title: 't', description: 'd', aiPromise: 'p' } as never);
      await options?.onActionReady?.(1, { id: 'good', emoji: '💧', title: 't', description: 'd', aiPromise: 'p' });
      await options?.onForecastStarted?.();
      return validEnvelope;
    },
  );

  const response = await app.inject({
    method: 'POST',
    url: '/ai/morning-brief/stream',
    payload: { profileId: 'profile-a', pageContext: defaultPageContext, bustCache: true },
    headers: { 'x-session-id': 'sess-int-skip' },
  });
  const events = parseSseFrames(response.body).map(validateFrameSchema);
  const actionEvents = events.filter((e) => e.type === 'brief.action.ready');
  // 只剩第二个合法 action
  expect(actionEvents).toHaveLength(1);
  expect((actionEvents[0] as Extract<BriefStreamEvent, { type: 'brief.action.ready' }>).action.id).toBe('good');
  // completed 仍到达
  expect(events.some((e) => e.type === 'brief.completed')).toBe(true);
});

test('cache hit：started → completed（无 action.ready / forecast.started）', async () => {
  // 第一次请求预热缓存
  mockedExecuteAgent.mockReset();
  app.briefCache.clearAll();
  app.runtime.getSessionSandbox('sess-int-cache').overrideStore.reset('all');
  mockedExecuteAgent.mockImplementationOnce(async () => validEnvelope);
  await app.inject({
    method: 'POST',
    url: '/ai/morning-brief/stream',
    payload: { profileId: 'profile-a', pageContext: defaultPageContext, bustCache: true },
    headers: { 'x-session-id': 'sess-int-cache' },
  });

  // 第二次请求命中缓存（不 bust）
  mockedExecuteAgent.mockImplementationOnce(async () => { throw new Error('不应调用 LLM'); });
  const response = await app.inject({
    method: 'POST',
    url: '/ai/morning-brief/stream',
    payload: { profileId: 'profile-a', pageContext: defaultPageContext },
    headers: { 'x-session-id': 'sess-int-cache' },
  });
  const events = parseSseFrames(response.body).map(validateFrameSchema);
  const types = events.map((e) => e.type);
  expect(types[0]).toBe('brief.started');
  expect(types[types.length - 1]).toBe('brief.completed');
  expect(types).not.toContain('brief.action.ready');
  expect(types).not.toContain('brief.forecast.started');
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @health-advisor/agent-api exec vitest run src/__tests__/integration/morning-brief-stream.test.ts`
Expected: FAIL（新场景）

- [ ] **Step 3: route 接入 3 个回调**

修改 `routes.ts` 的 stream handler（约第 208-226 行，`orchestrator.execute` 调用处）。顶部 import 追加：

```typescript
import { ActionOptionSchema, FutureSuggestionSchema } from '@health-advisor/shared';
```

在现有 `onSummaryDelta` 回调之后，新增 3 个回调：

```typescript
onActionReady: async (index, action) => {
  if (writer.isClosed) return;
  const parsed = ActionOptionSchema.safeParse(action);
  if (!parsed.success) {
    app.log.warn({ requestId: request.ctx.requestId, index, issues: parsed.error.issues }, 'action.ready 元素校验失败，跳过');
    return;
  }
  await writer.writeEvent({
    type: 'brief.action.ready',
    requestId: request.ctx.requestId,
    index,
    action: parsed.data,
  });
},
onForecastStarted: async () => {
  if (!writer.isClosed) {
    await writer.writeEvent({ type: 'brief.forecast.started', requestId: request.ctx.requestId });
  }
},
onFutureSuggestionReady: async (index, suggestion) => {
  if (writer.isClosed) return;
  const parsed = FutureSuggestionSchema.safeParse(suggestion);
  if (!parsed.success) {
    app.log.warn({ requestId: request.ctx.requestId, index, issues: parsed.error.issues }, 'future_suggestion.ready 元素校验失败，跳过');
    return;
  }
  await writer.writeEvent({
    type: 'brief.future_suggestion.ready',
    requestId: request.ctx.requestId,
    index,
    suggestion: parsed.data,
  });
},
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter @health-advisor/agent-api exec vitest run src/__tests__/integration/morning-brief-stream.test.ts`
Expected: PASS

- [ ] **Step 5: typecheck + 提交**

Run: `pnpm --filter @health-advisor/agent-api typecheck`

```bash
git add apps/agent-api/src/modules/ai/routes.ts apps/agent-api/src/__tests__/integration/morning-brief-stream.test.ts
git commit -m "feat(agent-api): emit action.ready/forecast.started/future_suggestion.ready in stream route"
```

---

## Task 7: web — brief-stream store 扩展

**Files:**
- Modify: `apps/web/src/stores/brief-stream.store.ts`
- Test: `apps/web/src/stores/__tests__/brief-stream.store.test.ts`（新建）

- [ ] **Step 1: 写失败测试**

新建 `apps/web/src/stores/__tests__/brief-stream.store.test.ts`：

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { useBriefStreamStore } from '../brief-stream.store';

describe('brief-stream store 结构 draft', () => {
  beforeEach(() => {
    useBriefStreamStore.setState({ entries: {} });
  });

  it('begin 初始化空 draftActions / forecastStarted / draftFutureSuggestions', () => {
    useBriefStreamStore.getState().begin('p1', 'r1');
    const entry = useBriefStreamStore.getState().getEntry('p1');
    expect(entry?.draftActions).toEqual([]);
    expect(entry?.forecastStarted).toBe(false);
    expect(entry?.draftFutureSuggestions).toEqual([]);
  });

  it('appendAction 按 index 放置（乱序到达也正确）', () => {
    const s = useBriefStreamStore.getState();
    s.begin('p1', 'r1');
    s.appendAction('p1', 'r1', 1, { id: 'a2' } as never);
    s.appendAction('p1', 'r1', 0, { id: 'a1' } as never);
    const entry = useBriefStreamStore.getState().getEntry('p1');
    expect(entry?.draftActions.map((a) => a.id)).toEqual(['a1', 'a2']);
  });

  it('markForecastStarted 幂等', () => {
    const s = useBriefStreamStore.getState();
    s.begin('p1', 'r1');
    s.markForecastStarted('p1', 'r1');
    s.markForecastStarted('p1', 'r1');
    expect(useBriefStreamStore.getState().getEntry('p1')?.forecastStarted).toBe(true);
  });

  it('appendFutureSuggestion 按 index 放置', () => {
    const s = useBriefStreamStore.getState();
    s.begin('p1', 'r1');
    s.appendFutureSuggestion('p1', 'r1', 0, { timePoint: '15:30' } as never);
    expect(useBriefStreamStore.getState().getEntry('p1')?.draftFutureSuggestions.length).toBe(1);
  });

  it('stale requestId 被拒绝', () => {
    const s = useBriefStreamStore.getState();
    s.begin('p1', 'r1');
    s.appendAction('p1', 'stale', 0, { id: 'x' } as never);
    expect(useBriefStreamStore.getState().getEntry('p1')?.draftActions).toEqual([]);
  });

  it('complete 清理整个 entry', () => {
    const s = useBriefStreamStore.getState();
    s.begin('p1', 'r1');
    s.appendAction('p1', 'r1', 0, { id: 'a1' } as never);
    s.complete('p1', 'r1');
    expect(useBriefStreamStore.getState().getEntry('p1')).toBeUndefined();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter web exec vitest run src/stores/__tests__/brief-stream.store.test.ts`
Expected: FAIL（新方法不存在）

- [ ] **Step 3: 扩展 store**

修改 `apps/web/src/stores/brief-stream.store.ts`：

1. 顶部 import 追加：
   ```typescript
   import type { ActionOption, FutureSuggestion } from '@health-advisor/shared';
   ```

2. `BriefStreamEntry` 扩展：
   ```typescript
   export interface BriefStreamEntry {
     requestId: string;
     phase: BriefStreamPhase;
     draftSummary: string;
     draftActions: ActionOption[];
     forecastStarted: boolean;
     draftFutureSuggestions: FutureSuggestion[];
   }
   ```

3. `BriefStreamState` interface 新增 3 个方法签名：
   ```typescript
   appendAction(profileId: string, requestId: string, index: number, action: ActionOption): void;
   markForecastStarted(profileId: string, requestId: string): void;
   appendFutureSuggestion(profileId: string, requestId: string, index: number, suggestion: FutureSuggestion): void;
   ```

4. `begin` 初始化新字段：
   ```typescript
   [profileId]: {
     requestId,
     phase: 'streaming',
     draftSummary: '',
     draftActions: [],
     forecastStarted: false,
     draftFutureSuggestions: [],
   },
   ```

5. 新增 3 个方法实现（`appendAction` 用 index-aware 放置）：
   ```typescript
   appendAction: (profileId, requestId, index, action) => {
     const current = get().entries[profileId];
     if (!current || current.requestId !== requestId) return;
     set((state) => {
       const entry = state.entries[profileId];
       if (!entry || entry.requestId !== requestId) return state;
       const next = entry.draftActions.slice();
       next[index] = action;
       return { entries: { ...state.entries, [profileId]: { ...entry, draftActions: next } } };
     });
   },

   markForecastStarted: (profileId, requestId) => {
     const current = get().entries[profileId];
     if (!current || current.requestId !== requestId || current.forecastStarted) return;
     set((state) => {
       const entry = state.entries[profileId];
       if (!entry || entry.requestId !== requestId || entry.forecastStarted) return state;
       return { entries: { ...state.entries, [profileId]: { ...entry, forecastStarted: true } } };
     });
   },

   appendFutureSuggestion: (profileId, requestId, index, suggestion) => {
     const current = get().entries[profileId];
     if (!current || current.requestId !== requestId) return;
     set((state) => {
       const entry = state.entries[profileId];
       if (!entry || entry.requestId !== requestId) return state;
       const next = entry.draftFutureSuggestions.slice();
       next[index] = suggestion;
       return { entries: { ...state.entries, [profileId]: { ...entry, draftFutureSuggestions: next } } };
     });
   },
   ```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter web exec vitest run src/stores/__tests__/brief-stream.store.test.ts`
Expected: PASS

- [ ] **Step 5: typecheck + 提交**

Run: `pnpm --filter web typecheck`

```bash
git add apps/web/src/stores/brief-stream.store.ts apps/web/src/stores/__tests__/brief-stream.store.test.ts
git commit -m "feat(web): extend brief-stream store with draft actions/forecast/suggestions"
```

---

## Task 8: web — use-ai-query onEvent 分发

**Files:**
- Modify: `apps/web/src/hooks/use-ai-query.ts`

- [ ] **Step 1: 改 onEvent 分发**

修改 `runBriefStream` 的 `onEvent`（约第 65-74 行），替换为 switch：

```typescript
onEvent: (event) => {
  const store = useBriefStreamStore.getState();
  switch (event.type) {
    case 'brief.summary.delta':
      store.append(profileId, requestId, event.delta);
      break;
    case 'brief.action.ready':
      store.appendAction(profileId, requestId, event.index, event.action);
      break;
    case 'brief.forecast.started':
      store.markForecastStarted(profileId, requestId);
      break;
    case 'brief.future_suggestion.ready':
      store.appendFutureSuggestion(profileId, requestId, event.index, event.suggestion);
      break;
    // started/completed/failed 仍由外层 try/finally + resolve/reject 处理
  }
},
```

- [ ] **Step 2: typecheck + 跑 web 现有测试无回归**

Run: `pnpm --filter web typecheck && pnpm --filter web exec vitest run src/hooks`
Expected: 无错误

- [ ] **Step 3: 提交**

```bash
git add apps/web/src/hooks/use-ai-query.ts
git commit -m "feat(web): dispatch action.ready/forecast.started/future_suggestion.ready to store"
```

---

## Task 9: web — FutureTimelineBlock 打字机

**Files:**
- Modify: `apps/web/src/components/homepage/FutureTimelineBlock.tsx`
- Test: `apps/web/src/components/homepage/FutureTimelineBlock.test.tsx`

- [ ] **Step 1: 写失败测试**

在 `FutureTimelineBlock.test.tsx` 追加：

```typescript
import { render, screen, act } from '@testing-library/react';
import { vi } from 'vitest';

const typewriterSuggestion = {
  timePoint: '15:30',
  predictedState: '低谷',
  rationale: '咖啡因',
  action: { id: 'f1', emoji: '🧘', title: '呼吸', description: '深呼吸', aiPromise: '记录' },
} as never;

it('animate=true 时 predictedState/rationale 逐字增长', async () => {
  vi.useFakeTimers();
  render(<FutureTimelineBlock suggestion={typewriterSuggestion} animate done={false} />);
  // 初始 timePoint 立即显示
  expect(screen.getByText('15:30')).toBeInTheDocument();
  // 快进定时器到打字机完成（predictedState 2 字 + rationale 3 字 = 5 tick × 30ms = 150ms）
  act(() => { vi.advanceTimersByTime(500); });
  expect(screen.getByText('低谷')).toBeInTheDocument();
  expect(screen.getByText('咖啡因')).toBeInTheDocument();
  vi.useRealTimers();
});

it('done=true 立即显示全文（跳过打字机）', () => {
  render(<FutureTimelineBlock suggestion={typewriterSuggestion} done />);
  expect(screen.getByText('低谷')).toBeInTheDocument();
  expect(screen.getByText('咖啡因')).toBeInTheDocument();
});

it('done 从 false 切到 true 时立即补全', () => {
  vi.useFakeTimers();
  const { rerender } = render(<FutureTimelineBlock suggestion={typewriterSuggestion} animate done={false} />);
  rerender(<FutureTimelineBlock suggestion={typewriterSuggestion} animate done />);
  expect(screen.getByText('低谷')).toBeInTheDocument();
  vi.useRealTimers();
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter web exec vitest run src/components/homepage/FutureTimelineBlock.test.tsx`
Expected: FAIL

- [ ] **Step 3: 实现打字机**

修改 `FutureTimelineBlock.tsx`。Props 扩展：

```typescript
export interface FutureTimelineBlockProps {
  suggestion: FutureSuggestion;
  /** 启用打字机逐字 reveal（仅 predictedState + rationale） */
  animate?: boolean;
  /** 流已结束或非流式：true 时立即显示全文 */
  done?: boolean;
}
```

组件内（用 useState + useEffect + setInterval）：

```typescript
const TYPING_INTERVAL_MS = 30;

const FutureTimelineBlock: React.FC<FutureTimelineBlockProps> = ({ suggestion, animate, done }) => {
  const showFull = !animate || done;
  const [predRevealed, setPredRevealed] = useState(showFull ? suggestion.predictedState : '');
  const [ratRevealed, setRatRevealed] = useState(showFull ? suggestion.rationale : '');

  useEffect(() => {
    if (showFull) {
      setPredRevealed(suggestion.predictedState);
      setRatRevealed(suggestion.rationale);
      return;
    }
    setPredRevealed('');
    setRatRevealed('');
    let predIdx = 0;
    let ratIdx = 0;
    const timer = setInterval(() => {
      if (predIdx < suggestion.predictedState.length) {
        predIdx++;
        setPredRevealed(suggestion.predictedState.slice(0, predIdx));
      } else if (ratIdx < suggestion.rationale.length) {
        ratIdx++;
        setRatRevealed(suggestion.rationale.slice(0, ratIdx));
      } else {
        clearInterval(timer);
      }
    }, TYPING_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [suggestion.predictedState, suggestion.rationale, showFull]);

  return (
    // 原有 JSX，把 predictedState 的渲染源改为 predRevealed、rationale 改为 ratRevealed
    // timePoint 与 action 卡片仍直接用 suggestion.* （结构化字段不打字机）
  );
};
```

注意：保留原有 JSX 结构，只把 `suggestion.predictedState` → `predRevealed`、`suggestion.rationale` → `ratRevealed` 作为文本渲染源。其余（timePoint、action）不变。

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter web exec vitest run src/components/homepage/FutureTimelineBlock.test.tsx`
Expected: PASS

- [ ] **Step 5: typecheck + 提交**

Run: `pnpm --filter web typecheck`

```bash
git add apps/web/src/components/homepage/FutureTimelineBlock.tsx apps/web/src/components/homepage/FutureTimelineBlock.test.tsx
git commit -m "feat(web): add typewriter reveal to FutureTimelineBlock"
```

---

## Task 10: web — Skeleton 组件 + page.tsx 渲染逻辑

**Files:**
- Create: `apps/web/src/components/homepage/ActionCardSkeleton.tsx`
- Create: `apps/web/src/components/homepage/FutureTimelineBlockSkeleton.tsx`
- Modify: `apps/web/src/app/page.tsx`

- [ ] **Step 1: 新建两个 Skeleton 组件**

新建 `ActionCardSkeleton.tsx`（复用项目现有 Skeleton 视觉风格——参考 `BriefTimeline.tsx` 的 isLoading skeleton，灰条 + animate-pulse）：

```typescript
export function ActionCardSkeleton() {
  return (
    <div className="rounded-xl border border-gray-200 p-4 animate-pulse" aria-hidden>
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-gray-200" />
        <div className="h-4 w-24 rounded bg-gray-200" />
      </div>
      <div className="mt-3 h-3 w-full rounded bg-gray-200" />
      <div className="mt-2 h-3 w-2/3 rounded bg-gray-200" />
    </div>
  );
}
```

新建 `FutureTimelineBlockSkeleton.tsx`：

```typescript
export function FutureTimelineBlockSkeleton() {
  return (
    <div className="rounded-xl border border-gray-200 p-4 animate-pulse" aria-hidden>
      <div className="h-4 w-16 rounded bg-gray-200" />
      <div className="mt-3 h-3 w-full rounded bg-gray-200" />
      <div className="mt-2 h-3 w-3/4 rounded bg-gray-200" />
    </div>
  );
}
```

（具体 className 以项目设计系统为准——实现时对照已有 Skeleton 组件对齐。）

- [ ] **Step 2: 修改 page.tsx 渲染推导**

修改 `apps/web/src/app/page.tsx`。顶部 import 追加：

```typescript
import { ActionCardSkeleton } from '@/components/homepage/ActionCardSkeleton';
import { FutureTimelineBlockSkeleton } from '@/components/homepage/FutureTimelineBlockSkeleton';
```

约第 63-67 行（订阅 store）之后，新增阶段推导（替换/补充原 `actions` / `futureSuggestions` 取值，约第 128-144 行）：

```typescript
const draftEntry = useBriefStreamStore((s) => s.entries[profileId ?? '']);
const isStreaming = draftEntry?.phase === 'streaming';

const displayedSummary = draftEntry?.draftSummary || effectiveData?.summary || '';

const actions = isStreaming && draftEntry
  ? draftEntry.draftActions
  : (effectiveData?.actions ?? []);

const futureSuggestions = isStreaming && draftEntry
  ? draftEntry.draftFutureSuggestions
  : (effectiveData?.futureSuggestions ?? []);

const forecastVisible = isStreaming && Boolean(draftEntry?.forecastStarted);

// 卡片位：流式中补足到 2 个 Skeleton
const cardSlots = isStreaming
  ? Array.from({ length: Math.max(2, actions.length) }, (_, i) => actions[i] ?? null)
  : actions.map((a) => a);
// 预测位：forecastVisible 时补足到 2 个 Skeleton
const forecastSlots = forecastVisible
  ? Array.from({ length: Math.max(2, futureSuggestions.length) }, (_, i) => futureSuggestions[i] ?? null)
  : futureSuggestions.map((s) => s);
```

- [ ] **Step 3: 卡片区渲染**

在卡片区 JSX（原 `actions.map(...)` 处），改为遍历 `cardSlots`：

```tsx
{cardSlots.map((action, i) =>
  action ? (
    <ActionCard key={action.id} action={action} onYes={...} onNotNow={...} />
  ) : (
    <ActionCardSkeleton key={`skeleton-card-${i}`} />
  ),
)}
```

- [ ] **Step 4: 预测区渲染**

预测区改为条件渲染（`forecastVisible || futureSuggestions.length > 0`）+ 遍历 `forecastSlots`：

```tsx
{(forecastVisible || futureSuggestions.length > 0) && (
  <section className="...">
    <h2>...</h2>
    {forecastSlots.map((suggestion, i) =>
      suggestion ? (
        <FutureTimelineBlock
          key={suggestion.timePoint}
          suggestion={suggestion}
          animate={isStreaming}
          done={!isStreaming}
        />
      ) : (
        <FutureTimelineBlockSkeleton key={`skeleton-forecast-${i}`} />
      ),
    )}
  </section>
)}
```

注意：`done={!isStreaming}`——流结束后立即补全打字机；非流式（终态）直接显示全文。

- [ ] **Step 5: typecheck + 跑 web 全部测试**

Run: `pnpm --filter web typecheck && pnpm --filter web exec vitest run`
Expected: 无错误

- [ ] **Step 6: 提交**

```bash
git add apps/web/src/components/homepage/ActionCardSkeleton.tsx apps/web/src/components/homepage/FutureTimelineBlockSkeleton.tsx apps/web/src/app/page.tsx
git commit -m "feat(web): progressive card/forecast rendering with skeletons and typewriter"
```

---

## Task 11: 集成验证 + 收尾

**Files:**
- 全包测试 + 手动/浏览器验证

- [ ] **Step 1: 全包测试**

Run: `pnpm test`
Expected: 全部 PASS

- [ ] **Step 2: typecheck**

Run: `pnpm typecheck`
Expected: 无错误

- [ ] **Step 3: 浏览器手动验证**

启动 dev（`pnpm dev`），在首页观察：
- summary 逐字流式
- 卡片区立即显示 2 个 Skeleton，卡片逐张替换
- forecast.started 后预测区展开（Skeleton）
- 预测逐条出现，predictedState/rationale 打字机逐字
- completed 后全部对齐，无 Skeleton 残留
- 刷新（bustCache）重复观察
- 断开网络（abort）验证不崩

若无法在浏览器测试，明确说明"未做浏览器验证"。

- [ ] **Step 4: 最终提交（若有手动调整）**

```bash
git add -A
git commit -m "test: finalize progressive brief streaming integration"
```

---

## Self-Review 备注

- spec 的"改动文件清单"全部覆盖（Task 1-10）。
- streamparser 语法风险已通过 Task 3 的探针验证测试固化（多 chunk、surrogate、fence、缺省、空数组、畸形）。
- forecastStarted 时机一致：Task 3 实现 + Task 1 schema + Task 7 store + spec 描述全部对齐"第一个 futureSuggestions 元素就绪时"。
- 类型一致：`appendAction(profileId, requestId, index, action)` 在 Task 7 定义、Task 8 调用；`animate`/`done` props 在 Task 9 定义、Task 10 调用。
- AgentExecutionOptions 的 3 个新回调在 Task 4（runtime）与 Task 5（orchestrator）签名一致。
- 单元素业务校验（route 层 safeParse）在 Task 6，与 spec"错误处理"一致。
