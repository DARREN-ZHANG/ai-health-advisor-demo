# Homepage Baseline Language Implementation Guide

## 1. 文档定位

本文档用于指导初级工程师优化首页「实时简报」中关于 `baseline` 的用户可见表达。

本次改动的目标不是删除内部 baseline 能力，而是把它从用户文案中的工程术语，转译为用户能理解、能行动的健康表达。

执行完成后：

- Agent 内部仍可使用 baseline 参与规则判断、上下文构建、图表参考线和趋势解释。
- 首页实时简报的 `summary`、`microTips` 不应直接出现「基线」「基准线」「baseline」「偏离基线」等术语。
- 用户可见表达应改为「比你平时水平低」「相比近期通常水平」「比平常少睡约 X 分钟」等自然语言。
- 评测 fixture 和 prompt 示例不能继续强化旧表达。

## 2. 当前问题结论

当前系统里存在两类 baseline：

1. **用户健康指标 baseline**
   - 来源：`data/sandbox/profiles/*.json` 的 `profile.baseline`
   - 字段：`restingHr`、`hrv`、`spo2`、`avgSleepMinutes`、`avgSteps`
   - 用途：生成沙盒历史数据、构建 Agent context、作为规则阈值参考、作为图表参考线。

2. **沙盒 timeline baseline script**
   - 来源：`data/sandbox/timeline-scripts/*.json` 的 `source: "baseline_script"`
   - 用途：表示 demo 初始状态里已有的活动片段，例如昨夜睡眠事件。
   - 与首页文案中「基线」反复出现的问题没有直接关系。

首页文案反复出现「基线」的直接原因是第一类 baseline 被直接暴露给 LLM：

- `packages/agent-core/src/prompts/system-builder.ts` 输出「基线参考值」。
- `packages/agent-core/src/prompts/context-packet-renderer.ts` 输出「基线 X，偏离 Y%」。
- `data/sandbox/prompts/homepage.md` 示例中明确写了「低于基线40%」。
- `packages/agent-core/src/rules/homepage-rules.ts` 的规则消息包含「低于基线」。
- 多个 homepage eval fixture 的 `modelFixture.content` 包含「基线」或「基准线」。

## 3. 产品判断

Agent 应该在内部使用个人参考水平，但不应该在首页实时简报中直接对用户说「高于基线」「低于基线」。

原因：

- 「基线」是分析和工程术语，不是普通用户的自然健康语言。
- 首页实时简报篇幅短，应该优先告诉用户当前状态、影响和行动建议。
- 仅说明「低于基线 40%」不能直接回答用户最关心的「这意味着什么」和「我今天该怎么做」。
- 对 SpO2 等安全相关指标，优先表达是否处于正常范围或是否需要关注，不应主要强调个人 baseline 差异。

推荐表达原则：

| 内部含义 | 不推荐用户文案 | 推荐用户文案 |
| --- | --- | --- |
| 睡眠时长低于 baseline | 低于基线 40% | 比你平时少睡了约 3 小时 |
| HRV 低于 baseline | HRV 远低于基准线 | HRV 明显低于你近期通常水平 |
| 静息心率高于 baseline | 静息心率高于基线 | 静息心率比平时偏高 |
| 步数低于 baseline | 步数低于基线 | 今天活动量少于你平常水平 |
| SpO2 低于 baseline | 血氧低于基线 | 血氧低于正常范围，建议持续观察 |

## 4. 改动范围

本次改动应覆盖以下文件类别：

1. 首页 prompt
   - `data/sandbox/prompts/homepage.md`

2. Agent 上下文渲染
   - `packages/agent-core/src/prompts/context-packet-renderer.ts`
   - 必要时同步调整测试：`packages/agent-core/src/__tests__/prompts/context-packet-renderer.test.ts`

3. 首页规则消息
   - `packages/agent-core/src/rules/homepage-rules.ts`
   - 必要时同步调整测试：`packages/agent-core/src/__tests__/rules/homepage-rules.test.ts`

4. Eval fixture
   - `packages/agent-core/evals/cases/core/homepage/*.json`
   - `packages/agent-core/evals/cases/smoke/homepage-*.json`
   - `packages/agent-core/evals/cases/quality/homepage/*.json`

5. 必要时补充测试或 scorer
   - 如果现有 scorer 没有禁止术语检测，可新增聚焦测试，确保 homepage 输出不含「基线」「基准线」「baseline」。

不要修改以下内容，除非后续任务明确要求：

