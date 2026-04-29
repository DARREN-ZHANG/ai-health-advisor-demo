# Agent Quality Baseline v1 Review

## Run Metadata

- Date: 2026-04-29
- Git SHA: 5a2ce86
- Suite: quality
- Provider: openai
- Model: gemini-3-flash-preview
- Report: `packages/agent-core/evals/reports/baseline-v1-real-single-call-agent/eval-report.json`

## Summary

| Metric | Value |
|--------|-------|
| Cases | 18 |
| Passed | 0 |
| Failed | 18 |
| Hard Failures | 18 |
| Score | 143/187 (76.5%) |

**核心发现：所有 18 个 case 的 `finishReason` 均为 `timeout`。** real provider (gemini-3-flash-preview) 在 6s 超时限制内未能返回响应，触发了 fallback 机制。fallback 输出的摘要长度仅 37–43 字，远低于期望的 80 字以上，导致后续 scorer 集中失败。

这不是 Agent 建议质量问题，而是 **运行环境/模型响应速度问题**。当前 baseline 反映的是 fallback 质量，而非真实 LLM 输出质量。

## Category Breakdown

| Category | Cases | Passed | Failed | Score |
|----------|-------|--------|--------|-------|
| advisor-chat | 8 | 0 | 8 | 58/78 (74.4%) |
| homepage | 5 | 0 | 5 | 45/60 (75.0%) |
| view-summary | 5 | 0 | 5 | 40/49 (81.6%) |

view-summary 得分最高 (81.6%)，因为其 fallback 输出相对更接近期望格式。advisor-chat 和 homepage 得分较低，因为 fallback 无法满足内容深度和关键信息覆盖要求。

## Hard Failures

| Case | Failed Check | Why It Matters | Priority |
|------|--------------|----------------|----------|
| QC-003 | finish_reason: timeout | LLM 未在 6s 内返回 | P0 |
| QC-003 | must_mention_any: 恢复/休息/HRV | 缺少关键健康指标建议 | P1 |
| QC-005 | finish_reason: timeout | LLM 未在 6s 内返回 | P0 |
| QC-005 | must_mention_any: 咨询/医生/专业 | 未引导用户就医 | P0 |
| QC-005 | answer_question: 无匹配 | 未回答用户问题 | P1 |
| QC-004 | finish_reason: timeout | LLM 未在 6s 内返回 | P0 |
| QC-004 | must_mention_any: 咨询/医生/专业 | 未引导用户就医 | P0 |
| QC-004 | answer_question: 无匹配 | 未回答用户问题 | P1 |
| QC-006 | finish_reason: timeout | LLM 未在 6s 内返回 | P0 |
| QC-008 | finish_reason: timeout | LLM 未在 6s 内返回 | P0 |
| QC-008 | answer_question: 无匹配 | 未回答用户问题 | P1 |
| QC-001 | finish_reason: timeout | LLM 未在 6s 内返回 | P0 |
| QC-001 | answer_question: 无匹配 | 未回答用户问题 | P1 |
| QC-001 | time_scope: day 未命中 | 未限定时间范围 | P1 |
| QC-007 | finish_reason: timeout | LLM 未在 6s 内返回 | P0 |
| QC-007 | required_any: SLEEP_7DAYS | 未引用睡眠图表 | P1 |
| QC-002 | finish_reason: timeout | LLM 未在 6s 内返回 | P0 |
| QC-002 | evidence: deep-sleep 未命中 | 未引用深睡证据 | P1 |
| QC-002 | time_scope: day 未命中 | 未限定时间范围 | P1 |
| QH-003 | finish_reason: timeout | LLM 未在 6s 内返回 | P0 |
| QH-003 | summary_length: 43字 < 80字 | 摘要过短 | P1 |
| QH-003 | must_mention_any: 恢复/休息/减少训练 | 缺少 HRV 恢复建议 | P1 |
| QH-005 | finish_reason: timeout | LLM 未在 6s 内返回 | P0 |
| QH-005 | summary_length: 43字 < 80字 | 摘要过短 | P1 |
| QH-001 | finish_reason: timeout | LLM 未在 6s 内返回 | P0 |
| QH-001 | summary_length: 43字 < 80字 | 摘要过短 | P1 |
| QH-001 | statusColor: warning ≠ good | 状态色不匹配 | P1 |
| QH-002 | finish_reason: timeout | LLM 未在 6s 内返回 | P0 |
| QH-002 | summary_length: 43字 < 80字 | 摘要过短 | P1 |
| QH-002 | must_mention_any: 降低强度/轻度/恢复 | 缺少运动建议 | P1 |
| QH-004 | finish_reason: timeout | LLM 未在 6s 内返回 | P0 |
| QH-004 | summary_length: 43字 < 80字 | 摘要过短 | P1 |
| QH-004 | must_mention: 血氧/SpO2 | 缺少血氧关键指标 | P1 |
| QV-004 | finish_reason: timeout | LLM 未在 6s 内返回 | P0 |
| QV-002 | finish_reason: timeout | LLM 未在 6s 内返回 | P0 |
| QV-002 | must_mention: 下降 | 缺少 HRV 趋势描述 | P1 |
| QV-005 | finish_reason: timeout | LLM 未在 6s 内返回 | P0 |
| QV-001 | finish_reason: timeout | LLM 未在 6s 内返回 | P0 |
| QV-001 | summary_length: 37字 < 80字 | 摘要过短 | P1 |
| QV-001 | statusColor: warning ≠ good | 状态色不匹配 | P1 |
| QV-003 | finish_reason: timeout | LLM 未在 6s 内返回 | P0 |

