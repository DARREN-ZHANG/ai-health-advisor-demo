# Agent Eval 质量基线硬化实施计划

> **For agentic workers:** 本计划用于修正当前 Core Eval 100 分但无法指导 Agent 优化的问题。按 task 顺序实施，每个 task 完成后运行对应验证命令，并使用 conventional commit 提交。

**Goal:** 把现有 eval 从“fixture 输出能通过 scorer 的框架自检”升级为“真实 Agent 输出可被 deterministic rules 评估的质量基线”。

**Background:** 当前 `baseline-v1-single-call-agent` 使用 `providerMode=fake`，并且大量 case 通过 `modelFixture.content` 预置了正确答案。它可以证明 runner/scorers/case schema 工作正常，但不能证明当前 Agent 建议质量优秀，也不能指导 Evidence Packet、Context Builder、Task Parser 等后续优化。

**Architecture:** 保留 fake fixture 评测作为 framework sanity；新增或重构 quality baseline 路径，强制真实 provider、真实 sandbox、真实 prompts/fallbacks、无 fixture answer，并输出可用于优化决策的 report。

---

## 交付范围

### 必须交付

- [ ] 明确区分 `framework sanity baseline` 与 `agent quality baseline`。
- [ ] 修正 eval runner 默认 `dataDir`，确保从 repo 根加载 `data/sandbox`。
- [ ] 真实 provider 模式必须实际调用 provider，缺少 env 时 fail loudly。
- [ ] fallback eval 必须使用真实 `data/sandbox/fallbacks`。
- [ ] report 必须保留 case category breakdown。
- [ ] 新增可运行的真实质量评测命令。
- [ ] 新增 quality cases 或 quality mode，禁止预置 `modelFixture.content` 答案。
- [ ] 更新 baseline runbook，避免把 fake fixture 100 分解释为 Agent 质量基线。

### 不交付

- 不引入 LLM-as-judge。
- 不做向量库或知识库。
- 不改变生产 Agent 行为。
- 不把真实 provider eval 放入默认 CI。

---

## 核心原则

1. **Fake fixture eval 只验证框架。**
   它可以是 100 分，但不能命名为 Agent quality baseline。

2. **Quality eval 必须让 Agent 自己生成。**
   Quality case 不允许通过 `modelFixture.content` 写标准答案。

3. **真实质量基线必须使用真实项目资产。**
   包括 `data/sandbox`、`data/sandbox/prompts`、`data/sandbox/fallbacks`。

4. **真实 provider 模式必须真实。**
   如果 `--provider real` 最终仍使用 fake model，runner 必须失败，而不是生成误导性报告。

5. **Deterministic scorer 继续做硬判定。**
   不引入 LLM-as-judge；真实输出仍由现有 protocol/evidence/missing-data/safety/task scorers 判断。

---

## 推荐最终命令

Framework sanity：

```bash
pnpm --filter @health-advisor/agent-core eval:agent:smoke
pnpm --filter @health-advisor/agent-core eval:agent:core:fixture
```

Agent quality baseline：

```bash
pnpm --filter @health-advisor/agent-core eval:agent:quality \
  --provider real \
  --output packages/agent-core/evals/reports/baseline-v1-real-single-call-agent
```

Quality regression：

```bash
pnpm --filter @health-advisor/agent-core eval:agent:quality \
  --provider real \
  --baseline-report packages/agent-core/evals/reports/baseline-v1-real-single-call-agent/eval-report.json \
  --fail-on-score-regression 2
```

---

## Task 1: 更正术语与脚本命名

**Files:**

- Modify: `packages/agent-core/package.json`
- Modify: `packages/agent-core/evals/README.md`
- Modify: `docs/ops/agent-eval-baseline-runbook.md`

### Step 1: 区分 fixture core 与 quality core

现有 `eval:agent:core` 如果仍加载大量 `modelFixture.content`，应重命名为 fixture/sanity 用途。

建议 scripts：

```json
{
  "eval:agent:smoke": "tsx src/evals/eval-runner.ts --suite smoke --provider fake --report both --fail-on-hard",
  "eval:agent:core:fixture": "tsx src/evals/eval-runner.ts --suite core --provider fake --report both",
  "eval:agent:quality": "tsx src/evals/eval-runner.ts --suite quality --provider real --report both --disallow-fixtures",
  "eval:agent:regression": "tsx src/evals/eval-runner.ts --suite regression --provider fake --report both",
  "eval:agent:case": "tsx src/evals/eval-runner.ts --provider fake --report both --case"
}
```

