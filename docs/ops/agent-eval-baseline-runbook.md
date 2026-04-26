# Agent Eval Baseline 使用手册

> 本文档说明工程师完成 Agent 质量评估体系实施后，团队如何建立、使用、更新和维护评测基线。

> 注意：如果当前 Core Eval 使用 `provider=fake` 且 case 内含 `modelFixture.content`，该结果只能作为 framework sanity baseline，不能作为 Agent quality baseline。真实质量基线硬化任务见 `docs/superpowers/plans/2026-04-26-agent-eval-quality-baseline-hardening.md`。

## 1. 核心用途

Agent eval baseline 用来回答三个问题：

- 当前 Agent 在固定质量场景上的表现是什么？
- 某次 prompt / context / memory / rules / tools / ReAct / reflection 改动后，质量是提升还是退化？
- 已发现的失败样本是否会在后续改动中复发？

这套体系不是为了追求一次性全绿，而是为了让 Agent 优化从主观判断变成可重复的工程对比。

## 2. 评测集用途

| Suite | 命令 | 用途 | 何时运行 |
|-------|------|------|----------|
| Smoke Eval | `pnpm --filter @health-advisor/agent-core eval:agent:smoke` | 快速确认主链路、协议、安全硬门槛没坏 | 每个 Agent 相关 PR、本地快速验证、CI |
| Core Eval | `pnpm --filter @health-advisor/agent-core eval:agent:core` | 建立质量画像，做改动前后对比 | prompt/context/memory/rules/tools/ReAct/reflection 改动前后 |
| Regression Eval | `pnpm --filter @health-advisor/agent-core eval:agent:regression` | 防止历史失败复发 | 修复失败样本后、发布前、重要 demo 前 |

默认 CI 只跑 fake provider 的 Smoke Eval。真实 provider eval 只能手动运行，不应作为默认 CI 门禁。

## 3. 第一次建立 Baseline

实施完成后，在当前主分支上运行：

```bash
pnpm --filter @health-advisor/agent-core eval:agent:core
```

命令会生成：

```text
packages/agent-core/evals/reports/<timestamp>/
  eval-report.json
  eval-report.md
```

这份报告就是当前 Agent 的 baseline。

建议把目录重命名为可读版本号，例如：

```text
packages/agent-core/evals/reports/baseline-v1-single-call-agent/
```

报告目录默认不入 git。如果团队需要长期保存 baseline，应把 `eval-report.json` 作为 release artifact 或手动归档到约定位置，不要直接提交大量本地报告。

## 4. Baseline Report 怎么读

优先级按以下顺序：

1. **Hard failures**
   - 协议错误、安全越界、缺失数据编造、非法 chart token、memory 污染等。
   - 这些问题优先级最高，不应被总分掩盖。

2. **P0 case failures**
   - 产品主路径失败，例如 homepage、view summary、advisor chat 的核心场景。
   - P0 从 pass 变 fail 应阻塞相关改动。

3. **Category breakdown**
   - 看失败集中在哪个域：homepage、view-summary、advisor-chat、cross-cutting。
   - 用于决定下一轮优化重点。

4. **Soft score**
   - 用于观察质量趋势。
   - 不单独作为硬门禁，除非超过 regression 阈值。

## 5. 每次 Agent 改动的使用流程

### 5.1 改动前

先确认当前 baseline report 路径，例如：

```text
packages/agent-core/evals/reports/baseline-v1-single-call-agent/eval-report.json
```

如果当前没有可信 baseline，先在 main 上跑一次 Core Eval 并归档。

### 5.2 改动中

按改动范围运行不同 suite：

- 改 parser / schema / token / safety：至少跑 Smoke Eval。
- 改 prompt / context / rules：跑 Core Eval。
- 改 memory：跑 Core Eval，并重点看 memory scorer。
- 改 tools / ReAct / reflection：跑 Core Eval 和 Regression Eval。

### 5.3 改动后

运行 Core Eval 并与 baseline 对比：

```bash
pnpm --filter @health-advisor/agent-core eval:agent:core \
  --baseline-report packages/agent-core/evals/reports/baseline-v1-single-call-agent/eval-report.json \
  --fail-on-score-regression 2
```

含义：

- 读取指定 baseline。
- 比较当前总分率与 baseline 总分率。
- 如果下降超过 2 个百分点，命令失败。

即使总分未下降，也必须人工检查：

- 是否新增 hard failure。
- 是否有 P0 case 从 pass 变 fail。
- 是否有 safety / missing-data / memory 类失败。
- 是否某个 category 明显下降。

## 6. 如何根据失败定位优化方向