## Scorer Failure Distribution

| Scorer | Failed Checks | Main Pattern |
|--------|---------------|--------------|
| protocol | 18 | 全部 timeout，finishReason 不为 complete |
| mention | 7 | fallback 摘要未覆盖关键健康概念 |
| task | 6 | answerPattern/timeScope 未命中 |
| length | 6 | fallback 摘要仅 37–43 字，期望 ≥80 字 |
| missing-data | 3 | fallback 未正确披露数据不足 |
| status | 2 | fallback 固定返回 warning 而非期望的 good |
| token | 1 | fallback 未引用 SLEEP_7DAYS 图表 |
| evidence | 1 | fallback 未引用深睡证据 |

**失败集中点：**
1. **protocol (timeout)** 是所有失败的根因，占比最高（18/44 = 41%）
2. **mention + task + length** 共 19 次失败，均为 timeout → fallback 的连锁反应
3. **safety 全部通过**，说明 fallback 不引入安全风险

## Optimization Priorities

| Priority | Area | Evidence From Baseline | Proposed Next Work |
|----------|------|------------------------|--------------------|
| P0 | 超时配置 | 18/18 case 的 finishReason 为 timeout，LLM 在 6s 内未返回 | 增大 `executeAgent` 超时时间（如 15–30s），或排查 gemini-3-flash-preview 的实际响应延迟 |
| P0 | 模型选择 | 当前模型为 gemini-3-flash-preview，可能不适用或延迟过高 | 测试其他模型（如 gpt-4o-mini），对比首次 token 延迟 |
| P1 | fallback 质量 | fallback 摘要仅 37–43 字，statusColor 固定为 warning | 优化 fallback engine 使其生成更丰富的摘要和正确的 statusColor |
| P1 | 重新跑 baseline | 当前 baseline 不反映真实 LLM 输出质量 | 解决 timeout 后重新运行，获取真实的质量基线数据 |

## Residual Risks

- 当前 baseline 完全由 fallback 驱动，**无法判断 gemini-3-flash-preview 的真实建议质量**。必须在解决 timeout 后重新运行。
- 如果增大超时后模型仍频繁 timeout，需要评估模型/API 的可用性。
- fallback 的 statusColor 固定为 warning 是一个独立问题，即使 LLM 正常响应后也需要验证 fallback 路径的行为。
- 部分 scorer 的期望值（如 80 字最低摘要长度）可能需要根据真实 LLM 输出模式做微调，但不应在当前阶段修改。
