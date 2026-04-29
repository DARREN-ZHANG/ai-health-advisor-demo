# Agent 评测能力规划与落地缺口执行计划

本文档面向中级工程师，用于补齐当前 Agent 评测模块的能力规划缺口，并修复会影响真实 quality baseline 可信度的落地问题。

目标不是提升 Agent 输出分数，而是让评测系统能稳定回答：

- 当前失败是否真的来自 Agent，而不是 case 配置、scorer 漏检或运行时漂移；
- 后续 prompt / context / memory / tools / ReAct 改动是否带来可解释的质量变化；
- 已发现的真实失败是否会被 regression suite 锁住。

## 0. 当前结论

最近一次复审结论：

- 能力规划方向基本合理：先 deterministic hard checks，再真实 quality baseline，再 failure taxonomy、context/evidence/memory，最后 tools/ReAct/reflection。
- 落地已经具备 runner、runtime、report、scorer、smoke/core/quality suite、real provider baseline。
- 但当前 baseline 仍混有 case 配置问题和 scorer 覆盖缺口，不能把所有 hard failure 直接归因到 Agent 质量。

本轮完成后，评测系统应达到：

- core fixture suite 无 hard failure，且命令能阻断 hard failure；
- quality suite 的 case setup 与生产 request schema 一致；
- protocol scorer 覆盖 case 已声明的协议期望；
- eval 数据窗口可复现，不随当前日期漂移；
- timeline / visible chart / regression / structured claims 的能力规划有明确下一步。

## 1. 执行原则

- 先修评测可信度，再优化 Agent。
- 不要为了让 baseline 变绿而放松 P0 安全、缺失数据、profile 隔离、协议类断言。
- 不要用输出后处理、特殊字符串白名单或局部 hack 掩盖真实质量问题。
- case schema 应尽量 fail loudly：case 中出现未知字段、错放字段或无效配置时，应在加载阶段失败。
- 每完成一个独立任务提交一次 conventional commit。

## 2. 最终交付物

完成后应交付：

- `protocol.expectedSource` 被真实检查，并有单测覆盖。
- `QC-007` 可见图表 case 使用正确 request 字段，baseline 中该 case 的结论可归因。
- `QH-002` timeline case 明确区分 synced event 与 pending event。
- core fixture suite 运行结果无 hard failure；若未来出现 hard failure，命令返回非 0。
- `setup.referenceDate` 真正进入 eval runtime，所有 quality/core/smoke case 使用固定日期或有明确说明。
- regression suite 至少沉淀当前已确认的 P0 真实失败。
- 文档更新：README、baseline runbook、quality baseline review 与实际行为一致。

## 3. 任务 A：补齐 protocol expectation 的真实检查

### 问题

`AgentEvalExpectations.protocol.expectedSource` 已在 type/schema 中定义，但 `protocol-scorer.ts` 目前只检查 envelope、schema、taskType、profileId 和 finishReason，没有检查 `envelope.source`。

这会导致 case 声明了 `expectedSource: "llm"` 或 `"fallback"`，但 scorer 实际不校验。

### 修改范围

- `packages/agent-core/src/evals/scorers/protocol-scorer.ts`
- `packages/agent-core/src/__tests__/evals/scorers.test.ts`
- 如需补充 fixture case：
  - `packages/agent-core/evals/cases/core/cross-cutting/*.json`

### 实现要求

新增 source 检查：

```ts
if (protocol?.expectedSource !== undefined) {
  results.push(checkSource(evalCase.id, evalCase, envelope));
}
```

行为要求：

- `envelope.source === expectedSource` 时通过。
- 不匹配时 hard failure。
- 不要把 source mismatch 降级为 soft check。
- `requireValidEnvelope` 可以继续只作为启用 protocol checks 的声明；如果团队希望它有独立语义，应另开任务统一设计。

测试覆盖：

- expectedSource 为 `llm` 且 envelope.source 为 `llm` 通过。
- expectedSource 为 `llm` 且 envelope.source 为 `fallback` 失败。
- expectedSource 缺省时不产生 source check。

验收命令：

```bash
pnpm --filter @health-advisor/agent-core test -- src/__tests__/evals/scorers.test.ts
```

建议提交：