| 失败类型 | 优先检查 |
|----------|----------|
| `protocol-scorer` | `AgentResponseEnvelope` schema、parser、finishReason、meta |
| `length-scorer` | task prompt 长度约束、parser 是否保留冗余文本 |
| `status-scorer` | rules status、LLM statusColor、fallback status |
| `token-scorer` | chart token 选择逻辑、token 白名单、tab-token 映射 |
| `mention-scorer` | prompt 是否要求关键事实锚点、case pattern 是否过窄 |
| `evidence-scorer` | context 是否暴露证据、prompt 是否要求用证据支撑建议 |
| `missing-data-scorer` | missing fields、数据质量 prompt、安全清洗 |
| `safety-scorer` | system prompt、安全边界、输出自检、cleaner |
| `memory-scorer` | session memory、analytical memory、profile switch invalidation |
| `task-scorer` | task routing、时间范围解析、visibleChartIds、tab 聚焦 |

评测报告应指导架构优化层级：

- evidence 失败多：优先做 evidence packet / context builder。
- advisor 时间范围失败多：优先做用户意图和时间范围解析工具。
- memory 失败多：优先重构 memory schema 和失效策略。
- token 失败多：优先把 token selection 从 LLM 转到规则或工具。
- safety 失败多：优先做 pre-output policy 或 reflection verifier。

## 7. Baseline 何时更新

不要因为当前分支失败就立即更新 baseline。

允许更新 baseline 的情况：

- 修复一组已确认 bug 后，Core Eval 明显提升。
- 完成一个明确的 Agent 架构阶段，例如 evidence packet、memory 改造、tools/ReAct、reflection。
- 新 baseline 没有新增 hard failure。
- P0 case 没有退化。

不应更新 baseline 的情况：

- 只是为了让失败消失。
- 新增 case 后发现当前实现失败，但还没有判断失败是否合理。
- 总分提升但 safety / missing-data / memory 出现退化。

建议 baseline 命名：

```text
baseline-v1-single-call-agent
baseline-v2-evidence-packet
baseline-v3-structured-memory
baseline-v4-tools-react
baseline-v5-reflection-verifier
```

每次更新 baseline 时，在 PR 或提交说明中记录：

- 新 baseline 路径。
- 相比上一版的总分变化。
- hard failures 是否为 0。
- 主要提升和残留风险。

## 8. 失败 Case 如何沉淀到 Regression

当人工 review、demo 或真实使用发现 Agent 犯错时，按以下流程处理：

1. 复现问题，记录 request、profile、pageContext、memory、timeline/override 状态。
2. 在 `packages/agent-core/evals/cases/regression/` 新增 case。
3. 用 deterministic expectations 表达错误边界：
   - 禁止出现的结论。
   - 必须披露的数据不足。
   - 必须引用的证据。
   - 必须拒绝的诊断/药物建议。
4. 确认该 case 在修复前失败。
5. 修复 Agent。
6. 确认该 case 修复后通过。

Regression case 的目标是防复发，不是覆盖所有常规路径。

## 9. Fake Provider 与 Real Provider

### Fake Provider

用途：

- CI。
- scorer / runner / schema 回归。
- 固定输出场景。
- fallback / invalid JSON / token 过滤等确定性测试。

优点：稳定、便宜、可重复。

限制：不能完整评估真实生成质量。

### Real Provider

用途：

- 建立真实质量 baseline。
- 比较 prompt / context / ReAct / reflection 改动效果。
- 人工 review 真实输出。

限制：

- 输出存在波动。
- 有成本。
- 依赖网络和 provider 状态。

真实 provider eval 不应默认进入 CI。若要比较真实模型效果，应固定 provider、model、temperature、prompt version 和 data version。

## 10. PR 检查清单

Agent 相关 PR 合并前检查：

- [ ] Smoke Eval 通过。
- [ ] 如果改动影响生成质量，Core Eval 已运行。
- [ ] 没有新增 hard failure。
- [ ] 没有 P0 case 从 pass 变 fail。
- [ ] safety / missing-data / memory scorer 没有退化。
- [ ] 如果引入新失败样本，已新增 regression case。
- [ ] 如果更新 baseline，PR 说明写明原因和对比结果。

## 11. 推荐工作流

日常小改：

```bash
pnpm --filter @health-advisor/agent-core eval:agent:smoke
```

Agent 质量优化：

```bash
pnpm --filter @health-advisor/agent-core eval:agent:core \
  --baseline-report packages/agent-core/evals/reports/baseline-v1-single-call-agent/eval-report.json \
  --fail-on-score-regression 2
```

失败样本修复：

```bash
pnpm --filter @health-advisor/agent-core eval:agent:regression
pnpm --filter @health-advisor/agent-core eval:agent:core
```

发布或重要 demo 前：

```bash
pnpm --filter @health-advisor/agent-core eval:agent:smoke
pnpm --filter @health-advisor/agent-core eval:agent:core
pnpm --filter @health-advisor/agent-core eval:agent:regression
```

## 12. 结论

Agent eval baseline 的核心用法是：

```text
先用 Core Eval 建立当前 Agent 的质量画像；
之后每次 Agent 架构或 prompt 改动，都用同一批 case 做前后对比；
把失败样本持续沉淀进 Regression Eval；
确保优化有可重复证据，而不是凭感觉判断。
```
