# Agent 优化方向指南

## 1. 文档定位

本文档用于在建立 Agent 质量基线后，从高级别视角指导后续 Agent 建议质量优化。

它不是单个功能的实施计划，而是一个决策框架，用来回答：

- 当前应该优先优化 Agent 的哪一层能力？
- 某类质量问题应该归因到 prompt、context、memory、knowledge、tools 还是 reasoning？
- 什么时候应该引入 ReAct / reflection / knowledge base，而不是继续微调 prompt？
- 如何避免在没有质量证据的情况下做复杂架构改造？

本指南应与以下文档配合使用：

- `docs/detailed-tech-design/agent-quality-evaluation-design.md`
- `docs/ops/agent-eval-baseline-runbook.md`
- `docs/superpowers/plans/2026-04-26-agent-eval-quality-baseline-hardening.md`

## 2. 核心判断

Agent 优化不应从“增加高级架构”开始，而应从“稳定暴露真实质量问题”开始。

在没有真实质量基线时，prompt、memory、knowledge base、tools、ReAct、reflection 的改动都很难判断收益。它们可能让某些样例看起来更好，也可能在其他任务上引入不可见退化。

因此后续优化应遵循四层路线：

```text
可评测 -> 可理解 -> 可增强 -> 可推理
```

含义如下：

| 层级 | 目标 | 典型产物 |
|------|------|----------|
| 可评测 | 让质量变化可复现、可比较、可回归 | real provider quality baseline、regression cases、score gate |
| 可理解 | 明确 Agent 看到了什么、为什么这样答 | context contract、category breakdown、trace artifacts |
| 可增强 | 给 Agent 提供更可靠的事实、记忆和证据 | memory model、evidence packet、knowledge retrieval、tool results |
| 可推理 | 让 Agent 能多步收集信息、自检并形成更稳答案 | tool loop、ReAct、reflection、planner |

当前阶段最重要的任务是先完成真实质量基线硬化，然后基于失败样本决定下一层优化。

## 3. 当前 Agent 架构事实

当前 Agent 主链路更接近：

```text
单次 LLM 调用
  + prompt 构建
  + context 拼装
  + rules
  + output parser
  + memory write
  + fallback
```

它还不是严格意义上的多步 Agent。当前建议质量主要依赖：

- prompt 是否清晰；
- context 是否完整且相关；
- model 是否在一次调用中完成正确推理；
- parser / rule / safety 是否拦住边界问题；
- memory 是否提供了正确个性化信息。

这意味着在引入 ReAct 或工具调用前，应先确认当前失败是否真的来自“缺少多步推理”。如果失败原因是上下文缺失、证据结构不清、任务契约模糊或记忆污染，直接引入 ReAct 只会放大复杂度。

## 4. 优化优先级

### 4.1 第一优先级：真实质量基线

目标：让 baseline 能反映真实 Agent 输出，而不是只验证 eval framework。

必须满足：

- quality eval 使用 real provider；
- quality cases 不允许 `modelFixture.content` 预置正确答案；
- runner 使用真实 `data/sandbox`、prompts、timeline、fallback assets；
- report 保留 category breakdown；
- 支持 baseline comparison 和 score regression gate；
- fake fixture 结果只能命名为 framework sanity baseline。

完成后，团队应先分析失败分布，而不是立刻改 Agent。

重点观察：

- hard failures 是否存在；
- 失败集中在哪个 category；
- 哪些 P0 case 失败；
- evidence / missing-data / safety / memory / task-specific 哪类 scorer 最常失败；
- 是否存在总分高但关键路径失败的情况。

### 4.2 第二优先级：上下文契约

如果 Agent 没有看到正确事实，后续所有 reasoning 优化都不可靠。

每类任务都应定义明确的 context contract：

| 任务 | 必须具备的上下文 |
|------|------------------|
| homepage / morning brief | 最近事件、关键指标变化、用户目标、当前风险状态 |
| view summary | 当前 view、timeframe、visible chart ids、趋势、异常点、缺失数据 |
| advisor chat | 用户问题、当前页面上下文、相关历史数据、近期对话、可用证据 |
| fallback | 失败原因、可展示的安全兜底内容、真实 fallback assets |
| cross-cutting safety | 禁止建议、风险边界、缺失数据声明、就医提示规则 |

优化重点：