如果暂时不新增 `quality` suite，也可以使用 `--case-tag quality`。但不要让 `eval:agent:quality` 跑带 fixture answer 的 case。

### Step 2: 更新文档命名

把当前 fake baseline 明确命名为：

```text
framework-sanity-baseline-v1
```

真实 Agent 质量基线命名为：

```text
baseline-v1-real-single-call-agent
```

### Step 3: 验证

Run:

```bash
pnpm --filter @health-advisor/agent-core eval:agent:smoke
pnpm --filter @health-advisor/agent-core eval:agent:core:fixture
```

### Step 4: Commit

```bash
git add packages/agent-core/package.json packages/agent-core/evals/README.md docs/ops/agent-eval-baseline-runbook.md
git commit -m "chore(agent): distinguish fixture and quality eval scripts"
```

---

## Task 2: 修正 eval runner 默认数据目录

**Files:**

- Modify: `packages/agent-core/src/evals/eval-runner.ts`
- Modify: `packages/agent-core/src/__tests__/evals/eval-runner.test.ts`

### Step 1: 默认 dataDir 必须指向 repo 根的 `data/sandbox`

当通过 `pnpm --filter @health-advisor/agent-core ...` 运行时，cwd 通常是 `packages/agent-core`。不能用 `process.cwd()/data/sandbox`。

推荐实现：

```ts
const packageRoot = resolve(__dirname, '../..');
const repoRoot = resolve(packageRoot, '../..');
const dataDir = options?.dataDir ?? resolve(repoRoot, 'data', 'sandbox');
```

### Step 2: dataDir 不存在时 fail loudly

不要静默改用 mock profiles/prompts/timeline。对于 runner 默认路径：

- 如果 `dataDir` 不存在，返回 exit code 1。
- 错误信息包含实际解析出的路径。

只有单元测试显式传入 mock dataDir 或 mock runtime 时，才允许 mock。

### Step 3: 测试

覆盖：

- package cwd 下默认解析到 repo root `data/sandbox`。
- dataDir 不存在时 runner 失败。
- 成功路径的 artifacts context 使用真实 profile 名称，而不是 `测试用户`。

### Step 4: Commit

```bash
git add packages/agent-core/src/evals/eval-runner.ts packages/agent-core/src/__tests__/evals/eval-runner.test.ts
git commit -m "fix(agent): resolve eval data dir from repo root"
```

---

## Task 3: 禁止 eval runtime 静默使用 mock assets

**Files:**

- Modify: `packages/agent-core/src/evals/eval-runtime.ts`
- Modify: `packages/agent-core/src/__tests__/evals/eval-runner.test.ts`

### Step 1: 区分 strict 与 test mode

新增 runtime option：

```ts
export interface CreateEvalRuntimeOptions {
  evalCase: AgentEvalCase;
  dataDir?: string;
  providerMode: EvalProviderMode;
  strictAssets?: boolean;
}
```

runner 默认传：

```ts
strictAssets: true
```

单元测试可以传 `strictAssets: false`。

### Step 2: strictAssets 行为

当 `strictAssets=true`：

- `loadAllProfiles(dataDir)` 失败必须 throw。
- `createPromptLoader(..., dataDir/prompts)` 失败必须 throw。
- `createFallbackEngine(..., dataDir/fallbacks)` 失败必须 throw。
- timeline setup 失败必须 throw。

当 `strictAssets=false`：

- 可以继续使用 minimal mock assets，供单元测试使用。

### Step 3: 验证

Run:

```bash
pnpm --filter @health-advisor/agent-core test -- --run src/__tests__/evals/eval-runner.test.ts
pnpm --filter @health-advisor/agent-core eval:agent:smoke
```

### Step 4: Commit

```bash
git add packages/agent-core/src/evals/eval-runtime.ts packages/agent-core/src/__tests__/evals/eval-runner.test.ts
git commit -m "fix(agent): fail eval runtime on missing real assets"
```

---

## Task 4: 真实 provider 模式必须真实或失败

**Files:**

- Modify: `packages/agent-core/src/evals/eval-runtime.ts`
- Modify: `packages/agent-core/src/evals/eval-runner.ts`
- Modify: `packages/agent-core/src/__tests__/evals/eval-runner.test.ts`

### Step 1: 接入现有 provider factory

`--provider real` 必须使用：

- `resolveProviderConfig(process.env)`
- `createChatModel(resolvedConfig)`
- `createHealthAgent({ chatModel })`

不得返回 `FakeChatModel`。

### Step 2: 缺少环境变量时失败

如果 provider 需要 API key 但 `LLM_API_KEY` 缺失：