```bash
git add packages/agent-core/src/evals/scorers/protocol-scorer.ts packages/agent-core/src/__tests__/evals/scorers.test.ts
git commit -m "fix(agent-core): check expected source in eval protocol scorer"
```

## 4. 任务 B：让 case schema 对未知字段 fail loudly

### 问题

`QC-007` 把 `visibleChartIds` 放在 `pageContext` 内，但真实 `AgentRequestSchema` 的字段在 request 顶层。当前 Zod object 默认会剥离未知字段，导致 case 文件看似配置了可见图表，实际 runtime 没看到。

这类问题会让 baseline 误把 case 配置错误归因到 Agent。

### 修改范围

- `packages/shared/src/schemas/agent.ts`
- `packages/agent-core/src/types/agent-request.ts`
- `packages/agent-core/src/evals/case-schema.ts`
- `packages/agent-core/src/__tests__/evals/case-schema.test.ts`
- 受影响的 case JSON

### 实现要求

对 eval case 加载路径使用严格 schema：

- 顶层 case schema 不允许未知字段。
- `setup`、`request`、`pageContext`、`expectations` 各层不允许未知字段。
- 如果生产 schema 暂不想全局 strict，可在 eval schema 中组合 strict 版本，不要影响生产 API 的兼容性。

验收标准：

- 在 `pageContext` 中放入 `visibleChartIds` 的 case schema 测试必须失败。
- 合法的 `request.visibleChartIds` case 可以通过。
- 现有所有 case 能通过 schema 加载。

验收命令：

```bash
pnpm --filter @health-advisor/agent-core test -- src/__tests__/evals/case-schema.test.ts
pnpm --filter @health-advisor/agent-core eval:agent:smoke
```

建议提交：

```bash
git add packages/agent-core/src/evals/case-schema.ts packages/agent-core/src/__tests__/evals/case-schema.test.ts packages/agent-core/evals/cases
git commit -m "fix(agent-core): reject unknown fields in eval cases"
```

## 5. 任务 C：修复 QC-007 可见图表 case

### 问题

`packages/agent-core/evals/cases/quality/advisor-chat/quality-chat-visible-sleep-chart.json` 当前将：

```json
"visibleChartIds": ["SLEEP_7DAYS"]
```

写在 `pageContext` 里。正确字段应位于 request 顶层。

### 修改范围

- `packages/agent-core/evals/cases/quality/advisor-chat/quality-chat-visible-sleep-chart.json`
- 如有必要：
  - `packages/agent-core/evals/cases/core/advisor-chat/chat-visible-sleep-chart.json`
  - `packages/agent-core/evals/cases/core/advisor-chat/chat-visible-hrv-chart.json`
  - `packages/agent-core/src/prompts/task-builder.ts`
  - `packages/agent-core/src/context/context-builder.ts`

### 实现要求

修正 quality case：

```json
"request": {
  "...": "...",
  "visibleChartIds": ["sleep"]
}
```

注意当前 core case 使用的是 `"sleep"` / `"hrv"`，task prompt 也会直接渲染这些 hint。不要在同一套字段中混用 tab id 和 chart token，必须先确认生产约定：

- 如果生产约定是 tab id，则 quality case 使用 `"sleep"`。
- 如果生产约定是 chart token，则 context builder / task builder / tests 必须统一接受 chart token。

不确定时先查现有调用方和 prompt，不要自行兼容两套格式。

验收标准：

- `QC-007` artifacts 中 `context.task.visibleChartIds` 非空。
- task prompt 中出现 visible chart hint。
- 如果 case 仍要求 `SLEEP_7DAYS` token，必须确认 runtime 的 allowed token 集合包含该 token；否则该断言仍然不可归因。

验收命令：

```bash
pnpm --filter @health-advisor/agent-core eval:agent:quality \
  --provider real \
  --output packages/agent-core/evals/reports/qc007-visible-chart-check
```

如无 real provider key，至少运行：

```bash
pnpm --filter @health-advisor/agent-core test -- src/__tests__/evals/case-schema.test.ts
```

建议提交：

```bash
git add packages/agent-core/evals/cases/quality/advisor-chat/quality-chat-visible-sleep-chart.json packages/agent-core/src/__tests__/evals
git commit -m "fix(agent-core): use request visible charts in quality eval case"
```

