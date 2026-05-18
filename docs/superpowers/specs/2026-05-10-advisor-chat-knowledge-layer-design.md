# Advisor Chat Knowledge Layer 设计

> 日期：2026-05-10
> 状态：已确认首期范围

## 概述

Advisor Chat 需要接入外部知识，但首期不做用户长期记忆。知识层只覆盖两类内容：

1. 通用健康知识，例如 HRV、睡眠、压力、运动准备度、安全边界表达。
2. 设备与产品知识，例如指标定义、设备采集限制、图表含义、产品能力边界。

首期目标不是做一个泛化 RAG 系统，而是建立一个可审阅、可编译、可追溯、可测试的 Knowledge Layer。Markdown/wiki 作为人类维护的源格式，运行时只消费编译后的结构化 facts。Advisor Chat 通过受限 tool 查询知识 facts，并把引用结果接入现有 `TaskContextPacket`、planner、evidence、verifier 和 eval 体系。

## 关键决策

| 决策项 | 选择 | 理由 |
|--------|------|------|
| 首期范围 | 通用健康知识 + 设备/产品知识 | 用户长期记忆涉及 profile 隔离、写入策略、撤回、隐私和时间衰减，后续单独设计 |
| 源格式 | Obsidian-compatible Markdown/wiki | 便于人工编辑、审阅、Git diff、交叉链接和 LLM 辅助整理 |
| 运行时格式 | 编译后的结构化 `KnowledgeFact` / `ProductFact` | 让 Agent 消费稳定 schema，而不是直接消费长文档 |
| 检索入口 | 受限 tools：`queryKnowledgeFacts`、`queryProductFacts` | 与现有 ReAct tools 保持一致，可白名单、可测、可追溯 |
| RAG 定位 | 检索实现之一，不是架构中心 | 避免把架构绑定到向量库；先保证知识治理和证据链 |
| 用户长期记忆 | 首期不做 | 后续用独立 memory 方案处理，不混入 wiki 首期 |
| 未命中知识 | 不用 LLM 自行补全 | 没有 reviewed fact 时只能说明当前没有足够知识依据 |

## 非目标

首期明确不做以下能力：

- 不做用户长期记忆、跨会话记忆、用户偏好写入。
- 不引入数据库、Redis 或外部向量数据库。
- 不引入完整知识图谱或 GraphRAG。
- 不允许模型直接基于未审阅 Markdown 原文输出健康结论。
- 不把通用健康知识伪装成用户个人事实。
- 不用自由文本检索结果绕过现有 evidence/verifier 体系。

## 术语

### frontmatter

frontmatter 是 Markdown 文件开头的结构化元数据，通常用 YAML 写在两个 `---` 之间。正文给人读，frontmatter 给系统读。

```md
---
id: health-hrv-basics
title: HRV 基础解释
layer: health_knowledge
metrics: [hrv, stress, sleep]
intents: [explain_metric, exercise_readiness]
riskLevel: general
reviewStatus: approved
sourceIds: [source-hrv-001]
expiresAt: 2026-12-31
---

# HRV 基础解释

HRV 反映心跳间隔的变异性……
```

系统可以用 frontmatter 判断这篇知识是否已审核、适用哪些指标、能否用于高风险场景、是否过期，以及输出时应该引用哪些来源。

### Knowledge Fact

Knowledge Fact 是从 reviewed Markdown 编译出来的结构化知识声明。它是运行时实际消费的最小知识单元。

### Product Fact

Product Fact 是设备和产品知识的结构化声明，例如某个指标的采集方式、图表 token 的含义、设备缺失数据的常见原因。

## 目录结构

建议新增知识源目录：

```text
knowledge/
  sources/
    health/
      source-hrv-001.md
    product/
      source-device-hrv-001.md
  wiki/
    health/
      hrv-basics.md
      sleep-recovery.md
      exercise-readiness.md
      safety-boundaries.md
    product/
      metric-definitions.md
      chart-token-guide.md
      device-data-quality.md
  compiled/
    knowledge-facts.json
    product-facts.json
    manifest.json
```

目录职责：

| 目录 | 职责 |
|------|------|
| `knowledge/sources` | 原始来源摘要或引用信息，保留来源 ID，不直接进入 prompt |
| `knowledge/wiki/health` | 通用健康知识 wiki，必须有 frontmatter |
| `knowledge/wiki/product` | 设备与产品知识 wiki，必须有 frontmatter |
| `knowledge/compiled` | 构建产物，由脚本生成，运行时读取 |

`compiled` 产物可以进入仓库，保证 demo 和 eval 可复现。未来如果接入外部知识系统，也应先编译成同样的 facts schema。

## frontmatter schema

### 通用健康知识