- runner 返回 exit code 1。
- 报错必须说明使用 `--provider fake` 或配置 `LLM_API_KEY`。

### Step 3: Report 必须标明 provider

在 report metadata 中加入：

```ts
providerMode: 'fake' | 'real';
provider?: string;
model?: string;
```

### Step 4: 测试

覆盖：

- `--provider real` 且无 `LLM_API_KEY` 时失败。
- `--provider fake` 不需要 API key。
- real 模式不实例化 `FakeChatModel`。

### Step 5: Commit

```bash
git add packages/agent-core/src/evals/eval-runtime.ts packages/agent-core/src/evals/eval-runner.ts packages/agent-core/src/__tests__/evals/eval-runner.test.ts
git commit -m "fix(agent): make real eval provider call actual model"
```

---

## Task 5: Quality case 禁止使用 fixture answer

**Files:**

- Modify: `packages/agent-core/src/evals/types.ts`
- Modify: `packages/agent-core/src/evals/case-schema.ts`
- Modify: `packages/agent-core/src/evals/eval-runner.ts`
- Add/Modify: `packages/agent-core/evals/cases/quality/**/*.json`
- Modify: `packages/agent-core/src/__tests__/evals/case-schema.test.ts`

### Step 1: 新增 suite

把 suite 扩展为：

```ts
export type EvalSuite = 'smoke' | 'core' | 'quality' | 'regression';
```

### Step 2: 新增 fixture policy

Runner 支持：

```text
--disallow-fixtures
```

当开启时：

- 如果 case 存在 `setup.modelFixture.content`，直接失败。
- 如果 case 存在 `setup.modelFixture.mode` 且不是显式允许的 provider-independent failure case，也失败。

Quality suite 默认等同于 `--disallow-fixtures`。

### Step 3: 新增 quality case 目录

目标结构：

```text
packages/agent-core/evals/cases/quality/
├── homepage/
├── view-summary/
├── advisor-chat/
└── cross-cutting/
```

Quality case 不写 `modelFixture.content`。它们只写：

- setup profile / memory / overrides / timeline
- request
- deterministic expectations

### Step 4: 首批 quality cases

先从 15-20 个 P0 case 开始，不要一口气迁移全部 fixture cases。

建议首批：

- homepage normal
- homepage sleep poor cardio
- homepage hrv decline
- homepage spo2 low
- homepage missing sleep
- view overview normal
- view hrv drop
- view sleep missing
- view activity low
- view missing tab
- chat today status
- chat yesterday sleep
- chat can I run today
- chat medication refusal
- chat diagnosis refusal
- chat missing metric
- chat visible sleep chart
- chat profile switch no leak

### Step 5: 验证

Run:

```bash
pnpm --filter @health-advisor/agent-core eval:agent:quality --provider real
```

Expected:

- 没有 fixture answer 被使用。
- 输出分数不要求 100。
- report 能暴露失败方向。

### Step 6: Commit

```bash
git add packages/agent-core/src/evals packages/agent-core/evals/cases/quality
git commit -m "feat(agent): add real-output quality eval suite"
```

---

## Task 6: 使用真实 fallback assets

**Files:**

- Modify: `packages/agent-core/src/evals/eval-runtime.ts`
- Add/Modify: `packages/agent-core/src/__tests__/evals/eval-runner.test.ts`

### Step 1: dataDir 存在时加载真实 fallback

`createFallbackEngineForEval(dataDir)` 必须使用：

```text
dataDir/fallbacks/homepage.json
dataDir/fallbacks/view-summary.json
dataDir/fallbacks/advisor-chat.json
```

如果任何文件缺失或 JSON 无效，strict mode 下失败。

### Step 2: 增加 fallback asset case

新增至少一个 case 验证：

- invalid JSON 触发 fallback。
- fallback 内容来自真实 asset，而不是 generic fallback。
- chartTokens 仍经过白名单。

### Step 3: Commit

```bash
git add packages/agent-core/src/evals/eval-runtime.ts packages/agent-core/src/__tests__/evals/eval-runner.test.ts packages/agent-core/evals/cases/core/cross-cutting
git commit -m "fix(agent): use real fallback assets in eval runtime"
```

---

## Task 7: 保留 case category 生成分域报告

**Files:**

- Modify: `packages/agent-core/src/evals/types.ts`
- Modify: `packages/agent-core/src/evals/eval-runner.ts`
- Modify: `packages/agent-core/src/evals/report-writer.ts`
- Modify: `packages/agent-core/src/__tests__/evals/eval-runner.test.ts`

### Step 1: EvalCaseResult 保留 category

修改类型：

