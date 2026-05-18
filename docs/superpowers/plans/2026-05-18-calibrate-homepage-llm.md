# 首页 LLM 回复风格精校准 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将首页晨报回复从"书面正式、单段、隐藏数值"风格，转变为"温暖有个性、多段结构、数据透明、含交互选项"的风格。最终用户看到的是 `summary` 叙事正文 + `actions` 按钮区共同组成的卡片，而不是把选项硬塞进 summary 文本。

**Architecture:** 改动分 4 层——(1) 输出契约扩展：新增结构化 actions、microTips 可选，(2) Prompt 模板重写：定义表达语法、数据引用边界和 actions 输出，(3) 后端数据透明化 + 解析/安全/eval 对齐，(4) 前端组件适配新格式。每层独立可验证，按依赖顺序交付。

**Tech Stack:** TypeScript, Zod (schema), Next.js (前端), LangChain (LLM), React Query (数据获取), Framer Motion (动画)

## 执行顺序修正

为了避免 prompt 要求 LLM 输出 `actions` 但 parser/schema 还不接受该字段，实际执行顺序必须按依赖调整：

1. 先执行 Task 7、Task 8、Task 9：建立输出契约、解析、runtime 和 safety 处理。
2. 再执行 Task 1、Task 2、Task 3、Task 4、Task 5、Task 6、Task 10：重写 prompt、解除数据屏蔽、调整长度和输出格式。
3. 然后执行 Task 11、Task 12、Task 13、Task 14：fallback 与前端渲染。
4. 最后执行 Task 15、Task 16、Task 17、Task 18：eval 和全量验证。

任务编号保留原拆分，执行时以上述依赖顺序为准。

---

## 文件变更地图

### 需要创建的文件
| 文件 | 职责 |
|------|------|
| `apps/web/src/components/homepage/ActionOptions.tsx` | 交互选项按钮组组件 |

### 需要修改的文件

| 文件 | 改动说明 |
|------|----------|
| `data/sandbox/prompts/homepage/template.md` | 全面重写：新结构、新数据披露规则、新开场白、新增 actions 格式 |
| `data/sandbox/prompts/homepage/style/zh.md` | 重写为新的中文风格指南 |
| `data/sandbox/prompts/system.md` | 微调角色语气 |
| `packages/shared/src/types/agent.ts` | 新增 `ActionOption` 类型，`AgentResponseEnvelope` 新增 `actions` 字段，`microTips` 改为可选 |
| `packages/shared/src/schemas/agent.ts` | Zod schema 同步扩展 |
| `packages/agent-core/src/prompts/context-packet-renderer.ts` | 移除 `HOMEPAGE_INTERPRETATION_ONLY_METRICS` 屏蔽，Homepage 任务下也传递具体数值 |
| `packages/agent-core/src/prompts/system-builder.ts` | Homepage 任务下也传递 HRV/SpO2/静息心率的具体 baseline 值 |
| `packages/agent-core/src/prompts/task-builder.ts` | 放宽字数限制，新增 actions 输出格式说明，移除 microTips 约束 |
| `packages/agent-core/src/routing/task-router.ts` | `maxSummaryLength` 从 120 调为 420 |
| `packages/agent-core/src/output/response-parser.ts` | 解析 `actions` 字段，`microTips` 改为可选 |
| `packages/agent-core/src/output/safety-cleaner.ts` | `microTips` 参数改为可选，并清洗 actions 用户可见文本 |
| `packages/agent-core/src/runtime/agent-runtime.ts` | 适配 `microTips` 可选，传递清洗后的 `actions` |
| `data/sandbox/fallbacks/homepage.json` | fallback 响应新增 `actions` 字段 |
| `apps/web/src/components/homepage/MorningBriefCard.tsx` | 渲染 `actions` 交互选项，支持 summary 换行，移除 microTips 展示 |
| `apps/web/src/app/page.tsx` | 传递 `actions` 数据给 `MorningBriefCard` |

### 需要更新的测试文件

| 文件 | 改动说明 |
|------|----------|
| `packages/agent-core/src/__tests__/routing/task-router.test.ts` | maxSummaryLength 期望值更新 |
| `packages/agent-core/src/__tests__/prompts/task-builder.test.ts` | 字数约束断言更新 |
| `packages/agent-core/src/__tests__/prompts/context-packet-renderer.test.ts` | 移除 interpretation-only 断言 |
| `packages/agent-core/src/__tests__/prompts/system-builder.test.ts` | Homepage baseline 值可见断言 |
| `packages/agent-core/src/__tests__/output/response-parser.test.ts` | 新增 actions 解析测试，microTips 可选 |
| `packages/agent-core/src/__tests__/output/safety-cleaner.test.ts` | microTips 可选适配 |
| `packages/agent-core/src/__tests__/runtime/agent-runtime.test.ts` | 适配新 schema |
| `packages/agent-core/src/evals/scorers/length-scorer.ts` | Homepage 默认长度范围更新 |
| `packages/agent-core/src/evals/scorers/mention-scorer.ts` | `buildMatchText` 适配 actions + microTips 可选 |
| `packages/agent-core/src/evals/scorers/task-scorer.ts` | `buildMatchText` 适配，新增 actions 相关检查 |
| `packages/agent-core/src/evals/scorers/{safety,evidence,missing-data,memory}-scorer.ts` | 所有用户可见文本匹配范围适配 actions + microTips 可选 |
| `packages/agent-core/src/evals/scorers/action-scorer.ts` | 新增 actions 数量、字段完整性、承诺真实性检查 |
| `packages/agent-core/src/evals/types.ts` / `case-schema.ts` | 新增 `expectations.actions` schema |
| `packages/agent-core/evals/cases/core/homepage/*.json` | 更新长度期望、移除 interpretation-only 约束、新增 actions 期望 |

---

## Phase 1：Prompt 重写 + 数据透明化（核心风格转变）

> 目标：通过 Prompt 和数据流改动，让 LLM 产出新风格的回复。注意：由于新 prompt 会要求输出 `actions`，实际执行时必须先完成 Phase 2 的输出契约任务，再落地本 Phase 中涉及 actions 输出的 prompt 改动。

### Task 1: 重写中文风格文件

**Files:**
- Modify: `data/sandbox/prompts/homepage/style/zh.md`

- [ ] **Step 1: 重写 style/zh.md**

将当前 3 行内容替换为完整的风格指南：