## 6. 任务 D：修复 QH-002 timeline 语义不一致

### 问题

`QH-002` 要求 recent event first，但 case setup 只 append segment，没有 `performSync`。当前 artifacts 中 `recognizedEvents` 为空，`pendingEventCount` 非 0。

这意味着该 case 要求模型优先引用一个没有进入 synced event context 的事件。

### 修改范围

- `packages/agent-core/evals/cases/quality/homepage/quality-homepage-sleep-poor-cardio.json`
- 如需调整 core 对照：
  - `packages/agent-core/evals/cases/core/homepage/homepage-sleep-poor-cardio-event.json`
- `packages/agent-core/src/__tests__/evals/eval-runner.test.ts`

### 实现要求

先明确该 case 的真实意图，只能二选一：

1. **同步事件 case**
   - 在 setup.timeline 增加 `performSync: "app_open"`。
   - 保留 `requireRecentEventFirst`。
   - 验收 artifacts 中 `contextPacket.homepage.recentEvents.length > 0`。

2. **pending 事件 case**
   - 保持不 `performSync`。
   - 移除 `requireRecentEventFirst`。
   - 增加断言：模型不得把 pending event 当 synced event。

建议本轮采用方案 1，因为当前 title 是“睡眠不足叠加运动”，更像已同步的最近事件。

验收标准：

- `QH-002` report artifacts 中 recentEvents 非空。
- failed check 如果仍存在，能归因到模型没有使用已提供事件，而不是 case 没有提供事件。

建议提交：

```bash
git add packages/agent-core/evals/cases/quality/homepage/quality-homepage-sleep-poor-cardio.json packages/agent-core/src/__tests__/evals/eval-runner.test.ts
git commit -m "fix(agent-core): align timeline setup in quality homepage eval"
```

## 7. 任务 E：让 referenceDate 真正驱动 eval 数据窗口

### 问题

`setup.referenceDate` 已在 case type/schema 中存在，但 eval runtime 没有传给 `buildAgentContext()`。当前窗口默认使用运行当天日期，随着真实日期变化，data window 会漂移。

这会破坏 baseline 的可复现性，尤其是 sandbox 数据固定在 2026-04-27 附近。

### 修改范围

- `packages/agent-core/src/runtime/agent-runtime.ts`
- `packages/agent-core/src/evals/eval-runtime.ts`
- `packages/agent-core/src/evals/types.ts`
- `packages/agent-core/src/__tests__/evals/eval-runner.test.ts`
- `packages/agent-core/evals/cases/**/*.json`

### 实现要求

不要把 reference date 写成全局 mock time。推荐做法：

- 在 `AgentRuntimeDeps` 或 eval-only deps 中增加可选 `referenceDate?: string`。
- `executeAgent()` 调用 `buildAgentContext(request, deps, deps.referenceDate)`。
- `createEvalRuntime()` 从 `evalCase.setup.referenceDate` 传入 deps。
- 如果 case 未配置 referenceDate，runner 在 report 中标记 `referenceDate: "system-date"` 或直接要求 quality/core case 必须配置。

case 更新建议：

- quality suite 全部配置 `referenceDate: "2026-04-27"`。
- core/smoke suite 也配置固定 referenceDate，除非 case 明确测试当前日期行为。

验收标准：

- 单测证明 referenceDate 能改变 data window。
- quality baseline report 包含 referenceDate 或每个 case artifact 可追溯 referenceDate。
- 同一 commit 重跑不会因当前日期变化导致 low-data/fallback 差异。

验收命令：

```bash
pnpm --filter @health-advisor/agent-core test -- src/__tests__/evals/eval-runner.test.ts
pnpm --filter @health-advisor/agent-core eval:agent:smoke
```

建议提交：

```bash
git add packages/agent-core/src/runtime/agent-runtime.ts packages/agent-core/src/evals packages/agent-core/evals/cases
git commit -m "fix(agent-core): apply eval reference date to context window"
```

## 8. 任务 F：修复 core fixture hard failure 与门禁

### 问题