- `data/sandbox/profiles/*.json`
- `data/sandbox/history/*.json`
- `data/sandbox/timeline-scripts/*.json`
- sandbox 历史数据生成器中的 baseline 逻辑
- 图表 baseline 线能力

这些内容属于数据建模和图表/规则内部语义，不是本次用户文案问题的根因。

## 5. 实施步骤

### 5.1 修改首页 prompt

文件：`data/sandbox/prompts/homepage.md`

处理要求：

1. 删除或替换所有鼓励用户可见文案使用「基线」的示例。
2. 在 `summary 写作规范` 中增加一条明确约束：
   - 首页 `summary` 禁止直接使用「基线」「基准线」「baseline」「偏离基线」。
   - 如需引用个人参考水平，必须转译为「比你平时」「相比近期通常水平」「较平常」。
3. 修改 `statusColor 判定规则`，保留内部判断语义，但避免让 prompt 暗示输出术语。

示例改法：

```md
- 用具体数据支撑判断（如「深睡仅45分钟，比你平时明显偏少」）
```

```md
- **warning（黄）**：最近事件与24h恢复状态存在轻微冲突，或单一指标相对个人通常水平明显异常
```

### 5.2 修改 context packet 用户可见渲染

文件：`packages/agent-core/src/prompts/context-packet-renderer.ts`

当前问题：

- `renderUserContext()` 会输出「## 基线参考值」。
- `renderHomepage()` 会输出「（基线 X，偏离 Y%）」。
- `renderMetricSummary()` 会输出英文 `baseline ...`。

推荐处理：

1. `renderUserContext()` 中的 section 标题改为内部语义更清楚、但不诱导用户照抄的名称，例如：
   - `## 个人参考水平（内部分析用，不要原样写给用户）`

2. 指标行避免「HRV 基线」这种写法，改为：
   - `- 静息心率通常水平：...`
   - `- HRV 通常水平：...`
   - `- SpO2 参考水平：...`
   - `- 平均睡眠：...`
   - `- 平均步数：...`

3. `renderHomepage()` 的 latest24h metrics 不再渲染「基线」字样。可以改为：
   - `（相对平时 -18%）`
   - `（比平时约低 18%）`

4. `renderMetricSummary()` 的英文 `baseline` 改为 `usual level` 或中文「通常水平」。建议统一用中文，降低 LLM 输出英文术语的概率。

注意：

- 这里不是删除 `baseline` 数据字段，而是修改 prompt 文本渲染。
- 不要通过输出后正则替换来“清洗”文案。这会掩盖根因，也可能破坏合法上下文。

### 5.3 修改首页规则消息

文件：`packages/agent-core/src/rules/homepage-rules.ts`

当前问题：

```ts
message: '昨晚睡眠时长严重不足（低于基线 40% 以上），认知能力将受显著影响'
```

推荐改为：

```ts
message: '昨晚睡眠时长严重不足（比平时少 40% 以上），认知能力将受显著影响'
```

如果规则里只有百分比，没有绝对分钟差，也可以先用百分比表达。但当上下文里已有 `sleepMinutes` 和 `baseline` 时，优先考虑补充更自然的绝对差值：

```ts
const sleepShortfallMin = Math.round(baseline - sleepMinutes);
message: `昨晚睡眠时长严重不足（比平时少约 ${sleepShortfallMin} 分钟），认知能力将受显著影响`
```

这里要注意：

- 只有 `sleepShortfallMin > 0` 时才这么写。
- 不要为了文案好看引入硬编码或随意修正数据。
- 不要把所有指标都统一套同一种句式，不同指标应保留各自语义。

### 5.4 修改 eval fixture

需要搜索：

```bash
rg -n "基线|基准线|baseline|偏离基线" packages/agent-core/evals/cases
```

重点处理 homepage 类 case：

- `packages/agent-core/evals/cases/core/homepage/*.json`
- `packages/agent-core/evals/cases/smoke/homepage-*.json`
- `packages/agent-core/evals/cases/quality/homepage/*.json`

处理要求：

1. 如果 `modelFixture.content.summary` 是首页实时简报，替换用户可见「基线/基准线」表达。
2. 不要为了通过测试删除关键健康事实，应保留原本的指标、风险和建议。
3. 如果 `tags` 里有 `"baseline"`，可以保留。tag 是测试分类，不是用户文案。
4. 非 homepage 的 advisor chat / view summary 可以暂不全量改，但如果该 case 明确测试首页上下文，也应同步处理。

示例：