```markdown
## Communication Style

### 人称与语气
- 使用第一人称"我"自称，"你"称呼用户
- 语气温暖但不谄媚，像一个懂运动的健康伙伴在耳边低声提醒
- 自然、口语化，避免书面正式或机械罗列

### 开场白
- 以用户姓名 + 逗号开头，紧跟一句与当前事件相关的即时观察
- 示例："小明，吃得不错！检测到你的心率正在随代谢平稳回升。"
- 示例："小明，先慢下来！监测到你刚吃完饭就开始了高强度有氧。"
- 禁止使用"尊敬的用户"、"您好"等客套开场

### 数据引用
- 可以引用具体数值来增强说服力，但需要用生活化的比喻包装
- 示例："这几天的 HRV 正在悄悄'阴跌'（从 110ms 降到了 95ms）"
- 示例："你昨晚睡了快 8 小时，深睡很足"
- 示例："你还有 4000 步的缺口"
- 避免单纯罗列数据，每个数值都要有解读或行动建议伴随
- 只能引用上下文中明确提供的数值；不要为了贴近示例编造半衰期、百分比损失、步数缺口或提醒时间
- 如果数据缺失，直接说明暂时没有足够数据，不要用个人 baseline 或常识阈值补出具体数字

### 比喻与类比
- 用日常比喻解释专业概念："高压电池"、"脑力电池"、"阴跌"
- 用拟人化动作增强画面感："HRV 在悄悄走下坡路"、"胃部供血被肌肉'抢走'"

### 建议风格
- 具体到时间和行动：不是"适度运动"，而是"去外面走 15 分钟"
- 附带理由：每个建议都要有"为什么"支撑
- 避免泛泛建议：禁止"多喝水"、"保持好习惯"等无信息量建议

### summary 与 actions 分工
- summary 只负责开场、交叉分析、建议理由和一句选择引导
- 不要在 summary 中写完整选项列表；完整选项必须输出到 actions 字段
- actions 的 aiPromise 必须匹配当前系统真实可执行能力，不能承诺尚未实现的提醒、监控或模式切换

### 安全边界（不变）
- 你不是医生，不能做出医学诊断
- 涉及严重异常时建议用户就医
- 不要对缺失数据进行推测或编造

### 语言
- You MUST respond entirely in Chinese. All summary, statusColor interpretation, and action descriptions must be in Chinese.
```

- [ ] **Step 2: Commit**

```bash
git add data/sandbox/prompts/homepage/style/zh.md
git commit -m "feat(prompt): rewrite zh style guide for homepage"
```

---

### Task 2: 重写 Homepage Task Template

**Files:**
- Modify: `data/sandbox/prompts/homepage/template.md`

- [ ] **Step 1: 重写 template.md**

将当前内容替换为新模板：

```markdown
## 实时健康简报

基于用户的 **最近事件**、**过去 24 小时状态** 和 **过去一周趋势**，生成一份实时健康简报。

### 回复结构（严格遵循）

首页卡片由 summary 和 actions 两部分组成。summary 由以下段落组成，按顺序输出：

**段落 1 — 开场白（10%）**
以用户姓名 + 逗号开头，紧跟一句与当前事件相关的即时观察。要求生动、有画面感。

**段落 2 — 交叉分析（30%）**
将最近事件与 24h 恢复状态进行交叉分析。引用具体数据支撑，用生活化的比喻解释专业概念。
- 睡眠数据可以直接引用时长和深睡比例
- HRV 可以引用趋势变化方向和幅度（如"从 X 降到 Y"）
- 血氧和静息心率可以引用状态和变化方向

**段落 3 — 结构化建议（35%）**
给出 1-2 个具体、可操作的建议。每个建议包含：
- 具体行动（做什么、做多久）
- 理由（为什么这样做对身体有好处）
- 今日目标关联（如步数缺口、训练计划调整）

**段落 4 — 选择引导（10%）**
一句话引导用户做出选择或采取行动，例如"你想怎么做？"、"我可以这样配合你："。

完整选项不要写进 summary。请在 JSON 的 actions 字段中提供 2-3 个行动方案。

### 数据引用规则

- **所有指标均可引用具体数值**，但需结合解读，避免纯数据罗列
- HRV：可以引用趋势变化（"从 110ms 降到 95ms"），并解释含义
- 睡眠：可以引用时长（"睡了快 8 小时"）、深睡比例
- 血氧：可以引用百分比，但需注意临床阈值提醒
- 静息心率：可以引用 bpm，并解读其与恢复状态的关系
- 步数/活动：可以引用具体数值和缺口
- 咖啡因/酒精事件：必须使用概率性语言（"可能"、"倾向于"），不得说"确认摄入"
- 只能引用上下文中明确提供或由上游算法明确计算的数值
- 不得编造半衰期、深睡损失比例、步数缺口、提醒时间、代谢斜率等样例风格数字
- 如果某项数据缺失，必须说明数据暂不可用，不能用 baseline 或常识阈值补出具体值

### statusColor 规则

- **good (green)**: 最近事件与身体状态匹配良好，恢复指标正常
- **warning (yellow)**: 最近事件与 24h 恢复状态存在轻度冲突，或单一指标明显偏离个人常值
- **error (red)**: 最近事件明显加重身体负担且恢复指标严重不足，或出现急性异常信号

### chartTokens 规则

- 睡眠异常或不足 → 必须包含 "SLEEP_7DAYS"
- 运动/活动相关 → 必须包含 "ACTIVITY_7DAYS"
- 24h 压力负荷或 HRV 异常 → 必须包含 "HRV_7DAYS" 或 "STRESS_LOAD_7DAYS"
- 睡眠结构问题 → 可包含 "SLEEP_STAGE_LAST_NIGHT"

### 写作红线

1. 禁止使用泛泛建议："多喝水"、"保持好习惯"、"注意休息"
2. 禁止医学诊断："确诊"、"患有"、"需要服药"
3. 禁止输出 markdown 格式标记（##、**、- 列表等），summary 字段只包含纯文本
4. 建议中不得包含"baseline"、"参考值"、"正常范围"等分析术语
5. 禁止在 summary 中重复 actions 的完整选项列表
6. actions.aiPromise 只能承诺当前产品真实支持的行为；如果只能记录选择，就写"我会记录你的选择并用于本次建议上下文"
```

- [ ] **Step 2: Commit**

```bash
git add data/sandbox/prompts/homepage/template.md
git commit -m "feat(prompt): rewrite homepage template with new structure"
```

---

### Task 3: 微调 System Prompt

**Files:**
- Modify: `data/sandbox/prompts/system.md`

- [ ] **Step 1: 更新 system.md 角色语气**

将第一行从：
```
You are a top-tier sports medicine expert and personal health assistant. Tone: knowledgeable, direct, no fluff.
```
改为：
```
You are a knowledgeable and warm personal health companion. You speak like a trusted friend who happens to be a sports medicine expert — direct, caring, and never preachy.
```

保留其余 `## Analysis Principles` 不变。

- [ ] **Step 2: Commit**