```yaml
id: health-hrv-basics
title: HRV 基础解释
layer: health_knowledge
metrics:
  - hrv
  - stress
intents:
  - explain_metric
  - exercise_readiness
riskLevel: general
reviewStatus: approved
sourceIds:
  - source-hrv-001
expiresAt: 2026-12-31
allowedClaims:
  - explain_relationship
  - general_lifestyle_guidance
prohibitedClaims:
  - diagnosis
  - medication_advice
  - treatment_promise
```

### 设备与产品知识

```yaml
id: product-chart-token-guide
title: 图表 token 说明
layer: product_knowledge
productAreas:
  - chart
  - data_quality
metrics:
  - hrv
  - sleep
reviewStatus: approved
sourceIds:
  - source-product-chart-001
expiresAt: 2026-12-31
```

### 字段规则

| 字段 | 必填 | 说明 |
|------|------|------|
| `id` | 是 | 全局唯一，稳定，不含随机数 |
| `title` | 是 | 人类可读标题 |
| `layer` | 是 | `health_knowledge` 或 `product_knowledge` |
| `metrics` | 否 | 适用指标，使用现有 metric 名称 |
| `intents` | 否 | 适用 Advisor Chat 意图 |
| `riskLevel` | 健康知识必填 | `general`、`potential_risk`、`safety_boundary` |
| `reviewStatus` | 是 | 只有 `approved` 可以进入 compiled facts |
| `sourceIds` | 是 | 来源 ID 列表 |
| `expiresAt` | 是 | 过期知识不得进入运行时 |
| `allowedClaims` | 健康知识建议必填 | 允许的声明类型 |
| `prohibitedClaims` | 健康知识建议必填 | 禁止的声明类型 |

## 结构化 fact schema

### KnowledgeFact

```ts
export interface KnowledgeFact {
  id: string;
  layer: 'health_knowledge';
  title: string;
  claim: string;
  metrics: string[];
  intents: string[];
  riskLevel: 'general' | 'potential_risk' | 'safety_boundary';
  allowedClaims: string[];
  prohibitedClaims: string[];
  sourceIds: string[];
  expiresAt: string;
  evidenceId: string;
}
```

### ProductFact

```ts
export interface ProductFact {
  id: string;
  layer: 'product_knowledge';
  title: string;
  claim: string;
  productAreas: string[];
  metrics: string[];
  sourceIds: string[];
  expiresAt: string;
  evidenceId: string;
}
```

`claim` 必须是一个可独立引用、可校验边界的短声明，而不是整篇文章。一个 Markdown 页面可以编译出多个 facts。

## 构建与校验流程

```text
Markdown wiki
  -> parse frontmatter
  -> validate metadata
  -> extract reviewed fact blocks
  -> validate sourceIds / expiresAt / reviewStatus
  -> write compiled JSON
  -> runtime load compiled facts
```

构建阶段必须失败的情况：

- 缺少 frontmatter。
- `id` 重复。
- `reviewStatus` 不是 `approved` 却试图进入 compiled facts。
- `sourceIds` 为空。
- `expiresAt` 已过期。
- 健康知识缺少 `riskLevel`。
- facts 中出现禁用的声明类型标记。
- `metrics` 使用了系统不支持的指标名。

首期不需要 LLM 自动抽取 fact。可以先用显式 fact block，保证可控：

```md
<!-- fact:start id=health-hrv-general-001 -->
HRV 可以作为恢复状态和自主神经系统压力的参考指标，但不能单独用于诊断疾病。
<!-- fact:end -->
```

## 运行时接入

### 新增 tools

```ts
queryKnowledgeFacts({
  metrics?: string[];
  intents?: string[];
  riskLevel?: 'general' | 'potential_risk' | 'safety_boundary';
  limit?: number;
})
```

返回：

```ts
{
  facts: KnowledgeFact[];
  evidenceIds: string[];
}
```

```ts
queryProductFacts({
  metrics?: string[];
  productAreas?: string[];
  limit?: number;
})
```

返回：

```ts
{
  facts: ProductFact[];
  evidenceIds: string[];
}
```

tools 只读取 compiled facts，不读取 Markdown 原文。tool 输出必须携带 `evidenceIds`，后续进入 prompt 和 verifier。

### Planner 行为

Advisor Chat planner 根据用户问题判断是否需要外部知识：

| 用户问题 | 知识需求 |
|----------|----------|
| “HRV 下降是什么意思？” | `queryKnowledgeFacts(metrics: ['hrv'], intents: ['explain_metric'])` |
| “今天能不能跑步？” | `queryKnowledgeFacts(intents: ['exercise_readiness'], riskLevel: 'safety_boundary')` |
| “这个睡眠图怎么读？” | `queryProductFacts(productAreas: ['chart'], metrics: ['sleep'])` |
| “为什么没有血氧数据？” | `queryProductFacts(productAreas: ['data_quality'], metrics: ['spo2'])` |