```ts
export interface EvalCaseResult {
  caseId: string;
  category: EvalCategory;
  ...
}
```

### Step 2: runSingleCase 写入 category

```ts
return {
  caseId: evalCase.id,
  category: evalCase.category,
  ...
};
```

### Step 3: aggregateReport 使用 result.category

不要硬编码 `uncategorized`。

### Step 4: Markdown report 显示分域表现

报告必须包含：

```text
homepage: cases / passed / failed / score
view-summary: ...
advisor-chat: ...
cross-cutting: ...
```

### Step 5: 测试

覆盖：

- 混合 category case 的 report.byCategory 正确。
- markdown report 包含 category breakdown。

### Step 6: Commit

```bash
git add packages/agent-core/src/evals/types.ts packages/agent-core/src/evals/eval-runner.ts packages/agent-core/src/evals/report-writer.ts packages/agent-core/src/__tests__/evals/eval-runner.test.ts
git commit -m "fix(agent): preserve eval case categories in reports"
```

---

## Task 8: 更新 Baseline Runbook

**Files:**

- Modify: `docs/ops/agent-eval-baseline-runbook.md`
- Modify: `packages/agent-core/evals/README.md`

### Step 1: 明确两个 baseline

Runbook 必须说明：

```text
framework-sanity-baseline-v1:
  provider=fake
  fixture output allowed
  purpose=验证 eval 框架

baseline-v1-real-single-call-agent:
  provider=real
  fixture output forbidden
  purpose=评估当前 Agent 真实建议质量
```

### Step 2: 修改第一次建立 baseline 流程

不要再建议用 fake `eval:agent:core` 作为 Agent quality baseline。

改为：

```bash
pnpm --filter @health-advisor/agent-core eval:agent:quality \
  --provider real \
  --output packages/agent-core/evals/reports/baseline-v1-real-single-call-agent
```

### Step 3: 增加 100 分解释

写明：

- fake fixture 100 分是正常的框架自检结果。
- 不代表 Agent 已经优秀。
- 真实质量 baseline 只有在 real provider + no fixture 下才有优化指导意义。

### Step 4: Commit

```bash
git add docs/ops/agent-eval-baseline-runbook.md packages/agent-core/evals/README.md
git commit -m "docs(agent): clarify real quality baseline workflow"
```

---

## Task 9: 生成新的真实质量 baseline

**Files:**

- Generated locally only: `packages/agent-core/evals/reports/baseline-v1-real-single-call-agent/`

### Step 1: 配置 provider

示例：

```bash
export LLM_PROVIDER=openai
export LLM_MODEL=<your-model>
export LLM_API_KEY=<your-key>
```

### Step 2: 运行 quality eval

```bash
pnpm --filter @health-advisor/agent-core eval:agent:quality \
  --provider real \
  --output packages/agent-core/evals/reports/baseline-v1-real-single-call-agent
```

### Step 3: 人工 review

重点看：

- hard failures
- P0 failures
- category breakdown
- evidence / missing-data / safety / memory / task-specific failures

### Step 4: 输出 baseline review

建议新增：

```text
docs/review/agent-quality-baseline-v1.md
```

内容：

- 总分与分域分数。
- Top failures。
- 哪些是 case 过严。
- 哪些是 Agent 能力缺口。
- 下一轮优化建议。

### Step 5: Commit

不要提交完整 report artifacts，除非团队决定归档。

```bash
git add docs/review/agent-quality-baseline-v1.md
git commit -m "docs(agent): record real quality baseline findings"
```

---

## 最终验收

工程师完成后应满足：

- `eval:agent:smoke` 继续用于 CI。
- fake fixture 的 core eval 不再被称为 Agent quality baseline。
- `eval:agent:quality --provider real` 实际调用 LLM provider。
- quality cases 不包含预置标准答案。
- runner 默认使用真实 `data/sandbox`。
- fallback eval 使用真实 fallback assets。
- report byCategory 能显示 homepage/view-summary/advisor-chat/cross-cutting。
- 新生成的 `baseline-v1-real-single-call-agent` 分数可以暴露优化方向，而不是固定 100。

---

## 推荐实施顺序

1. Task 1：术语和脚本先改，避免继续误用 100 分 baseline。
2. Task 2-4：修 runner/runtime 真实性。
3. Task 5：新增真实 quality suite。
4. Task 6-7：补 fallback 和 report 分域。
5. Task 8：更新 runbook。
6. Task 9：跑真实 baseline 并形成 review。

完成这组工作后，下一步才进入 Agent 质量优化本身：Evidence Packet、Context Builder、Task Parser、Verifier。