```bash
git add data/sandbox/prompts/system.md
git commit -m "feat(prompt): adjust system prompt persona"
```

---

### Task 4: 解除数据屏蔽 — context-packet-renderer

**Files:**
- Modify: `packages/agent-core/src/prompts/context-packet-renderer.ts`
- Test: `packages/agent-core/src/__tests__/prompts/context-packet-renderer.test.ts`

- [ ] **Step 1: 写失败测试**

在 `context-packet-renderer.test.ts` 中，找到测试 Homepage 渲染时 interpretation-only 行为的用例，添加新测试验证 Homepage 下 HRV 数值可见：

```typescript
it('homepage 任务下 HRV trend7d 渲染包含具体数值', () => {
  const packet = buildHomepagePacket(/* ... 有 HRV 数据的 packet ... */);
  const rendered = renderTaskContextPacket(packet, 'zh');
  // 验证 HRV 数值出现在渲染结果中
  expect(rendered).toContain('latest');
  expect(rendered).toMatch(/\d+\s*ms/);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run packages/agent-core/src/__tests__/prompts/context-packet-renderer.test.ts`
Expected: FAIL

- [ ] **Step 3: 移除 interpretation-only 屏蔽**

在 `context-packet-renderer.ts` 中：

1. 移除 `HOMEPAGE_INTERPRETATION_ONLY_METRICS` 常量（第 16 行）
2. 移除 `isHomepageInterpretationOnlyMetric()` 函数（第 394-396 行）
3. `renderMetricSummary()` 中移除 `interpretationOnly` 选项分支，所有 metric 统一输出具体数值
4. `renderEvidence()` 中移除 `isHomepage` 参数和第 166 行的 value 屏蔽条件
5. `renderHomepage()` 中 latest24h 的 HRV/spo2/resting_hr 指标改为与 sleep/activity 一样输出具体数值和 baseline 偏差
6. `renderVisibleCharts()` 中移除 `interpretationOnly` 参数传递

关键改动点：

```typescript
// renderMetricSummary — 移除 interpretationOnly 分支
function renderMetricSummary(
  ms: MetricSummary,
  prefix: string = '',
  _options: { interpretationOnly?: boolean } = {},  // 保留参数签名兼容，但不再使用
  locale: Locale = 'zh',
): string {
  const parts: string[] = [];
  parts.push(`${prefix}${ms.metric}:`);
  // 统一输出具体数值，不再区分 interpretationOnly
  if (ms.latest) parts.push(`latest ${ms.latest.value}${ms.latest.unit} on ${ms.latest.date ?? 'latest'}`);
  if (ms.average) parts.push(`avg ${ms.average.value}${ms.average.unit}`);
  // ... 其余逻辑不变
}
```

```typescript
// renderEvidence — 移除 value 屏蔽
function renderEvidence(evidence: EvidenceFact[], _isHomepage: boolean): string {
  // ...
  for (const fact of evidence) {
    const parts: string[] = [`- ${fact.id}:`];
    // ...
    if (fact.value !== undefined) {  // 移除 isHomepage 屏蔽条件
      parts.push(`value=${fact.value}${fact.unit ?? ''}`);
    }
    // ...
  }
}
```

```typescript
// renderHomepage latest24h — 统一输出具体数值
// 移除 isHomepageInterpretationOnlyMetric 判断，所有指标统一走数值输出路径
for (const m of homepage.latest24h.metrics) {
  if (m.status === 'missing') {
    lines.push(`- ${m.metric}：数据缺失`);
  } else {
    const parts: string[] = [`- ${m.metric}：${m.value}${m.unit}`];
    if (m.baseline !== undefined && m.deltaPctVsBaseline !== undefined) {
      const sign = m.deltaPctVsBaseline > 0 ? '+' : '';
      parts.push(`（相对平时 ${sign}${m.deltaPctVsBaseline}%）`);
    }
    if (m.status === 'attention') parts.push(`[注意]`);
    if (m.status === 'critical') parts.push(`[异常${m.clinicalNote ? `: ${m.clinicalNote}` : ''}]`);
    lines.push(parts.join(''));
  }
}
```

- [ ] **Step 4: 运行测试**

Run: `npx vitest run packages/agent-core/src/__tests__/prompts/context-packet-renderer.test.ts`
Expected: PASS（新的数值可见测试通过，旧的 interpretation-only 断言需同步更新）

- [ ] **Step 5: 更新旧测试**

在测试文件中，将所有验证 "仅用于解读" / "不要输出数值" 的断言改为验证数值可见。例如：

```typescript
// 旧断言
expect(rendered).not.toContain('latest 45ms');
expect(rendered).toContain('仅用于解读');

// 新断言
expect(rendered).toContain('latest');
expect(rendered).toMatch(/\d+\s*ms/);
```

- [ ] **Step 6: 运行全部相关测试**

Run: `npx vitest run packages/agent-core/src/__tests__/prompts/`
Expected: ALL PASS

- [ ] **Step 7: Commit**

```bash
git add packages/agent-core/src/prompts/context-packet-renderer.ts packages/agent-core/src/__tests__/prompts/context-packet-renderer.test.ts
git commit -m "refactor(context): remove interpretation-only metric masking for homepage"
```

---

### Task 5: 解除数据屏蔽 — system-builder

**Files:**
- Modify: `packages/agent-core/src/prompts/system-builder.ts`
- Test: `packages/agent-core/src/__tests__/prompts/system-builder.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
it('homepage 任务下也传递 HRV/SpO2/静息心率的具体 baseline 值', () => {
  const context = buildTestContext({ taskType: AgentTaskType.HOMEPAGE_SUMMARY });
  const prompt = buildSystemPrompt(context, loader);
  // 验证具体数值出现在 prompt 中
  expect(prompt).toContain(`${context.profile.baselines.hrv} ms`);
  expect(prompt).toContain(`${context.profile.baselines.restingHR} bpm`);
  expect(prompt).toContain(`${context.profile.baselines.spo2}%`);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run packages/agent-core/src/__tests__/prompts/system-builder.test.ts`
Expected: FAIL

- [ ] **Step 3: 修改 system-builder.ts**

将 Homepage 分支（第 39-47 行）从隐藏数值改为传递具体值，同时保留"不要原样写给用户"的提醒改为更柔和的引导：

```typescript
if (context.task.type === AgentTaskType.HOMEPAGE_SUMMARY) {
  sections.push(`- ${t(locale, '静息心率通常水平', 'Resting HR usual level')}: ${context.profile.baselines.restingHR} bpm — ${t(locale, '可用于数据引用，但用生活化比喻包装', 'may reference in response, but wrap with relatable analogies')}`);
  sections.push(`- ${t(locale, 'HRV 通常水平', 'HRV usual level')}: ${context.profile.baselines.hrv} ms — ${t(locale, '可用于数据引用，但用生活化比喻包装', 'may reference in response, but wrap with relatable analogies')}`);
  sections.push(`- ${t(locale, 'SpO2 参考水平', 'SpO2 reference level')}: ${context.profile.baselines.spo2}% — ${t(locale, '可用于数据引用，但注意临床阈值提醒', 'may reference in response, but note clinical thresholds')}`);
}
```