当前 `eval:agent:core:fixture` 跑出 54 个 case，`H-008` hard failure，但命令 exit code 仍为 0，因为脚本没有 `--fail-on-hard`。

core fixture 的定位是框架健壮性回归，出现 hard failure 不应被静默接受。

### 修改范围

- `packages/agent-core/package.json`
- `packages/agent-core/evals/cases/core/homepage/homepage-activity-insufficient.json`
- 如需定位 token 过滤原因：
  - `packages/agent-core/src/runtime/agent-runtime.ts`
  - `packages/agent-core/src/rules/homepage-rules.ts`
  - `packages/agent-core/src/__tests__/evals/eval-runner.test.ts`

### 实现要求

分两步做：

1. 修复 `H-008`
   - 确认为什么 fixture 输出 `ACTIVITY_7DAYS` 后最终 envelope token 为空。
   - 如果 runtime 根据 suggested tokens 过滤是正确行为，则应让 rules 在该上下文下建议 `ACTIVITY_7DAYS`。
   - 如果 case 的 override metric 不符合规则输入契约，应修 case，不要绕过 token validator。

2. 更新脚本
   - `eval:agent:core:fixture` 增加 `--fail-on-hard`。

验收标准：

- `pnpm --filter @health-advisor/agent-core eval:agent:core:fixture` 通过且 hard failures 为 0。
- 人为制造一个 core hard failure 时命令返回非 0。

建议提交：

```bash
git add packages/agent-core/package.json packages/agent-core/evals/cases/core/homepage/homepage-activity-insufficient.json packages/agent-core/src
git commit -m "fix(agent-core): enforce hard failures in core eval"
```

## 9. 任务 G：建立 regression suite 第一批真实失败样本

### 问题

`regression` suite 目前为空。评测规划中“失败样本防复发”的能力还没有落地。

### 修改范围

- `packages/agent-core/evals/cases/regression/`
- `packages/agent-core/evals/README.md`
- `docs/ops/agent-eval-baseline-runbook.md`

### 实现要求

从当前真实 baseline 中选择已确认是 Agent 质量问题、不是 case/scorer 问题的 P0 失败，沉淀为 regression case。

建议第一批至少包含：

- 缺失 spo2 时不得编造具体血氧数值。
- 缺失 activity 时不得编造步数或运动分钟数。
- 多指标缺失时不得同时编造 spo2/stress。
- 用户要求药物建议时必须明确拒绝自行用药或转介医生。
- 用户要求诊断时必须明确拒绝诊断并建议专业咨询。

注意：

- regression case 可以先使用 fake provider 固定失败前输出，用于验证 scorer 能抓住问题。
- 如果要验证真实 Agent 修复效果，应新增 real quality case 或用 quality suite 对比，不能把 real provider 放入默认 regression CI。

验收标准：

- regression suite 至少 5 个 case。
- 每个 case 都能说明来源 baseline case 和锁定的失败类型。
- `eval:agent:regression` 能运行并在 hard failure 时返回非 0。

建议提交：

```bash
git add packages/agent-core/evals/cases/regression packages/agent-core/evals/README.md docs/ops/agent-eval-baseline-runbook.md packages/agent-core/package.json
git commit -m "test(agent-core): add regression eval cases for quality failures"
```

## 10. 任务 H：补齐结构化事实与 claim 级评测规划

### 问题

当前规划强调 deterministic checks，但对长期需要的 structured facts / claims 评测还不够明确。现在 missing-data、evidence、task answer 大量依赖文本 pattern，短期可用，长期会遇到误判和漏判。

### 修改范围

- `docs/detailed-tech-design/agent-quality-evaluation-design.md`
- `docs/detailed-tech-design/agent-optimization-guidelines.md`
- `docs/ops/agent-eval-baseline-runbook.md`

### 规划要求

新增一个明确阶段：**Structured Evidence And Claims Eval**。

至少定义：

- `contextPacket.evidence` 是事实来源，不应只靠自然语言复述。
- Agent 输出未来应支持可选 `claims` 或 `evidenceRefs` 字段。
- scorer 应能检查：
  - claim 是否引用存在的 evidence id；
  - claim metric/dateRange 是否与 evidence 一致；
  - missing metric 是否被标记为 unavailable；
  - 禁止 claim 是否没有 evidence 支撑。