planner 不直接生成医学知识答案，只生成 knowledge evidence needs。solver 只能基于 packet 中的健康数据事实和 knowledge/product facts 组织回答。

### TaskContextPacket 扩展

首期建议在 `advisorChat.relevantFacts` 中新增 fact 类型：

```ts
factType: 'metric' | 'trend' | 'missing-data' | 'chart' | 'event' | 'memory' | 'knowledge' | 'product'
```

这里的 `memory` 是现有 context contract 中已经存在的 fact type，首期不新增用户长期记忆写入、检索或跨会话召回能力。

同时将 knowledge/product facts 注册到顶层 `evidence`：

```ts
{
  id: 'knowledge_health-hrv-general-001',
  source: 'knowledge_base',
  metric: 'hrv',
  derivation: 'compiled reviewed health knowledge fact health-hrv-general-001'
}
```

如果不希望首期扩大 `EvidenceFact.source` union，也可以在 implementation plan 中先新增 `KnowledgeEvidenceFact` 并由 renderer 单独输出。但最终方向应统一进 evidence 模型，避免 scorer 无法追溯。

## Prompt 渲染约束

知识 facts 渲染为独立 section：

```text
## Reviewed Knowledge Facts
- [knowledge_health-hrv-general-001] HRV 可以作为恢复状态参考，但不能单独诊断疾病。

## Product Facts
- [product_chart-token-guide_sleep] SLEEP_7DAYS 展示最近 7 天睡眠总时长趋势。
```

渲染规则：

- 只渲染 tool 返回的 facts。
- 每条 fact 必须带 evidence id。
- 不渲染未审核、过期或来源缺失的知识。
- 对 safety boundary fact，必须同步渲染 prohibited claims。
- 不把知识 facts 和用户健康数据混成同一种自然语言段落。

## 输出校验

verifier 需要新增检查：

| 检查 | 目的 |
|------|------|
| 健康知识声明必须引用 knowledge evidence id | 防止模型自由发挥医学解释 |
| 产品能力声明必须引用 product evidence id | 防止模型编造产品能力 |
| `prohibitedClaims` 不得出现在 summary/microTips | 防止诊断、用药、治疗承诺 |
| safety boundary 问题必须包含边界表达 | 保证高风险场景明确拒绝或转介 |
| 未命中 reviewed facts 时不得给确定性知识结论 | 防止无依据回答 |

首期 eval 应至少增加以下 case：

1. HRV 指标解释必须引用 reviewed health fact。
2. 运动准备度问题必须同时引用用户数据 evidence 和 safety boundary fact。
3. 图表说明必须引用 product fact 和 visible chart token。
4. 缺失血氧数据原因只能引用 product data quality fact，不得编造用户血氧数值。
5. 过期或未审核 wiki 页面不得进入 compiled facts。

## 错误处理原则

知识层不提供“自由发挥式降级”。如果没有匹配的 reviewed fact，Advisor Chat 应明确受限：

- 可以回答已存在的用户健康数据事实。
- 可以说明当前知识库没有足够依据解释该概念。
- 不可以让 LLM 基于模型内置知识补全医学或产品声明。

这不是用户体验层面的降级，而是知识可信边界。它应被 verifier 和 eval 锁住。

## 实施拆分建议

首期可以拆成四个小阶段：

1. **Schema 与样例知识源**：新增 wiki 目录、frontmatter schema、少量 HRV/睡眠/图表 token 样例。
2. **编译器**：解析 Markdown，生成 `knowledge-facts.json`、`product-facts.json`、`manifest.json`。
3. **运行时工具**：新增 `queryKnowledgeFacts`、`queryProductFacts`，接入 ReAct tools 白名单。
4. **Advisor Chat 集成与 eval**：planner 生成 knowledge needs，packet/render/verifier/eval 支持 knowledge evidence。

每个阶段都应单独提交，避免知识内容、编译器和 runtime 行为混在同一个提交里。

## 后续迭代

后续可以在不改变运行时 contract 的前提下增强检索实现：

- 从 metadata filter 升级到 BM25。
- 在本地或托管服务中增加 vector search。
- 对 compiled facts 做 hybrid retrieval 和 rerank。
- 增加 LLM-assisted wiki maintenance，但输出仍必须人工 review 后进入 compiled facts。
- 单独设计用户长期记忆层，再决定是否和 knowledge layer 在 planner 层汇合。

## 验收标准

首期完成时应满足：

- 至少有一组 health wiki 和 product wiki 样例。
- 未审核、过期、缺来源的知识不会进入 compiled facts。
- Advisor Chat 可以在 HRV、睡眠、图表说明、缺失数据解释场景查询知识 facts。
- 输出中的健康知识和产品声明可追溯到 evidence id。
- eval 覆盖知识引用、产品能力边界、缺失数据不编造、安全边界表达。
- 用户长期记忆没有进入本期 runtime 和 schema。