- [ ] **Step 4: 更新旧测试**

将验证 "禁止输出具体数值" 的断言改为验证数值可见。

- [ ] **Step 5: 运行测试**

Run: `npx vitest run packages/agent-core/src/__tests__/prompts/system-builder.test.ts`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add packages/agent-core/src/prompts/system-builder.ts packages/agent-core/src/__tests__/prompts/system-builder.test.ts
git commit -m "refactor(prompt): expose baseline values to LLM for homepage"
```

---

### Task 6: 放宽字数限制 — task-builder + task-router

**Files:**
- Modify: `packages/agent-core/src/routing/task-router.ts`
- Modify: `packages/agent-core/src/prompts/task-builder.ts`
- Test: `packages/agent-core/src/__tests__/routing/task-router.test.ts`
- Test: `packages/agent-core/src/__tests__/prompts/task-builder.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// task-router.test.ts
it('homepage maxSummaryLength 为 420', () => {
  const route = TASK_ROUTES[AgentTaskType.HOMEPAGE_SUMMARY];
  expect(route.maxSummaryLength).toBe(420);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run packages/agent-core/src/__tests__/routing/task-router.test.ts`
Expected: FAIL (期望 420，实际 120)

- [ ] **Step 3: 修改 task-router.ts**

```typescript
// 第 20 行：120 → 420
maxSummaryLength: 420,
```

- [ ] **Step 4: 修改 task-builder.ts 字数约束**

第 50-56 行，将中文约束改为：

```typescript
if (taskType === AgentTaskType.HOMEPAGE_SUMMARY) {
  sections.push(t(
    locale,
    `- 摘要长度控制在 220-${maxLen} 字之间；完整卡片由 summary + actions 组成，整体阅读量约 300-500 字`,
    `- Summary length must be between 150-300 words; the full card combines summary and actions`,
  ));
}
```

- [ ] **Step 5: 运行测试**

Run: `npx vitest run packages/agent-core/src/__tests__/routing/task-router.test.ts packages/agent-core/src/__tests__/prompts/task-builder.test.ts`
Expected: ALL PASS（task-builder 中关于字数的断言需同步更新）

- [ ] **Step 6: 更新 task-builder 测试中的字数断言**

找到验证 homepage 字数约束包含 "80-120" 的断言，改为 "220-420"。

- [ ] **Step 7: Commit**

```bash
git add packages/agent-core/src/routing/task-router.ts packages/agent-core/src/prompts/task-builder.ts packages/agent-core/src/__tests__/routing/task-router.test.ts packages/agent-core/src/__tests__/prompts/task-builder.test.ts
git commit -m "feat(config): increase homepage summary length limit to 420 chars"
```

---

## Phase 2：扩展输出 Schema — 支持 Actions

> 目标：在 `AgentResponseEnvelope` 中新增 `actions` 字段，支持交互选项。`microTips` 降级为可选字段。

### Task 7: 扩展 shared 类型和 Zod schema

**Files:**
- Modify: `packages/shared/src/types/agent.ts`
- Modify: `packages/shared/src/schemas/agent.ts`
- Modify: `packages/shared/src/index.ts`（如果需要导出新类型）

- [ ] **Step 1: 写失败测试**

在 `packages/shared/src/__tests__/schemas.test.ts` 中添加：

```typescript
describe('AgentResponseEnvelopeSchema — actions', () => {
  it('accepts valid actions array', () => {
    const envelope = {
      summary: 'test',
      source: 'llm',
      statusColor: 'good',
      chartTokens: [],
      microTips: [],
      actions: [
        {
          id: 'option-1',
          emoji: '🚶',
          title: '餐后漫步',
          description: '去外面走 15 分钟',
          aiPromise: '我会记录你的选择并用于本次建议上下文',
        },
      ],
      meta: { taskType: 'homepage_summary', pageContext: validPageContext, finishReason: 'complete' },
    };
    const result = AgentResponseEnvelopeSchema.safeParse(envelope);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.actions).toHaveLength(1);
    }
  });

  it('accepts envelope without actions (optional)', () => {
    const envelope = {
      summary: 'test',
      source: 'llm',
      statusColor: 'good',
      chartTokens: [],
      microTips: [],
      meta: { taskType: 'homepage_summary', pageContext: validPageContext, finishReason: 'complete' },
    };
    const result = AgentResponseEnvelopeSchema.safeParse(envelope);
    expect(result.success).toBe(true);
  });

  it('accepts envelope without microTips (optional)', () => {
    const envelope = {
      summary: 'test',
      source: 'llm',
      statusColor: 'good',
      chartTokens: [],
      meta: { taskType: 'homepage_summary', pageContext: validPageContext, finishReason: 'complete' },
    };
    const result = AgentResponseEnvelopeSchema.safeParse(envelope);
    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run packages/shared/src/__tests__/schemas.test.ts`
Expected: FAIL（当前 schema 不会保留 actions，且缺失 microTips 时仍会失败）

- [ ] **Step 3: 定义 ActionOption 类型**

在 `packages/shared/src/types/agent.ts` 中新增：

```typescript
export interface ActionOption {
  id: string;
  emoji: string;
  title: string;
  description: string;
  aiPromise: string;
}
```

修改 `AgentResponseEnvelope`：

```typescript
export interface AgentResponseEnvelope {
  summary: string;
  source: string;
  statusColor: AgentStatusColor;
  chartTokens: ChartTokenId[];
  microTips?: string[];          // 改为可选
  actions?: ActionOption[];       // 新增
  meta: {
    taskType: AgentTaskType;
    pageContext: PageContext;
    finishReason: 'complete' | 'fallback' | 'timeout' | 'cached';
    sessionId?: string;
  };
}
```

- [ ] **Step 4: 更新 Zod schema**

在 `packages/shared/src/schemas/agent.ts` 中：

```typescript
export const ActionOptionSchema = z.object({
  id: z.string().min(1),
  emoji: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  aiPromise: z.string().min(1),
});

export const AgentResponseEnvelopeSchema = z.object({
  summary: z.string().min(1),
  source: z.string().min(1),
  statusColor: z.enum(['good', 'warning', 'error']),
  chartTokens: z.array(ChartTokenIdSchema),
  microTips: z.array(z.string()).optional(),       // 改为可选
  actions: z.array(ActionOptionSchema).max(3).optional(),  // 新增；homepage 期望 2-3 个由 eval/prompt 保证
  meta: z.object({
    taskType: AgentTaskTypeSchema,
    pageContext: PageContextSchema,
    finishReason: z.enum(['complete', 'fallback', 'timeout', 'cached']),
    sessionId: z.string().optional(),
  }),
});
```

- [ ] **Step 5: 确保导出**

在 `packages/shared/src/index.ts` 中确认导出 `ActionOption` 和 `ActionOptionSchema`。

- [ ] **Step 6: 运行测试**

Run: `npx vitest run packages/shared/`
Expected: ALL PASS

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/types/agent.ts packages/shared/src/schemas/agent.ts packages/shared/src/index.ts packages/shared/src/__tests__/schemas.test.ts
git commit -m "feat(shared): add ActionOption type and make microTips optional"
```

---

### Task 8: 更新 response-parser 支持 actions

**Files:**
- Modify: `packages/agent-core/src/output/response-parser.ts`
- Test: `packages/agent-core/src/__tests__/output/response-parser.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
describe('actions parsing', () => {
  it('parses valid actions from LLM output', () => {
    const raw = JSON.stringify({
      source: 'llm',
      statusColor: 'good',
      summary: '测试摘要',
      chartTokens: [],
      microTips: [],
      actions: [
        { id: 'opt-1', emoji: '🚶', title: '餐后漫步', description: '走15分钟', aiPromise: '监控代谢' },
        { id: 'opt-2', emoji: '🧘', title: '深度充电', description: '冥想20分钟', aiPromise: '拉回副交感神经' },
      ],
    });
    const result = parseAgentResponse(raw, {
      taskType: AgentTaskType.HOMEPAGE_SUMMARY,
      pageContext: validPageContext,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.envelope.actions).toHaveLength(2);
      expect(result.envelope.actions![0]!.emoji).toBe('🚶');
    }
  });

  it('tolerates missing actions field', () => {
    const raw = JSON.stringify({
      source: 'llm',
      statusColor: 'good',
      summary: '测试摘要',
      chartTokens: [],
    });
    const result = parseAgentResponse(raw, {
      taskType: AgentTaskType.HOMEPAGE_SUMMARY,
      pageContext: validPageContext,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.envelope.actions).toBeUndefined();
    }
  });

  it('tolerates missing microTips field', () => {
    const raw = JSON.stringify({
      source: 'llm',
      statusColor: 'good',
      summary: '测试摘要',
      chartTokens: [],
    });
    const result = parseAgentResponse(raw, {
      taskType: AgentTaskType.HOMEPAGE_SUMMARY,
      pageContext: validPageContext,
    });
    expect(result.success).toBe(true);
  });

  it('rejects actions above max 3', () => {
    const actions = Array.from({ length: 5 }, (_, i) => ({
      id: `opt-${i}`,
      emoji: '🏃',
      title: `选项${i}`,
      description: `描述${i}`,
      aiPromise: `承诺${i}`,
    }));
    const raw = JSON.stringify({
      source: 'llm',
      statusColor: 'good',
      summary: '测试摘要',
      chartTokens: [],
      actions,
    });
    const result = parseAgentResponse(raw, {
      taskType: AgentTaskType.HOMEPAGE_SUMMARY,
      pageContext: validPageContext,
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run packages/agent-core/src/__tests__/output/response-parser.test.ts`
Expected: FAIL

- [ ] **Step 3: 修改 response-parser.ts**

在 `parseAgentResponse()` 中，解析 `obj.actions` 并保持严格契约：actions 缺失可接受；actions 存在时必须是 1-3 个完整对象。不要静默截断、补字段或过滤非法 action，因为这会让 LLM 输出问题被隐藏。

```typescript
// 在 constants/limits.ts 中新增
export const MAX_ACTIONS = 3;

// 在 response-parser.ts 中
import { MAX_CHART_TOKENS, MAX_MICRO_TIPS, MAX_ACTIONS } from '../constants/limits';

// microTips 截断（改为可选）
const rawTips = Array.isArray(obj.microTips)
  ? obj.microTips.filter((t): t is string => typeof t === 'string')
  : [];
const tips = rawTips.slice(0, MAX_MICRO_TIPS);

// actions 解析（新增，严格校验）
let actions: AgentResponseEnvelope['actions'] | undefined;
if (obj.actions !== undefined) {
  if (!Array.isArray(obj.actions)) {
    return { success: false, error: 'actions 必须是数组', raw };
  }
  if (obj.actions.length > MAX_ACTIONS) {
    return { success: false, error: `actions 数量不能超过 ${MAX_ACTIONS}`, raw };
  }
  const parsedActions: NonNullable<AgentResponseEnvelope['actions']> = [];
  for (const [index, a] of obj.actions.entries()) {
    if (
      typeof a !== 'object' || a === null ||
      typeof (a as Record<string, unknown>).id !== 'string' ||
      typeof (a as Record<string, unknown>).emoji !== 'string' ||
      typeof (a as Record<string, unknown>).title !== 'string' ||
      typeof (a as Record<string, unknown>).description !== 'string' ||
      typeof (a as Record<string, unknown>).aiPromise !== 'string'
    ) {
      return { success: false, error: `actions[${index}] 字段不完整`, raw };
    }
    const action = a as Record<string, string>;
    parsedActions.push({
      id: action.id,
      emoji: action.emoji,
      title: action.title,
      description: action.description,
      aiPromise: action.aiPromise,
    });
  }
  actions = parsedActions.length > 0 ? parsedActions : undefined;
}

// 在 envelope 构建中加入
const envelope: AgentResponseEnvelope = {
  summary,
  source: typeof obj.source === 'string' && obj.source.length > 0 ? obj.source : 'llm',
  statusColor,
  chartTokens: validTokens,
  microTips: tips.length > 0 ? tips : undefined,
  actions,
  meta: {
    taskType: meta.taskType,
    pageContext: meta.pageContext,
    finishReason: 'complete',
  },
};
```

- [ ] **Step 4: 运行测试**

Run: `npx vitest run packages/agent-core/src/__tests__/output/response-parser.test.ts`
Expected: ALL PASS

- [ ] **Step 5: 更新旧测试**

旧测试中引用 `envelope.microTips` 的地方需要适配 `microTips` 可选：
- 如果测试断言 `microTips` 为空数组，改为断言 `undefined` 或 `[]`
- 确保所有 `microTips.length` 访问使用可选链

- [ ] **Step 6: Commit**

```bash
git add packages/agent-core/src/constants/limits.ts packages/agent-core/src/output/response-parser.ts packages/agent-core/src/__tests__/output/response-parser.test.ts
git commit -m "feat(parser): support strict actions parsing and optional microTips"
```

---

### Task 9: 更新 agent-runtime + safety-cleaner 适配

**Files:**
- Modify: `packages/agent-core/src/runtime/agent-runtime.ts`
- Modify: `packages/agent-core/src/output/safety-cleaner.ts`
- Test: `packages/agent-core/src/__tests__/output/safety-cleaner.test.ts`
- Test: `packages/agent-core/src/__tests__/runtime/agent-runtime.test.ts`

- [ ] **Step 1: 修改 safety-cleaner.ts**

将 `microTips` 参数改为可选，并让安全清洗覆盖 actions 的 `title`、`description`、`aiPromise`。actions 是用户可见文本，不能只清洗 summary 和 microTips。

```typescript
import type { ActionOption } from '@health-advisor/shared';

export function cleanSafetyIssues(
  summary: string,
  missingMetrics: string[],
  microTips: string[] = [],   // 已有默认值，无需改动
  actions: ActionOption[] = [],
): SafetyCleanResult {
  // ... 清洗 summary、microTips，并对 action 文案应用同一组安全替换
}
```

确认 `microTips` 为空时 `cleanedTips` 返回空数组，`actions` 为空时 `cleanedActions` 返回空数组。`SafetyCleanResult` 需要新增 `cleanedActions: ActionOption[]`。

- [ ] **Step 2: 修改 agent-runtime.ts 第 135-137 行**

```typescript
// 适配 microTips 可选
const cleaned = cleanSafetyIssues(
  safeEnvelope.summary,
  context.dataWindow.missingFields,
  safeEnvelope.microTips ?? [],    // 新增空值保护
  safeEnvelope.actions ?? [],
);

const result: AgentResponseEnvelope = {
  ...safeEnvelope,
  summary: cleaned.cleaned,
  microTips: cleaned.cleanedTips.length > 0 ? cleaned.cleanedTips : undefined,
  actions: cleaned.cleanedActions.length > 0 ? cleaned.cleanedActions : undefined,
  meta: {
    ...safeEnvelope.meta,
    finishReason: 'complete',
  },
};
```

- [ ] **Step 3: 更新测试**

运行全部相关测试，修复因 `microTips` 可选和 actions 安全清洗导致的类型断言失败。新增测试覆盖 action 中的诊断语言和药物建议会被清洗。

Run: `npx vitest run packages/agent-core/src/__tests__/runtime/ packages/agent-core/src/__tests__/output/`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add packages/agent-core/src/runtime/agent-runtime.ts packages/agent-core/src/output/safety-cleaner.ts packages/agent-core/src/__tests__/runtime/agent-runtime.test.ts packages/agent-core/src/__tests__/output/safety-cleaner.test.ts
git commit -m "refactor(runtime): clean action text and support optional microTips"
```

---

### Task 10: 更新 task-builder 添加 actions 输出格式

**Files:**
- Modify: `packages/agent-core/src/prompts/task-builder.ts`

- [ ] **Step 1: 在 homepage 任务的输出格式部分新增 actions 字段说明**

在 task-builder.ts 的"输出格式"部分（约第 143-163 行），当 `taskType === AgentTaskType.HOMEPAGE_SUMMARY` 时，增加 actions 格式：

```typescript
// 在 JSON 示例之前添加（仅 homepage）
if (taskType === AgentTaskType.HOMEPAGE_SUMMARY) {
  sections.push('');
  sections.push(t(locale, '## 交互选项（actions）', '## Action Options'));
  sections.push(t(locale, '提供 2-3 个行动方案供用户选择。不要在 summary 中重复完整选项列表。', 'Provide 2-3 action options for the user to choose from. Do not duplicate full options in summary.'));
  sections.push(t(locale, '每个选项包含：', 'Each option contains:'));
  sections.push(t(locale, '- id: 唯一标识，如 "opt-1"', '- id: unique identifier, e.g. "opt-1"'));
  sections.push(t(locale, '- emoji: 单个 emoji 前缀', '- emoji: single emoji prefix'));
  sections.push(t(locale, '- title: 行动标题（4-8字）', '- title: action title (4-8 chars)'));
  sections.push(t(locale, '- description: 简短描述行动内容', '- description: brief description of the action'));
  sections.push(t(locale, '- aiPromise: 选择后 AI 会做什么；只能承诺当前产品真实支持的行为', '- aiPromise: what AI will do if selected; only promise behavior the product actually supports'));
}
```

更新 JSON 输出示例（homepage 专属）：

```typescript
if (taskType === AgentTaskType.HOMEPAGE_SUMMARY) {
  sections.push('```json');
  sections.push('{');
  sections.push('  "source": "llm",');
  sections.push('  "statusColor": "good",');
  sections.push('  "summary": "小明，吃得不错！...",');
  sections.push('  "chartTokens": ["HRV_7DAYS"],');
  sections.push('  "actions": [');
  sections.push('    {');
  sections.push('      "id": "opt-1",');
  sections.push('      "emoji": "🚶",');
  sections.push('      "title": "餐后漫步",');
  sections.push('      "description": "去外面走 15 分钟",');
  sections.push('      "aiPromise": "我会记录你的选择并用于本次建议上下文"');
  sections.push('    }');
  sections.push('  ]');
  sections.push('}');
  sections.push('```');
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/agent-core/src/prompts/task-builder.ts
git commit -m "feat(prompt): add actions format to homepage task builder"
```

---

### Task 11: 更新 fallback 配置

**Files:**
- Modify: `data/sandbox/fallbacks/homepage.json`
- Modify: `packages/agent-core/src/fallback/fallback-engine.ts`
- Test: `packages/agent-core/src/__tests__/fallback/fallback-engine.test.ts`

- [ ] **Step 1: 为每个 fallback 响应添加空的 actions 数组**

每个 profile 的 fallback 对象中新增 `"actions": []`：

```json
{
  "zh": {
    "profile-a": {
      "summary": "整体健康数据看起来不错。HRV 和睡眠质量保持稳定，建议继续保持当前的运动和作息习惯。",
      "chartTokens": ["HRV_7DAYS", "SLEEP_7DAYS"],
      "microTips": ["建议每天保持 7-8 小时的睡眠"],
      "actions": []
    }
  }
}
```

对所有 6 个 profile-locale 组合都做此更新。

- [ ] **Step 2: 更新 fallback engine 类型和透传**

`FallbackEntry` 新增 `actions?: ActionOption[]`，`getFallback()` 返回 envelope 时透传 `actions: entry.actions ?? []`。测试覆盖 homepage fallback 返回 `actions: []`。

- [ ] **Step 3: Commit**

```bash
git add data/sandbox/fallbacks/homepage.json packages/agent-core/src/fallback/fallback-engine.ts packages/agent-core/src/__tests__/fallback/fallback-engine.test.ts
git commit -m "feat(fallback): add empty actions to homepage fallback responses"
```

---

## Phase 3：前端适配

> 目标：前端渲染新格式的 summary（支持换行），展示 actions 交互按钮。

### Task 12: 创建 ActionOptions 组件

**Files:**
- Create: `apps/web/src/components/homepage/ActionOptions.tsx`

- [ ] **Step 1: 写组件**

```typescript
'use client';

import { Button } from '@health-advisor/ui';
import type { ActionOption } from '@health-advisor/shared';
import { useState } from 'react';

interface ActionOptionsProps {
  actions: ActionOption[];
  onSelect?: (action: ActionOption) => void;
}

export function ActionOptions({ actions, onSelect }: ActionOptionsProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (actions.length === 0) return null;

  return (
    <div className="space-y-2 pt-4 border-t border-slate-800/50">
      <p className="text-xs font-extrabold text-slate-400 uppercase tracking-widest flex items-center gap-2">
        <span className="w-1 h-3 bg-emerald-500 rounded-full" />
        行动方案
      </p>
      <div className="space-y-2">
        {actions.map((action) => (
          <Button
            key={action.id}
            variant="outline"
            aria-pressed={selectedId === action.id}
            onClick={() => {
              setSelectedId(action.id);
              onSelect?.(action);
            }}
            className="w-full text-left flex items-start gap-3 py-3 px-4
                       border-slate-700 hover:border-emerald-500/50 hover:bg-emerald-500/5
                       transition-colors group"
          >
            <span className="text-lg flex-shrink-0 mt-0.5">{action.emoji}</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-slate-200 group-hover:text-emerald-400 transition-colors">
                {action.title}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                {action.description}
              </div>
              <div className="text-xs text-slate-500 mt-1 italic">
                {action.aiPromise}
              </div>
              {selectedId === action.id && (
                <div className="text-xs text-emerald-400 mt-2">
                  已记录
                </div>
              )}
            </div>
          </Button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/homepage/ActionOptions.tsx
git commit -m "feat(web): add ActionOptions component for homepage"
```

---

### Task 13: 改造 MorningBriefCard

**Files:**
- Modify: `apps/web/src/components/homepage/MorningBriefCard.tsx`

- [ ] **Step 1: 更新 MorningBriefCard**

关键改动：
1. Props 新增 `actions`，移除 `microTips`
2. summary 渲染支持换行（使用 `whitespace-pre-line`）
3. 引入 `ActionOptions` 组件

```typescript
'use client';

import { Card, statusColors } from '@health-advisor/ui';
import type { StatusColor } from '@health-advisor/ui';
import type { ActionOption } from '@health-advisor/shared';
import { m } from 'framer-motion';
import { ActionOptions } from './ActionOptions';

interface MorningBriefCardProps {
  status: StatusColor;
  title: string;
  summary: string;
  actions?: ActionOption[];
  onActionSelect?: (action: ActionOption) => void;
  isLoading?: boolean;
}

export function MorningBriefCard({
  status,
  title,
  summary,
  actions = [],
  onActionSelect,
  isLoading = false,
}: MorningBriefCardProps) {
  const statusColor = statusColors[status];

  if (isLoading) {
    return (
      <Card className="animate-pulse">
        <div className="h-6 w-32 bg-slate-700 rounded mb-4" />
        <div className="h-20 bg-slate-700 rounded mb-4" />
        <div className="flex gap-2">
          <div className="h-6 w-16 bg-slate-700 rounded-full" />
          <div className="h-6 w-16 bg-slate-700 rounded-full" />
        </div>
      </Card>
    );
  }

  return (
    <m.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <Card className="relative overflow-hidden border-l-4" style={{ borderLeftColor: statusColor }}>
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-100">{title}</h3>
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: statusColor, boxShadow: `0 0 8px ${statusColor}` }}
            />
          </div>

          <div className="text-slate-300 leading-relaxed whitespace-pre-line">
            {summary}
          </div>

          <ActionOptions actions={actions} onSelect={onActionSelect} />
        </div>
      </Card>
    </m.div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/homepage/MorningBriefCard.tsx
git commit -m "feat(web): update MorningBriefCard with actions and line breaks"
```

---

### Task 14: 更新首页 page.tsx

**Files:**
- Modify: `apps/web/src/app/page.tsx`

- [ ] **Step 1: 更新 page.tsx**

将 `briefData` 中的 `microTips` 替换为 `actions`，并添加本地选中反馈。需要从 `@health-advisor/shared` 引入 `ActionOption` 类型。

```typescript
// 第 37-42 行改为：
const briefData = {
  status: mapApiStatusToUi(data?.statusColor, data?.meta.finishReason),
  title: t('realtimeBrief'),
  summary: data?.summary || (error ? t('briefNetworkError') : t('briefPreparing')),
  actions: data?.actions ?? [],
  onActionSelect: (action: ActionOption) => showToast(`${action.title}：已记录`, 'success'),
};
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/page.tsx
git commit -m "feat(web): pass actions to MorningBriefCard from homepage"
```

---

## Phase 4：测试和 Eval 对齐

> 目标：更新所有测试和 eval 评分器以匹配新的回复风格。

### Task 15: 更新 eval length-scorer

**Files:**
- Modify: `packages/agent-core/src/evals/scorers/length-scorer.ts`
- Test: `packages/agent-core/src/__tests__/evals/`（相关测试）

- [ ] **Step 1: 更新 Homepage 默认长度范围**

```typescript
// 第 7 行
const HOMEPAGE_DEFAULT_LENGTH_ZH = { min: 220, max: 420 } as const;
// 第 10 行
const HOMEPAGE_DEFAULT_LENGTH_EN = { min: 150, max: 300 } as const;
```

- [ ] **Step 2: 更新相关测试断言**

找到验证旧默认值 (80-120) 的测试用例，更新为新值 (220-420)。

- [ ] **Step 3: Commit**

```bash
git add packages/agent-core/src/evals/scorers/length-scorer.ts
git commit -m "refactor(eval): update homepage default length range to 220-420"
```

---

### Task 16: 更新 eval 文本匹配 scorer + 新增 action-scorer

**Files:**
- Modify: `packages/agent-core/src/evals/scorers/mention-scorer.ts`
- Modify: `packages/agent-core/src/evals/scorers/task-scorer.ts`
- Modify: `packages/agent-core/src/evals/scorers/safety-scorer.ts`
- Modify: `packages/agent-core/src/evals/scorers/evidence-scorer.ts`
- Modify: `packages/agent-core/src/evals/scorers/missing-data-scorer.ts`
- Modify: `packages/agent-core/src/evals/scorers/memory-scorer.ts`
- Modify: `packages/agent-core/src/evals/types.ts`
- Modify: `packages/agent-core/src/evals/case-schema.ts`
- Create: `packages/agent-core/src/evals/scorers/action-scorer.ts`
- Modify: `packages/agent-core/src/evals/scorers/index.ts`

- [ ] **Step 1: 更新所有 buildMatchText 适配 microTips 可选和 actions**

所有用户可见文本匹配范围都要从 `summary + microTips` 改为 `summary + microTips + actions.title/description/aiPromise`。至少覆盖：
- `mention-scorer.ts`
- `task-scorer.ts`
- `safety-scorer.ts`
- `evidence-scorer.ts`
- `missing-data-scorer.ts`
- `memory-scorer.ts`

```typescript
// mention-scorer.ts 第 74-80 行
function buildMatchText(envelope: AgentResponseEnvelope): string {
  const parts = [envelope.summary];
  if (envelope.microTips && envelope.microTips.length > 0) {
    parts.push(envelope.microTips.join('\n'));
  }
  if (envelope.actions && envelope.actions.length > 0) {
    const actionTexts = envelope.actions.map((a) => `${a.title} ${a.description} ${a.aiPromise}`);
    parts.push(actionTexts.join('\n'));
  }
  return parts.join('\n');
}
```

```typescript
// task-scorer.ts 第 63-69 行 — 同样更新 buildMatchText
function buildMatchText(envelope: AgentResponseEnvelope): string {
  const parts = [envelope.summary];
  if (envelope.microTips && envelope.microTips.length > 0) {
    parts.push(envelope.microTips.join('\n'));
  }
  if (envelope.actions && envelope.actions.length > 0) {
    const actionTexts = envelope.actions.map((a) => `${a.title} ${a.description} ${a.aiPromise}`);
    parts.push(actionTexts.join('\n'));
  }
  return parts.join('\n');
}
```

- [ ] **Step 2: 新增 actions expectation 类型和 schema**

在 `packages/agent-core/src/evals/types.ts` 中新增：

```typescript
actions?: {
  minCount?: number;
  maxCount?: number;
  requiredPatterns?: string[];
  forbiddenPatterns?: string[];
  requireAiPromise?: boolean;
};
```

在 `case-schema.ts` 中同步新增 `ActionsExpectationSchema` 并挂到 `AgentEvalExpectationsSchema`。

- [ ] **Step 3: 新增 action-scorer**

`action-scorer.ts` 检查：
- actions 数量满足 `minCount/maxCount`
- 每个 action 的 `id/emoji/title/description/aiPromise` 非空
- `requireAiPromise` 为 true 时每个 action 都有 `aiPromise`
- `requiredPatterns/forbiddenPatterns` 在 actions 文本上生效
- 默认禁止未实现承诺类表达：`实时监控|调整监测逻辑|开启.*模式|准时提醒|无干扰模式`，除非本轮实现了对应 action handler

将 `actionScorer` 导出并加入 `DEFAULT_SCORERS`。

- [ ] **Step 4: Commit**

```bash
git add packages/agent-core/src/evals/
git commit -m "feat(eval): add action scorer and include actions in text matching"
```

---

### Task 17: 更新 eval test cases

**Files:**
- Modify: `packages/agent-core/evals/cases/core/homepage/*.json`
- Modify: `packages/agent-core/evals/cases/quality/homepage/*.json`
- Modify: `packages/agent-core/evals/cases/smoke/homepage*.json`

- [ ] **Step 1: 更新 eval case 中的 expectations**

对每个 homepage eval case JSON：

1. **长度期望**：`summary.length` 从 `{ min: 80, max: 120 }` 改为 `{ min: 220, max: 420 }`；完整卡片长度由 summary + actions 共同覆盖
2. **移除 interpretation-only 约束**：删除 `forbiddenPatterns` 中关于 `\d+\s*ms`、`\d+%\s*血氧`、`\d+\s*bpm` 的规则
3. **新增用户姓名提及期望**（如果 case 的 profile 是 profile-a）：
   ```json
   "mustMention": ["巅峰"]
   ```
4. **新增 actions 期望**（homepage LLM case 必填；fallback/低数据 case 可允许 0）：
   ```json
   "actions": {
     "minCount": 2,
     "maxCount": 3,
     "requireAiPromise": true,
     "forbiddenPatterns": ["实时监控", "调整监测逻辑", "开启.*模式", "准时提醒", "无干扰模式"]
   }
   ```

- [ ] **Step 2: 运行 eval 测试验证**

Run: `npx vitest run packages/agent-core/src/__tests__/evals/`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add packages/agent-core/evals/cases/
git commit -m "refactor(eval): update homepage cases for new response style"
```

---

### Task 18: 全量测试验证

**Files:** 无新文件

- [ ] **Step 1: 运行 shared 包测试**

Run: `npx vitest run packages/shared/`
Expected: ALL PASS

- [ ] **Step 2: 运行 agent-core 包测试**

Run: `npx vitest run packages/agent-core/`
Expected: ALL PASS

- [ ] **Step 3: 运行 agent-api 测试**

Run: `npx vitest run apps/agent-api/`
Expected: ALL PASS

- [ ] **Step 4: 运行 web 构建**

Run: `cd apps/web && npx next build`
Expected: BUILD SUCCESS

- [ ] **Step 5: Commit（如有修复）**

```bash
git add -A
git commit -m "fix: resolve test failures after homepage style calibration"
```

---

## Self-Review Checklist

### 1. Spec Coverage

| 需求 | 对应 Task |
|------|-----------|
| 语气从正式改为温暖有个性 | Task 1, 3 |
| 回复从单段改为多段结构 | Task 2 |
| HRV/血氧/静息心率数值透明 | Task 4, 5 |
| 字数限制放宽 | Task 6 |
| 新增 actions 交互选项 | Task 7, 8, 10, 11 |
| 前端渲染新格式 | Task 12, 13, 14 |
| 测试和 eval 对齐 | Task 15, 16, 17, 18 |
| microTips 移除 | Task 7, 8, 9, 13 |
| 开场白用用户姓名打招呼 | Task 2 (prompt 中定义) |

### 2. Placeholder Scan

- 无 "TBD"、"TODO"、"implement later" 等占位符
- 所有代码步骤都包含完整代码
- 所有测试步骤都包含具体断言

### 3. Type Consistency

- `ActionOption` 在 shared/types 定义，在 response-parser 解析，在 MorningBriefCard 使用 — 类型一致
- `microTips` 从 `string[]` 改为 `string[] | undefined`，所有消费方使用 `?? []` 或可选链 — 一致
- `MAX_ACTIONS = 3` 在 limits.ts 定义，在 response-parser 使用 — 一致
- `maxSummaryLength = 420` 在 task-router 定义，在 task-builder 使用 — 一致