- 减少无关上下文；
- 保留关键事实锚点；
- 区分近期事件、长期趋势和用户目标；
- 让缺失数据以结构化方式进入 prompt；
- 为 evidence scorer 提供可验证来源。

### 4.3 第三优先级：任务分层与输出契约

不同任务不应共用一套宽泛的“好建议”标准。

建议按任务定义输出契约：

| 任务 | 质量重点 |
|------|----------|
| homepage | 简短、最近事件优先、建议可执行、不夸大 |
| view summary | 解释趋势、引用当前视图数据、区分观察与建议 |
| advisor chat | 直接回答问题、承认不确定性、结合上下文个性化 |
| fallback | 安全、诚实、不中断体验、不伪造数据 |
| cross-cutting | 不诊断、不越权、不编造、不泄露其他 profile memory |

这一步的目标是让 prompt、eval case、scorer 和产品体验对齐。

### 4.4 第四优先级：记忆系统

记忆优化的目标不是存更多内容，而是让 Agent 在正确时机使用正确记忆。

建议把记忆分为：

| 记忆类型 | 示例 | 风险 |
|----------|------|------|
| 稳定画像 | 年龄、基础健康背景、长期目标 | 过期或错误画像会污染建议 |
| 偏好记忆 | 用户偏好的建议风格、行动成本 | 可能让建议过度迎合 |
| 行为历史 | 曾尝试的建议、执行结果 | 需要区分事实和推测 |
| 风险记忆 | 不适合的运动、饮食、提醒方式 | 错漏会造成安全问题 |
| 对话记忆 | 最近关注点、追问链路 | profile 切换时必须隔离 |

优先解决：

- profile switch 后 memory isolation；
- memory 写入条件；
- memory 过期策略；
- memory 与当前上下文冲突时的优先级；
- eval 中覆盖记忆污染和错误个性化。

### 4.5 第五优先级：证据系统与知识库

知识库不应只是“把文档塞进 prompt”。它应服务于可验证的 evidence flow。

推荐数据流：

```text
用户问题 / 当前任务
  -> 生成检索意图
  -> 检索知识库或规则资料
  -> 产出结构化 evidence packet
  -> Agent 基于 evidence 给建议
  -> eval 检查 requiredFacts / forbiddenFacts / unsupported claims
```

优先引入知识库的场景：

- Agent 经常给出泛泛建议；
- 健康建议缺少依据；
- 同类问题需要稳定专业边界；
- safety / forbidden advice 需要更系统维护；
- prompt 中开始堆积大量医学、营养、运动规则。

不建议一开始就做复杂向量库。可以先从小规模结构化知识条目开始，保证每条知识有来源、适用范围、禁用边界和版本。

### 4.6 第六优先级：工具调用

工具调用应解决具体信息获取或计算问题，而不是为了让系统“看起来更像 Agent”。

适合工具化的能力：

- 查询用户历史指标；
- 获取 timeline 事件；
- 计算 24 小时 / 7 天 / 30 天趋势；
- 检查可见 chart token；
- 检索知识库；
- 执行 safety policy check；
- 生成 evidence packet；
- 检查 memory 是否可用于当前 profile。

工具输出必须结构化，不能只返回自然语言。否则 eval 和后续 reasoning 都难以稳定验证。

### 4.7 第七优先级：ReAct / 多步推理

ReAct 适合处理需要多步观察、工具调用和判断的任务。

适合引入 ReAct 的场景：

- 用户问“为什么最近状态变差”；
- 需要结合睡眠、活动、症状、饮食、timeline；
- 需要先判断数据是否足够，再决定是否回答；
- 需要调用多个工具补齐事实；
- 需要在最终建议前形成可检查的 evidence set。

不适合优先引入 ReAct 的场景：

- 简单 homepage 短建议；
- 固定格式摘要；
- 已有上下文足够的小型任务；
- 失败主要来自 prompt 契约不清或 context 缺失。

推荐先在 advisor chat 或复杂 view summary 上局部试点，不要全局替换当前单次调用链路。

### 4.8 第八优先级：反思与自检

Reflection 应设计成明确的检查阶段，而不是让模型泛泛“再想一遍”。

可检查项：

- 是否引用了不存在的数据；
- 是否忽略了缺失数据；
- 是否给出诊断、药物或高风险建议；
- 是否没有回应用户问题；
- 是否建议过于泛泛；
- 是否和用户目标或历史限制冲突；
- 是否没有可执行下一步；
- 是否泄露或混用其他 profile memory。