```json
"summary": "HRV 持续处于极低水平，本周平均值仅约十八毫秒，明显低于你近期通常水平，身体承受较大压力且恢复能力显著下降。建议充分休息，避免剧烈运动和过度劳累，若持续未见改善建议就医观察，由专业医生进一步评估。"
```

### 5.5 更新或新增测试

最低要求：

1. 更新因文案变化失败的现有单元测试。
2. 增加一个 homepage prompt/context 级别测试，确保渲染后的首页任务上下文不再包含用户可见诱导短语：
   - `低于基线`
   - `高于基线`
   - `偏离基线`
   - `基准线`
   - `baseline`

推荐新增测试位置：

- `packages/agent-core/src/__tests__/prompts/context-packet-renderer.test.ts`

测试意图：

- 不要求内部字段名消失。
- 只要求渲染给 LLM 的自然语言上下文不再诱导首页简报输出这些词。

示例断言方向：

```ts
expect(rendered).not.toContain('偏离基线');
expect(rendered).not.toContain('基准线');
expect(rendered).not.toContain('baseline');
```

如果上下文里仍需要一个 section 标题表达内部参考值，应避免使用 `baseline` 英文和「基准线」；「个人参考水平」或「通常水平」更合适。

## 6. 验收标准

工程验收：

- `rg -n "低于基线|高于基线|偏离基线|基准线|baseline" data/sandbox/prompts/homepage.md packages/agent-core/src/prompts packages/agent-core/src/rules/homepage-rules.ts packages/agent-core/evals/cases/core/homepage packages/agent-core/evals/cases/smoke packages/agent-core/evals/cases/quality/homepage` 不应在首页用户可见文案路径中命中旧表达。
- `baseline` 类型、profile 字段、图表 reference line、数据生成器中的内部字段可以继续存在。
- 首页 `summary` fixture 中不再出现「基线」「基准线」「baseline」。

测试验收：

```bash
pnpm --filter @health-advisor/agent-core test
```

如果全量测试耗时较长，至少运行：

```bash
pnpm --filter @health-advisor/agent-core test -- context-packet-renderer homepage-rules
```

人工验收：

1. 打开首页实时简报。
2. 切换多个 profile。
3. 触发 HRV 低、睡眠不足、活动不足、SpO2 异常等场景。
4. 检查简报：
   - 不出现「基线」「基准线」「baseline」。
   - 保留具体数据。
   - 明确说明影响。
   - 给出可执行建议。

## 7. 推荐提交拆分

建议初级工程师按以下顺序分小提交：

1. `docs(agent): document homepage baseline language policy`
2. `fix(agent): avoid baseline jargon in homepage prompt context`
3. `fix(agent): rewrite homepage rule messages without baseline jargon`
4. `test(agent): update homepage baseline language fixtures`

如果一次性完成，也可以合并为一个提交：

```bash
git commit -m "fix(agent): avoid baseline jargon in homepage brief"
```

提交前必须确认：

- 没有提交 `data/sandbox/history/*.json` 等无关生成数据。
- 没有通过输出后处理或正则清洗掩盖 prompt 问题。
- 没有删除 baseline 的内部分析能力。

## 8. 常见错误

1. **只改 prompt，不改 renderer**
   - LLM 仍会从 context 中看到「基线 X，偏离 Y%」，然后继续照抄。

2. **只改代码，不改 eval fixture**
   - fake provider 的 fixture 仍会输出旧文案，评测和示例会继续污染后续优化方向。

3. **把 baseline 字段从类型里删除**
   - 这会破坏规则、图表和数据生成能力，不属于本次目标。

4. **用 safety cleaner 或 response parser 替换敏感词**
   - 这是后处理补丁，不是忠实的一般算法。应从 prompt、context 和 fixture 源头解决。

5. **把所有指标都改成“正常范围”**
   - HRV、静息心率、睡眠、步数适合参考个人通常水平。
   - SpO2 更适合优先参考健康范围和风险阈值。

## 9. 最终目标示例

不推荐：

> HRV 远低于基准线，睡眠低于基线 40%，建议休息。

推荐：

> HRV 明显低于你近期通常水平，昨晚睡眠也比平时少了约 3 小时，说明身体恢复不足。今天建议降低运动强度，优先安排轻量活动和午间短休。

不推荐：

> 深睡仅45分钟，低于基线40%。

推荐：

> 深睡只有45分钟，比你平时明显偏少，今天可能更容易疲劳，建议避免高强度训练。