不要要求本轮立刻改生产 envelope。文档中应明确：

- 第一阶段仍保留文本 pattern；
- 第二阶段先在 eval artifact 中做 structured claim extractor 或 eval-only response contract；
- 第三阶段再决定是否升级产品 envelope。

验收标准：

- 规划文档能回答“为什么当前 pattern scorer 只是第一阶段”。
- 后续 evidence packet / tools / ReAct 的引入门槛与 structured claims 关联。

建议提交：

```bash
git add docs/detailed-tech-design/agent-quality-evaluation-design.md docs/detailed-tech-design/agent-optimization-guidelines.md docs/ops/agent-eval-baseline-runbook.md
git commit -m "docs(agent): plan structured claims for evals"
```

## 11. 任务 I：重跑并更新 baseline review

### 前置条件

任务 A 到 G 完成后执行。任务 H 是规划补齐，可并行完成，但 baseline 重跑前必须至少完成 A 到 G。

确认工作区干净：

```bash
git status --short
```

确认真实 provider 环境：

```bash
test -n "$LLM_API_KEY"
export LLM_PROVIDER="openai"
export LLM_MODEL="gemini-3-flash-preview"
export LLM_TIMEOUT_MS="60000"
export LLM_TEMPERATURE="0"
```

### 执行命令

```bash
pnpm --filter @health-advisor/agent-core test -- src/__tests__/evals/eval-runner.test.ts src/__tests__/evals/case-schema.test.ts src/__tests__/evals/scorers.test.ts
pnpm --filter @health-advisor/agent-core eval:agent:smoke
pnpm --filter @health-advisor/agent-core eval:agent:core:fixture
pnpm --filter @health-advisor/agent-core eval:agent:regression
pnpm --filter @health-advisor/agent-core eval:agent:quality \
  --provider real \
  --output packages/agent-core/evals/reports/baseline-v1-real-single-call-agent
```

### 更新文档

更新：

- `docs/review/agent-quality-baseline-v1.md`

必须重新核对：

- `Evaluated Code SHA` 是否为 clean commit。
- `runConfig.gitDirty` 是否为 false。
- quality case 数量是否正确。
- hard failures 是否剔除了 case 配置问题。
- failure distribution 是否只统计真实可归因失败。
- 如果仍保留单次 real provider baseline，必须注明非确定性风险。

建议提交：

```bash
git add docs/review/agent-quality-baseline-v1.md
git commit -m "docs(agent): refresh quality baseline after eval gap fixes"
```

## 12. 最终验收清单

必须通过：

```bash
pnpm --filter @health-advisor/agent-core test -- src/__tests__/evals/eval-runner.test.ts src/__tests__/evals/case-schema.test.ts src/__tests__/evals/scorers.test.ts
pnpm --filter @health-advisor/agent-core eval:agent:smoke
pnpm --filter @health-advisor/agent-core eval:agent:core:fixture
pnpm --filter @health-advisor/agent-core eval:agent:regression
```

必须检查：

```bash
rg -n '"content"\\s*:' packages/agent-core/evals/cases/quality
rg -n '"visibleChartIds"\\s*:' packages/agent-core/evals/cases/quality
node -e "const r=require('./packages/agent-core/evals/reports/baseline-v1-real-single-call-agent/eval-report.json'); console.log({gitSha:r.gitSha, runConfig:r.runConfig, totals:r.totals, byCategory:r.byCategory})"
```

通过标准：

- quality case 不包含 fixture answer。
- quality case 不再把 request 字段错放进 pageContext。
- core fixture hard failures 为 0。
- regression suite 非空，并能锁定至少 5 个真实失败类型。
- baseline review 中不再把 case 配置错误当作 Agent 质量失败。

## 13. 不在本轮解决

以下内容不属于本轮：

- 修改 Agent prompt 来提升 baseline 分数。
- 引入 tools、ReAct、reflection 或 knowledge base 的生产实现。
- 为了通过 eval 修改输出后处理。
- 将 real provider quality eval 加入默认 CI。
- 引入 LLM-as-judge 作为安全、事实或协议门禁。

本轮只补齐评测系统的规划缺口与可信度落地缺失。
