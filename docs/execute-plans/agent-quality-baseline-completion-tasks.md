# Agent 真实质量基线剩余工作执行任务

本文档面向初级工程师，用于完成 `docs/detailed-tech-design/agent-optimization-guidelines.md` 中 **4.1 第一优先级：真实质量基线** 剩余约 25% 工作。

当前结论：eval 框架已基本就绪，但还缺少真实 provider baseline 运行结果、失败分布分析，以及 real provider 缺少环境变量时的显式失败门禁。

## 0. 执行原则

- 不要把 `fake provider + modelFixture.content` 的结果当作 Agent 真实质量基线。
- 不要为了让报告变绿而修改 scorer、case expectation、prompt 或输出后处理。
- 不要提交 `packages/agent-core/evals/reports/` 下的大量运行报告；该目录默认是本地 artifact。
- 如果工作区已有与本任务无关的改动，保持原样，不要回滚。
- 每完成一个独立任务后提交一次 conventional commit。

## 1. 目标交付物

最终应交付：

- runner 在 `--provider real` 且缺少 `LLM_API_KEY` 时以非 0 exit code 失败。
- `packages/agent-core/evals/reports/baseline-v1-real-single-call-agent/eval-report.json` 在本地生成。
- `packages/agent-core/evals/reports/baseline-v1-real-single-call-agent/eval-report.md` 在本地生成。
- `docs/review/agent-quality-baseline-v1.md` 记录真实 baseline 失败分布和下一步优化建议。
- 文档中所有 fake baseline 命名都明确为 `framework-sanity-baseline-v1`，不会和真实质量 baseline 混淆。

## 2. 前置检查

先确认当前分支和工作区状态：

```bash
git status --short
git branch --show-current
```

确认 quality suite case 数量和 fixture 状态：

```bash
find packages/agent-core/evals/cases/quality -name '*.json' | wc -l
rg -n '"content"\s*:' packages/agent-core/evals/cases/quality
```

验收标准：

- quality case 数量应为 18。
- 第二条命令不应输出 `modelFixture.content`。

## 3. 任务 A：硬化 real provider 缺 key 的失败行为

### 背景

当前 `eval:agent:quality` 使用 `--provider real`，但缺少 `LLM_API_KEY` 时，runner 可能把每个 case 记为失败并继续生成报告，最终 exit code 仍可能是 0。真实质量 baseline 不能在 provider 未配置时静默产出失败报告。

### 修改范围

优先修改：

- `packages/agent-core/src/evals/eval-runner.ts`
- `packages/agent-core/src/__tests__/evals/eval-runner.test.ts`

如需抽取小函数，也应保持在 eval runner 附近，不要引入新的全局配置层。

### 实现要求

在 `runEval()` 开始执行 case 前增加 real provider 预检：

- 当 `args.provider === 'real'` 时读取 `resolveProviderConfig(process.env)`。
- 如果 `config.apiKey.trim()` 为空：
  - 输出清晰错误信息，包含 `LLM_API_KEY` 和 `--provider real`。
  - 直接返回 exit code `1`。
  - 不执行任何 case。
  - 不写 eval report。
- `--provider fake` 不需要 API key，行为保持不变。
- 不要在 `createEvalRuntime()` 的 per-case fallback 上承担这个职责；缺少 key 是运行前配置错误，不是单个 case 的质量失败。

建议错误文案：

```text
错误: --provider real 需要配置 LLM_API_KEY。请设置 LLM_API_KEY 后重试，或改用 --provider fake。
```

### 测试要求

更新或新增测试覆盖：

- `--provider fake` 缺少 `LLM_API_KEY` 仍可运行。
- `--provider real` 缺少 `LLM_API_KEY` 返回 `1`。
- `--provider real` 缺少 `LLM_API_KEY` 时不生成 `eval-report.json`。
- `--provider real` 缺少 `LLM_API_KEY` 时不会执行 case；可通过临时输出目录为空或没有报告文件验证。

运行：

```bash
pnpm --filter @health-advisor/agent-core test -- src/__tests__/evals/eval-runner.test.ts src/__tests__/evals/case-schema.test.ts
```