第一阶段应优先使用 deterministic checks。LLM-as-judge 只能用于表达自然度、建议具体性、语气等主观维度，不能替代事实、安全和协议硬判定。

## 5. 从失败类型到优化方向

| 失败信号 | 优先优化方向 |
|----------|--------------|
| protocol / schema 失败 | parser、response contract、task prompt 输出格式 |
| chart token 错误 | visible chart ids、token registry、task context |
| missing-data claim 失败 | context missing fields、prompt 缺失数据约束 |
| evidence 失败 | evidence packet、context builder、knowledge retrieval |
| safety 失败 | system prompt、安全策略、reflection check、policy scorer |
| memory 失败 | memory isolation、profile switch、memory write/read policy |
| task-specific 失败 | task router、page context、timeframe / tab 理解 |
| 建议泛泛 | context contract、knowledge base、task prompt、memory |
| 忽略最近事件 | timeline seed、event ranking、homepage contract |
| 回答跑题 | intent parsing、advisor chat context、tool selection |

原则：先修复事实输入和任务契约，再优化表达和推理链路。

## 6. 推荐推进路线

### Phase 1: Baseline Hardening

目标：获得可信的真实 Agent quality baseline。

完成标准：

- `framework sanity baseline` 与 `agent quality baseline` 分离；
- real provider quality eval 可运行；
- no fixture answer；
- report 能定位 category 和 scorer 失败；
- regression gate 可用于对比。

### Phase 2: Failure Taxonomy

目标：把真实 baseline 的失败样本分类。

产物：

- 失败 case 清单；
- 每个失败 case 的根因归类；
- P0 / P1 修复优先级；
- 是否需要 prompt、context、memory、knowledge、tool 或 ReAct 的判断。

### Phase 3: Context Contract

目标：让每类任务拥有明确、稳定、可验证的上下文输入。

产物：

- task-specific context contract；
- context artifact 快照；
- 关键事实锚点；
- missing-data 结构化表达。

### Phase 4: Evidence And Memory

目标：提升专业性和个性化。

产物：

- evidence packet；
- 小规模结构化知识库；
- memory read/write policy；
- memory isolation eval cases。

### Phase 5: Tools And Reasoning

目标：在复杂任务中引入多步信息收集和自检。

产物：

- tool schema；
- tool call trace；
- advisor chat 或 complex summary 的 ReAct prototype；
- reflection check；
- before/after quality report。

## 7. 决策门槛

引入某个复杂能力前，应满足以下门槛：

| 能力 | 引入前必须证明 |
|------|----------------|
| memory 优化 | 失败与个性化不足、历史偏好、profile 隔离有关 |
| knowledge base | 失败与专业知识、证据不足、禁用边界维护有关 |
| tools | 失败需要查询、计算、检索或校验，prompt 无法稳定解决 |
| ReAct | 失败需要多步观察和动态决策，不是单纯上下文缺失 |
| reflection | 失败可通过最终检查捕获，且检查项能明确表达 |
| LLM-as-judge | deterministic scorer 已覆盖硬门槛，只剩主观质量维度 |

如果无法证明上述条件，应先补 eval case 和 trace，而不是先改架构。

## 8. 非目标与反模式

后续优化应避免：

- 用 fake fixture 100 分证明 Agent 质量优秀；
- 在没有失败样本归因前重写 Agent 架构；
- 用更长 prompt 掩盖 context 缺失；
- 用后处理正则修补本应由协议或策略解决的问题；
- 把知识库内容无选择地塞进 prompt；
- 全局引入 ReAct 导致简单任务延迟和复杂度上升；
- 让 reflection 输出不可验证的自然语言意见；
- 用 LLM-as-judge 替代事实、安全、协议类 deterministic checks。

## 9. 下一步建议

当前最务实的下一步是：

1. 完成真实质量基线硬化。
2. 跑出 `baseline-v1-real-single-call-agent`。
3. 按 category、scorer、P0/P1 case 做失败分类。
4. 从失败分类中选择第一批优化目标。
5. 优先落地 context contract，再考虑 memory、knowledge、tools、ReAct 和 reflection。

只有当真实 baseline 能稳定暴露问题后，Agent 架构优化才有可靠方向。