验收标准：

- 测试通过。
- 手动运行以下命令时 exit code 为 1，且不会生成新报告：

```bash
pnpm --filter @health-advisor/agent-core eval:agent:quality \
  --output packages/agent-core/evals/reports/_missing-key-check
```

提交：

```bash
git add packages/agent-core/src/evals/eval-runner.ts packages/agent-core/src/__tests__/evals/eval-runner.test.ts
git commit -m "fix(agent-core): fail quality eval without real provider key"
```

## 4. 任务 B：消除 fake baseline 命名歧义

### 背景

本地存在旧目录 `packages/agent-core/evals/reports/baseline-v1-single-call-agent`。该名称容易被误解为真实 Agent baseline；如果它来自 fake provider，只能作为 framework sanity baseline。

### 执行步骤

先确认目录是否被 git 跟踪：

```bash
git ls-files packages/agent-core/evals/reports
```

如果只看到 `.gitignore`，说明报告目录是本地 artifact，不需要提交报告内容。

如需保留旧 fake 报告，在本地重命名：

```bash
mv packages/agent-core/evals/reports/baseline-v1-single-call-agent \
  packages/agent-core/evals/reports/framework-sanity-baseline-v1
```

如果 `framework-sanity-baseline-v1` 已存在，先人工确认两个目录内容，不要覆盖。

检查文档中是否还存在误导性命名：

```bash
rg -n "baseline-v1-single-call-agent|framework-sanity-baseline-v1|baseline-v1-real-single-call-agent" docs packages/agent-core/evals/README.md
```

如发现文档把 fake fixture 结果称为 Agent quality baseline，改为 framework sanity baseline。

验收标准：

- 文档中 `baseline-v1-single-call-agent` 不再作为推荐 baseline 名称出现。
- fake provider 的推荐名称只使用 `framework-sanity-baseline-v1`。
- real provider 的推荐名称只使用 `baseline-v1-real-single-call-agent`。

提交：

```bash
git add docs packages/agent-core/evals/README.md
git commit -m "docs(agent): clarify eval baseline naming"
```

如果没有文档改动，不需要为本地 artifact 重命名单独提交。

## 5. 任务 C：运行真实质量 baseline

### 前置环境

需要有效真实 provider 配置。不要把密钥写进仓库或 shell history 中可复用的脚本文件。

必须配置：

```bash
export LLM_API_KEY="..."
```

可选配置：

```bash
export LLM_PROVIDER="openai"
export LLM_MODEL="gpt-4o-mini"
export LLM_TIMEOUT_MS="6000"
export LLM_TEMPERATURE="0"
```

先做环境检查：

```bash
test -n "$LLM_API_KEY"
```

运行真实 baseline：

```bash
pnpm --filter @health-advisor/agent-core eval:agent:quality \
  --provider real \
  --output packages/agent-core/evals/reports/baseline-v1-real-single-call-agent
```

验收标准：

- 命令完成后生成：
  - `packages/agent-core/evals/reports/baseline-v1-real-single-call-agent/eval-report.json`
  - `packages/agent-core/evals/reports/baseline-v1-real-single-call-agent/eval-report.md`
- `eval-report.json` 中：
  - `suite` 为 `quality`
  - `providerMode` 为 `real`
  - `totals.cases` 为 18
  - `byCategory` 存在并包含 category breakdown
  - `provider` 和 `model` 字段存在
- 如果出现 provider 侧限流或网络错误，不要修改 case 或 scorer；记录失败原因后重跑一次。若重跑仍失败，写入失败分析文档。

检查命令：

```bash
node -e "const r=require('./packages/agent-core/evals/reports/baseline-v1-real-single-call-agent/eval-report.json'); console.log({suite:r.suite, providerMode:r.providerMode, cases:r.totals.cases, provider:r.provider, model:r.model, categories:Object.keys(r.byCategory)})"
```

注意：报告目录默认不提交。如团队要求长期归档，应作为 release artifact 或通过团队约定位置保存。

## 6. 任务 D：编写真实 baseline 失败分析

### 新增文档

创建：

```text
docs/review/agent-quality-baseline-v1.md
```

### 文档必须包含

1. 运行元数据
   - 执行日期
   - git SHA
   - suite
   - provider / model
   - report 本地路径

2. 总览
   - cases 数量
   - passed / failed
   - hard failures
   - score 百分比

3. Category breakdown
   - 逐 category 列出 cases、passed、failed、score。

4. Hard failures
   - 每个失败 case 的 `caseId`
   - 失败的 hard check
   - 简短说明

5. Scorer 失败分布
   - 按 scorer 类型聚合失败次数，例如 protocol、evidence、missing-data、safety、memory、task。
   - 不要只贴报告原文，要归纳失败集中点。

6. P0 / P1 优先级
   - P0：安全、缺失数据编造、profile memory 污染、协议错误、主路径不可用。
   - P1：证据不足、建议泛泛、任务理解偏差、局部 category 退化。

7. 下一步优化判断
   - 明确第一批应优化 prompt、context contract、memory、knowledge、tools、ReAct 或 reflection 中的哪一类。
   - 每个判断必须引用 baseline 中的失败样本或 scorer 分布。

### 建议模板

```markdown
# Agent Quality Baseline v1 Review

## Run Metadata

- Date:
- Git SHA:
- Suite: quality
- Provider:
- Model:
- Report:

## Summary

| Metric | Value |
|--------|-------|
| Cases | |
| Passed | |
| Failed | |
| Hard Failures | |
| Score | |

## Category Breakdown

| Category | Cases | Passed | Failed | Score |
|----------|-------|--------|--------|-------|

## Hard Failures

| Case | Failed Check | Why It Matters | Priority |
|------|--------------|----------------|----------|

## Scorer Failure Distribution

| Scorer | Failed Checks | Main Pattern |
|--------|---------------|--------------|

## Optimization Priorities

| Priority | Area | Evidence From Baseline | Proposed Next Work |
|----------|------|------------------------|--------------------|

## Residual Risks

- 
```

验收标准：

- 文档能让未参与运行的人判断当前 Agent 主要失败在哪里。
- 每个优化建议都能追溯到真实 report 中的 case 或 scorer。
- 不把 fake provider 报告作为质量证据。

提交：

```bash
git add docs/review/agent-quality-baseline-v1.md
git commit -m "docs(agent): review quality baseline v1 failures"
```

## 7. 任务 E：验证 baseline comparison 和 regression gate

在真实 baseline 生成后，验证 score regression gate 能读取 baseline：

```bash
pnpm --filter @health-advisor/agent-core eval:agent:quality \
  --baseline-report packages/agent-core/evals/reports/baseline-v1-real-single-call-agent/eval-report.json \
  --fail-on-score-regression 2
```

验收标准：

- 命令能读取 baseline report。
- 输出包含 score comparison 信息。
- 如果当前分数相对 baseline 下降超过 2 个百分点，命令 exit code 为 1。
- 如果 provider 或网络失败，不把结果解释为模型质量退化，应记录为运行环境问题。

## 8. 最终检查清单

完成后运行：

```bash
pnpm --filter @health-advisor/agent-core test -- src/__tests__/evals/eval-runner.test.ts src/__tests__/evals/case-schema.test.ts
pnpm --filter @health-advisor/agent-core eval:agent:smoke
```

检查：

```bash
git status --short
rg -n "baseline-v1-single-call-agent" docs packages/agent-core/evals/README.md
test -f packages/agent-core/evals/reports/baseline-v1-real-single-call-agent/eval-report.json
test -f docs/review/agent-quality-baseline-v1.md
```

最终验收：

- `eval-runner.test.ts` 和 `case-schema.test.ts` 通过。
- smoke eval 通过。
- 缺少 `LLM_API_KEY` 时 real provider eval fail loudly。
- 真实 provider baseline 已在本地生成。
- baseline review 文档已提交。
- fake baseline 命名不再误导。

建议最终提交信息：

```bash
git commit -m "docs(agent): complete quality baseline execution guide"
```

如果前面已按任务分别提交，最终不需要额外空提交。
