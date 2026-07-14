# Realtime Brief Agent Perspective Implementation Plan

> **For agentic workers:** Implement this plan task-by-task, keep the checkbox state current, and commit after every task card. Do not combine unrelated task cards into one commit.

**Goal:** 让 Mock Timeline 只提供隐藏测试真值，保证 Agent 仅根据同步后的穿戴设备时序识别事件；同时确保所有传感器推断事件使用概率性表达，内部评分和系统能力说明永不进入客户可见回复，并将英文实时简报统一为 90–180 words。

**Architecture:** 将当前单一 Timeline 数据流拆成“模拟真值通道”和“传感器观察通道”。真值通道保留 `ActivitySegment.type` 与精确边界，仅供 God Mode 展示、离线校准和评测；识别器只接收不含类型与语义 ID 的观察序列，产出带来源和校准置信度的 `RecognizedEvent`。Agent Core 在内部分析包与 LLM prompt 之间新增 customer-facing projection，只允许公开事件确定性分层、具有物理意义的数值和定性派生结论。

**Tech Stack:** TypeScript, pnpm, Vitest, Zod, existing `@health-advisor/shared`, `@health-advisor/sandbox`, `@health-advisor/agent-core`, `@health-advisor/agent-api`.

---

## Implementation Status（2026-07-14）

本计划的功能实现已落地。任务 1.1–4.2 中原有的事件观察投影、无标签识别、离线校准、确定性档位、公开工具结论、阻断式发布门禁和唯一长度策略由主分支既有提交完成；本轮补齐了客户可见单位投影、自由文本评分入口收口、数值与单位联合归因，以及指标级单位 Eval。

| 任务 | 状态 | 主要实现/验证 |
| --- | --- | --- |
| 1.1 双通道数据契约 | 已完成 | `SensorObservation`、source/calibration schema；shared 191 tests、sandbox 372 tests 通过。 |
| 1.2 无标签事件识别 | 已完成 | 识别结果对 Timeline 标签/ID 重命名保持不变；sensor 推断不携带 `sourceSegmentId`。 |
| 1.3 校准与发布阈值 | 已完成 | calibration artifact 校验通过；低于 publish threshold 的候选不发布。 |
| 2.1 确定性语言契约 | 已完成 | possible/likely/reported 映射及中英文 prompt/content policy 测试通过。 |
| 3.1 CustomerFacingEvidencePacket | 已完成 | 新增 `customer-facing-unit-policy.ts`；sleep 全部转 `h`，其他物理量按注册表投影；未知组合 fail closed。 |
| 3.2 工具公开结论 | 已完成 | tool missing/error/empty 不进入公开 prompt；success 只投影客户可用 claim。 |
| 3.3 发布前内容门禁 | 已完成 | 数值与单位必须联合匹配 claim ledger；内部评分、能力说明和错误单位阻断发布。 |
| 4.1 长度策略 | 已完成 | 英文 90–180 words、中文 220–420 graphemes 的统一策略与边界测试通过。 |
| 4.2 回归验收 | 功能回归完成 | `H-040` 30/30、`H-041` 25/25；agent-core 1021 tests、agent-api 228 tests 通过。 |

本轮提交：

- `609a268 feat(agent-core): normalize customer-facing health units`
- `651fa10 chore(deps): add tsx for validation scripts`

仓库级验收基线仍有两组与本需求无关的既有失败，未在本轮扩展范围处理：72 个 core fixture 中 66 个旧 case 存在 hard failure；`pnpm validate` 的 fallback 文件仍使用 locale 顶层结构且缺少 `scenarios/manifest.json`。同一次数据校验中 profiles、history、timeline scripts、prompts 和 event calibration artifact 均通过。

---

## Context Summary

### 已确认的产品口径

- 所有由穿戴设备数据推断出的事件都必须采用概率性语言；只有用户主动记录或确认的事件可以确定表达。
- 低于该事件类型发布阈值的识别结果不进入实时简报，只保留内部观测。
- 所有无物理单位的派生分数均不得展示给客户，包括 motion intensity、stress load、sleep score、quality score 和事件 confidence 百分比。
- `bpm`、`ms`、`%`、`steps`、`h`、`min`、`km`、`kcal` 等具有明确物理含义的测量值仍可展示，但必须在进入 LLM 前转换为该指标最常用的展示单位。
- 睡眠总时长、平均睡眠时长和 deep/light/REM/awake 睡眠阶段时长统一使用 `h`，不得在 LLM Response 中以 `min` 展示。
- 非睡眠持续时间小于 60 分钟时使用 `min`，达到 60 分钟时转换为 `h`；内部存储和计算继续使用原始分钟值。
- 英文 homepage summary 使用 90–180 words；中文继续使用 220–420 graphemes。
- 缺少工具结果、算法能力或估算能力时保持静默，不向客户解释系统为何不能计算。
- 客户边界违规必须 fail closed：不得发布、缓存或写入 memory；禁止通过字符串替换修补模型原文。

### 当前根因

1. `packages/sandbox/src/helpers/event-recognition.ts` 的 `extractGodModeType()` 会从 `seg-gm-{type}-...` 读取 Mock 真值，直接返回对应事件并设置 `confidence=1.0`。
2. 当前识别器还通过 `segmentId` 获得 Mock 片段的精确起止边界，因此即使移除类型解析，仍保留边界上的上帝视角。
3. `packages/agent-core/src/context/homepage-event-window.ts` 将 `motion` 和 `stress_load` 定义为 `unit: 'score'`，`context-packet-renderer.ts` 又把 average/max/latest 全部渲染给 LLM，图 2 的 3.9/9.7 由此产生。
4. 生效的 `data/sandbox/prompts/homepage/template.md` 告诉模型“没有工具结果时不得估算”，`realtime-brief-tool-orchestrator.ts` 还会渲染 tool name、policyId、status、reason 和 error；模型因此会复述“没有算法/无法估算”等内部说明。
5. 英文 prompt 和 eval 当前要求 150–300 words，但 runtime verifier 只做 `summary.length > 500` 的 locale-agnostic soft check，且普通 homepage 场景不会因此阻断输出。
6. `verifyOutput()` 在普通场景只是观测机制；hard violation 不会自动阻止 memory、cache 或 API 返回。
7. `metric-summary.ts`、`context-packet-builder.ts` 和 `context-packet-renderer.ts` 当前把 `avgSleepMinutes`、`sleep_total`、`sleep_deep`、`sleep_rem` 作为 `min` 直接渲染，而图表层 `CHART_TOKEN_META.SLEEP_7DAYS` 已使用 `h`，同一指标在 LLM 与 UI 之间单位不一致。

### 非目标

- 不改变前端 `AgentResponseEnvelope` 的客户可见字段。
- 不把 Mock Timeline 的隐藏标签重新包装成“算法结果”。
- 不新增正则替换、文本截断或固定兜底文案来掩盖违规回复。
- 不改动当前工作区中用户已有的 `data/sandbox/history`、`profiles` 和 `timeline-scripts` 未提交内容。
- 不修改 `SleepData.totalMinutes`、`SleepStages`、`activeMinutes` 或 `durationMinutes` 的内部存储单位；本计划只规范 customer-facing projection 和 LLM Response。

---

## File Structure

| 文件 | 职责 |
| --- | --- |
| `packages/shared/src/types/sandbox.ts` / `schemas/sandbox.ts` | 增加事件识别来源与校准状态契约。 |
| `packages/sandbox/src/helpers/sensor-observation.ts` | 新建真值到无标签传感器观察的投影。 |
| `packages/sandbox/src/helpers/event-recognition.ts` | 删除标签/边界快速路径，改为从观察序列产生候选事件。 |
| `packages/sandbox/src/helpers/event-calibration.ts` | 新建每类事件的校准与发布阈值逻辑。 |
| `packages/sandbox/src/calibration/event-recognition.json` | 保存离线校准后的每类发布阈值和可发布状态。 |
| `packages/agent-core/src/context/customer-facing-evidence.ts` | 新建内部分析包到客户可见事实包的类型安全投影。 |
| `packages/agent-core/src/context/customer-facing-unit-policy.ts` | 新建按指标语义转换、舍入和格式化的唯一 LLM 展示单位注册表。 |
| `packages/agent-core/src/context/context-packet.ts` | 增加 `EventCertaintyBand` 和公开事实类型。 |
| `packages/agent-core/src/context/context-packet-builder.ts` | 过滤低置信度事件并建立公开事件事实。 |
| `packages/agent-core/src/prompts/context-packet-renderer.ts` | 仅渲染公开事实，不再渲染内部评分和标识符。 |
| `packages/agent-core/src/runtime/realtime-brief-tool-orchestrator.ts` | 分离内部工具执行记录与客户可见成功结论。 |
| `packages/agent-core/src/policies/homepage-length-policy.ts` | 新建 locale-aware 唯一长度策略和计数器。 |
| `packages/agent-core/src/output/realtime-brief-content-policy.ts` | 新建发布前客户边界校验。 |
| `packages/agent-core/src/runtime/agent-runtime.ts` | 在 memory/cache/API 之前执行阻断式验证和一次重生成。 |
| `data/sandbox/prompts/homepage/template.md` | 对齐概率措辞、静默缺失和 3 段式摘要契约。 |
| `packages/agent-core/evals/cases/core/homepage/` | 增加截图对应的事件措辞、评分泄漏和元说明回归用例。 |

---

## 模块 1：模拟真值隔离与事件识别

**目标：** 确保运行时事件类型、边界和置信度仅来自无标签穿戴时序，Timeline 标签只作为离线 ground truth。

**依赖：** 无。

**产出：**

- [ ] 识别器无法读取 Mock 事件类型或精确片段边界。
- [ ] `RecognizedEvent` 明确区分传感器推断和用户主动记录。
- [ ] 每类传感器事件具有经离线数据校准的发布阈值。

### 任务 1.1：定义双通道数据契约并移除语义 ID 泄漏

**所属模块：** 模块 1 - 模拟真值隔离与事件识别

**目标：** 建立只包含设备观察字段的 `SensorObservation`，并为识别结果增加明确来源。

**前置条件：** 无。

**涉及文件：**

- 修改：`packages/shared/src/types/sandbox.ts`
- 修改：`packages/shared/src/schemas/sandbox.ts`
- 创建：`packages/sandbox/src/helpers/sensor-observation.ts`
- 修改：`packages/sandbox/src/index.ts`
- 测试：`packages/shared/src/__tests__/schemas.test.ts`
- 创建：`packages/sandbox/src/__tests__/helpers/sensor-observation.test.ts`

**上下文：**

`DeviceEvent.eventId` 和 `DeviceEvent.segmentId` 当前都可能包含 `meal_intake`、`steady_cardio` 等语义。新的识别输入不得包含这两个字段；原始 `DeviceEvent` 仍可留在模拟器内部用于删除片段和数据追踪。

新增契约：

```ts
export type RecognitionSource = 'sensor_inference' | 'user_report';

export interface SensorObservation {
  observationId: string;
  profileId: string;
  measuredAt: string;
  metric: DeviceMetric;
  value: number | string | boolean;
}

export interface RecognizedEvent {
  // existing fields
  recognitionSource: RecognitionSource;
  calibrationStatus: 'calibrated' | 'not_applicable';
}
```

`SensorObservation.observationId` 必须由 profile、时间、metric 和同分钟序号生成稳定 opaque hash；hash 输入不得包含 `ActivitySegment.type`、`segmentId` 或 `scenarioId`。用户主动记录的 micro event 不转换为 `SensorObservation`，而是通过独立的显式事件输入进入识别结果。

**实现步骤：**

- [ ] 在 shared type/schema 中增加 `RecognitionSource`、`SensorObservation` 和 `RecognizedEvent` 新字段，并更新所有现有构造器使 schema 无 optional 兼容分支。
- [ ] 实现 `projectDeviceEventsToSensorObservations(events)`：排序、生成 opaque ID、移除所有 segment 信息，并保持数值与时间不变。
- [ ] 增加不变量测试：改变 `segment.type`、`segmentId` 和 `eventId` 后，投影得到的 metric/time/value 序列完全相同，且任何字符串都不含活动类型。
- [ ] 保留 micro event 的显式用户来源，测试其 `recognitionSource === 'user_report'`、`calibrationStatus === 'not_applicable'`。

**验证方式：**

```bash
pnpm --filter @health-advisor/shared test -- src/__tests__/schemas.test.ts
pnpm --filter @health-advisor/sandbox test -- src/__tests__/helpers/sensor-observation.test.ts
```

预期结果：测试通过；无标签观察中不存在 `segmentId`、原始 `eventId` 或活动类型字符串。

**提交说明：**

```bash
git add packages/shared/src/types/sandbox.ts packages/shared/src/schemas/sandbox.ts packages/shared/src/__tests__/schemas.test.ts packages/sandbox/src/helpers/sensor-observation.ts packages/sandbox/src/__tests__/helpers/sensor-observation.test.ts packages/sandbox/src/index.ts
git commit -m "feat(sandbox): isolate sensor observations from timeline truth"
```

### 任务 1.2：用无标签时序生成事件候选窗口

**所属模块：** 模块 1 - 模拟真值隔离与事件识别

**目标：** 删除 God Mode 类型直读和 segment 分组分类，使事件边界和类型都由传感器观察序列产生。

**前置条件：**

- 任务 1.1 已完成，`SensorObservation` 和 `recognitionSource` 可用。

**涉及文件：**

- 修改：`packages/sandbox/src/helpers/event-recognition.ts`
- 修改：`packages/sandbox/src/helpers/caffeine-detector.ts`
- 修改：`packages/sandbox/src/helpers/alcohol-detector.ts`
- 修改：`apps/agent-api/src/modules/god-mode/service.ts`
- 修改：`packages/agent-core/src/evals/eval-runtime.ts`
- 测试：`packages/sandbox/src/__tests__/helpers/event-recognition.test.ts`

**上下文：**

`extractGodModeType()`、`extractMicroEventType()` 和 `groupBySegmentId()` 不能继续作为传感器推断路径。新的 `recognizeEvents` 输入应拆分为：

```ts
interface RecognizeEventsInput {
  observations: SensorObservation[];
  userReportedEvents: RecognizedEvent[];
  profileId: string;
  currentTime: string;
}
```

传感器路径采用以下固定算法：

1. 按一分钟聚合并基于 profile baseline 标准化 heart rate、HRV、motion、step rate、SpO2 和 stress load。
2. 使用 multivariate PELT change-point detection 生成连续候选窗口，segment cost 使用各维度 squared-error 之和，penalty 使用 BIC `featureCount * log(sampleCount)`。
3. 对每个候选窗口运行现有特征分类器以及 caffeine/alcohol detector；分类器不得接收 ID 或隐藏标签。
4. 使用 weighted interval scheduling 选择校准分数总和最高的非重叠候选集合，禁止使用标签优先级或事后覆盖规则。
5. 将 `userReportedEvents` 原样合并，并以显式来源与 sensor inference 区分。

**实现步骤：**

- [ ] 先添加失败测试：相同观察序列配上两个不同 Timeline 标签时，识别输出必须完全一致。
- [ ] 添加边界测试：20 分钟进餐样本不提供 segment 边界，识别器仍从变化点和窗口特征估算 start/end。
- [ ] 删除 `extractGodModeType()` 和传感器路径中的 `segmentId` 分组；微事件通过 `userReportedEvents` 合并，不再解析 micro segment ID。
- [ ] 实现一分钟标准化、PELT 候选窗口和 weighted interval scheduling；为纯函数分别增加单元测试。
- [ ] 修改 God Mode service 和 eval runtime，使二者都先建立无标签观察，再调用新签名。
- [ ] 确认 caffeine/alcohol detector 只读取 observation 的时间、metric 和 value。

**验证方式：**

```bash
pnpm --filter @health-advisor/sandbox test -- src/__tests__/helpers/event-recognition.test.ts
pnpm --filter @health-advisor/agent-api test -- src/__tests__/modules/god-mode
pnpm --filter @health-advisor/agent-core test -- src/__tests__/evals
```

预期结果：标签不变量、边界估算、咖啡因/饮酒混杂和显式 micro event 测试全部通过；不存在 `confidence=1.0 // god-mode` 分支。

**提交说明：**

```bash
git add packages/sandbox/src/helpers/event-recognition.ts packages/sandbox/src/helpers/caffeine-detector.ts packages/sandbox/src/helpers/alcohol-detector.ts packages/sandbox/src/__tests__/helpers/event-recognition.test.ts apps/agent-api/src/modules/god-mode/service.ts packages/agent-core/src/evals/eval-runtime.ts
git commit -m "feat(sandbox): infer timeline events from unlabeled samples"
```

### 任务 1.3：离线校准事件概率与发布阈值

**所属模块：** 模块 1 - 模拟真值隔离与事件识别

**目标：** 将现有经验分数转换为可解释的校准概率，并确保低可靠性事件不会进入简报。

**前置条件：**

- 任务 1.2 已完成，传感器识别器输出 raw score 和候选窗口。

**涉及文件：**

- 创建：`packages/sandbox/src/helpers/event-calibration.ts`
- 创建：`packages/sandbox/src/calibration/event-recognition.json`
- 创建：`packages/sandbox/src/__tests__/helpers/event-calibration.test.ts`
- 修改：`packages/sandbox/src/helpers/event-recognition.ts`
- 修改：`data/validate.ts`

**上下文：**

当前 `confidence` 是规则公式结果，并不是校准后的概率，不能直接解释为“98% 可能性”。校准数据由 Timeline generators 产生，但类型和边界仅在离线校准程序中作为 ground truth；按 profile/scenario 划分数据，禁止同一场景同时出现在拟合与验证集合。

每类 artifact 必须包含：

```ts
interface EventCalibrationConfig {
  eventType: RecognizedEventType;
  publishable: boolean;
  publishThreshold: number;
  likelyThreshold: number;
  isotonicBuckets: Array<{ minRawScore: number; probability: number }>;
  validationPrecision: number;
  validationRecall: number;
}
```

阈值规则：在验证集上选择 precision 不低于 0.95 时 recall 最高的 operating point；`likelyThreshold` 是校准概率 0.8 对应的 raw score。达不到 0.95 precision 的类型写入 `publishable: false`，不得使用统一全局阈值。

**实现步骤：**

- [ ] 实现 per-event isotonic calibration 和 operating-point selection 纯函数。
- [ ] 用生成器构造正例、其他事件负例、相邻事件和咖啡因/饮酒/进餐混杂例，生成并提交 calibration artifact。
- [ ] 在 `recognizeEvents` 中保留 `rawScore` 供内部日志，使用 artifact 写入校准后的 `confidence`；不满足 publishable/threshold 的候选不返回。
- [ ] 扩展 `data/validate.ts`，校验概率单调、阈值范围、precision 条件和所有 sensor-inferred 类型均有配置。
- [ ] 测试低于阈值的 meal/caffeine/alcohol/workout 不进入结果，高于阈值时返回 `calibrationStatus: 'calibrated'`。

**验证方式：**

```bash
pnpm --filter @health-advisor/sandbox test -- src/__tests__/helpers/event-calibration.test.ts src/__tests__/helpers/event-recognition.test.ts
pnpm validate
```

预期结果：artifact 通过单调性和 precision 校验；低置信度事件不再进入 `RecognizedEvent[]`。

**提交说明：**

```bash
git add packages/sandbox/src/helpers/event-calibration.ts packages/sandbox/src/calibration/event-recognition.json packages/sandbox/src/__tests__/helpers/event-calibration.test.ts packages/sandbox/src/helpers/event-recognition.ts data/validate.ts
git commit -m "feat(sandbox): calibrate inferred event publication"
```

---

## 模块 2：事件确定性与用户措辞

**目标：** 把内部校准概率转换为有限、稳定的用户措辞契约，保证传感器事件永不被写成已确认事实。

**依赖：** 模块 1。

**产出：**

- [ ] 所有 sensor inference 只能映射为 `possible` 或 `likely`。
- [ ] 只有 user report 可以映射为 `reported` 并确定表达。
- [ ] 精确 confidence 不进入 LLM prompt 或 API envelope。

### 任务 2.1：增加 EventCertaintyBand 并贯穿 Homepage Context

**所属模块：** 模块 2 - 事件确定性与用户措辞

**目标：** 在 Agent Core 中用确定性枚举代替精确 confidence 参与文案生成。

**前置条件：**

- 任务 1.3 已完成，sensor inference 的 `confidence` 已校准且低于阈值的事件已过滤。

**涉及文件：**

- 修改：`packages/agent-core/src/context/context-packet.ts`
- 修改：`packages/agent-core/src/context/context-packet-builder.ts`
- 修改：`packages/agent-core/src/context/homepage-event-insights.ts`
- 修改：`packages/agent-core/src/prompts/context-packet-renderer.ts`
- 修改：`data/sandbox/prompts/system.md`
- 修改：`data/sandbox/prompts/homepage/template.md`
- 测试：`packages/agent-core/src/__tests__/context/context-packet-builder.test.ts`
- 测试：`packages/agent-core/src/__tests__/prompts/context-packet-renderer.test.ts`

**上下文：**

新增类型：

```ts
export type EventCertaintyBand = 'possible' | 'likely' | 'reported';
```

映射规则固定为：

- `recognitionSource === 'user_report'` → `reported`。
- `sensor_inference && confidence >= 0.8` → `likely`。
- 其余已通过发布阈值的 `sensor_inference` → `possible`。

语言契约：

| Band | 中文 | English |
| --- | --- | --- |
| possible | 可能、似乎、数据有些像 | may have, may be consistent with |
| likely | 大概率、很像、数据显示很可能 | likely, strongly consistent with |
| reported | 你记录了、你刚完成了 | you logged, you completed |

**实现步骤：**

- [ ] 给 `RecentEventPacket` 和 `HomepageEventInsight` 增加必填 `certaintyBand`，保留内部 `confidence` 但禁止 renderer 使用。
- [ ] 在 packet builder 中实现唯一映射函数 `toEventCertaintyBand(event)` 并导出供测试使用。
- [ ] 将 `renderDisplayableHomepageEvent()` 的“raw event type”和 exact confidence 替换为 certainty band、观察时间窗和概率性事件描述。
- [ ] 更新 system/homepage prompt：所有 sensor inference 即使为 likely 也不得使用 confirmed/completed/刚刚吃完等断言；不向客户显示概率百分比。
- [ ] 添加中英文 prompt snapshot：meal 0.79 使用 possible，meal 0.98 使用 likely，两者都不出现确定性断言；user report 使用 reported。

**验证方式：**

```bash
pnpm --filter @health-advisor/agent-core test -- src/__tests__/context/context-packet-builder.test.ts src/__tests__/prompts/context-packet-renderer.test.ts
```

预期结果：所有测试通过；渲染文本不含 `confidence 98%`，但包含对应 certainty band 和概率性写作要求。

**提交说明：**

```bash
git add packages/agent-core/src/context/context-packet.ts packages/agent-core/src/context/context-packet-builder.ts packages/agent-core/src/context/homepage-event-insights.ts packages/agent-core/src/prompts/context-packet-renderer.ts packages/agent-core/src/__tests__/context/context-packet-builder.test.ts packages/agent-core/src/__tests__/prompts/context-packet-renderer.test.ts data/sandbox/prompts/system.md data/sandbox/prompts/homepage/template.md
git commit -m "feat(agent-core): calibrate language for inferred events"
```

---

## 模块 3：客户可见 Context 与发布门禁

**目标：** 通过类型安全的数据最小化阻止内部评分和系统元信息进入 LLM，并在发布前阻断任何客户边界违规。

**依赖：** 模块 2。

**产出：**

- [ ] 所有无物理单位派生分只以定性结论进入生成上下文。
- [ ] 所有公开数值在进入 LLM 前已转换成指标最常用的展示单位，sleep 始终使用 `h`。
- [ ] 工具错误、缺失和内部执行信息不进入生成上下文。
- [ ] 违规响应在 memory/cache/API 之前被阻断，不进行字符串清洗。

### 任务 3.1：建立 CustomerFacingEvidencePacket

**所属模块：** 模块 3 - 客户可见 Context 与发布门禁

**目标：** 在内部 `TaskContextPacket` 与 prompt renderer 之间增加不可表示内部 score 的公开事实类型。

**前置条件：**

- 任务 2.1 已完成，公开事件具有 certainty band。

**涉及文件：**

- 创建：`packages/agent-core/src/context/customer-facing-evidence.ts`
- 创建：`packages/agent-core/src/context/customer-facing-unit-policy.ts`
- 修改：`packages/agent-core/src/context/context-packet.ts`
- 修改：`packages/agent-core/src/prompts/context-packet-renderer.ts`
- 修改：`packages/agent-core/src/prompts/task-builder.ts`
- 修改：`packages/agent-core/src/index.ts`
- 修改：`data/sandbox/prompts/homepage/style/en.md`
- 修改：`data/sandbox/prompts/homepage/style/zh.md`
- 创建：`packages/agent-core/src/__tests__/context/customer-facing-evidence.test.ts`
- 创建：`packages/agent-core/src/__tests__/context/customer-facing-unit-policy.test.ts`
- 测试：`packages/agent-core/src/__tests__/prompts/context-packet-renderer.test.ts`

**上下文：**

公开数值类型必须使用封闭单位集合：

```ts
export type PublicMetricUnit = 'bpm' | 'ms' | '%' | 'steps' | 'h' | 'min' | 'km' | 'kcal';

export interface PublicNumericFact {
  kind: 'numeric';
  metric: string;
  value: number;
  unit: PublicMetricUnit;
  interpretation: string;
  evidenceId: string;
}

export interface PublicQualitativeFact {
  kind: 'qualitative';
  metric: string;
  qualifier: 'low' | 'normal' | 'elevated' | 'compressed' | 'recovering' | 'volatile';
  interpretation: string;
  evidenceId: string;
}
```

`motion`、`stress_load`、sleep score、quality score 和 confidence 必须映射为 `PublicQualitativeFact`；不得存在 `unit: 'score'` 的公开类型。该投影应用于 homepage、view summary 和 advisor chat，避免同一内部分数从其他入口泄漏。

公开单位由 `customer-facing-unit-policy.ts` 的注册表按 metric 决定，禁止仅根据上游 `unit` 字符串透传：

| 指标 | 内部值 | LLM/Response 展示 | 舍入与格式 |
| --- | --- | --- | --- |
| `sleep_total`、`sleep_deep`、`sleep_light`、`sleep_rem`、`sleep_awake`、`avg_sleep` | min | h | `minutes / 60`，最多 1 位小数，去掉末尾 `.0`，如 `450 → 7.5 h`、`480 → 8 h` |
| 非睡眠 event/action/activity duration | min | `<60 → min`，`>=60 → h` | min 使用整数；h 最多 1 位小数 |
| `heart_rate`、`resting_hr` | bpm | bpm | 整数，如 `100 bpm` |
| `hrv`、`hrv_rmssd` | ms | ms | 整数，如 `84 ms` |
| `spo2` | % | % | 最多 1 位小数，百分号前不加空格，如 `99%` |
| `steps` | steps | steps | 整数并使用 locale thousands separator，如 `2,998 steps` |
| `distance` | km | km | 最多 1 位小数，如 `4.2 km` |
| `calories` | kcal | kcal | 整数，如 `320 kcal` |

除 `%` 外，数值与英文单位之间保留一个空格。任何尚未登记的 metric/unit 组合不得进入公开包，必须先为其补充显式注册项和测试。

**实现步骤：**

- [ ] 实现 `buildCustomerFacingEvidencePacket(packet, locale)`，只接受内部 packet，返回公开事实、公开事件和允许的 action intents。
- [ ] 实现 `formatCustomerFacingMetric(metric, value, sourceUnit, locale)`；转换发生在公开事实构建阶段，内部 `DailyRecord`、`MetricSummary` 和事件窗口仍保留原始单位。
- [ ] 按上表注册物理单位映射；遇到 `score` 时只保留 qualifier/interpretation，不复制 value/min/max/average/delta；遇到未知 metric/unit 时返回结构化 validation error，不静默猜测单位。
- [ ] 更新中英文 homepage style：模型必须原样使用公开包给出的值和单位，禁止把 sleep 的 `h` 换回 `min`，禁止在回复中自行换算或混用单位。
- [ ] 从公开包中移除 `sourceSegmentId`、recognized/internal IDs、raw event type、raw evidence、confidence、baseline delta 和 verifier 字段。
- [ ] 修改 renderer，只接受 `CustomerFacingEvidencePacket` 渲染客户生成上下文；内部 packet 继续供 rule engine、tools 和观测使用。
- [ ] 添加单位边界测试：30 min event 显示 `30 min`，60/90/120 min event 显示 `1 h`/`1.5 h`/`2 h`，45/450/480 min sleep 显示 `0.8 h`/`7.5 h`/`8 h`；验证内部输入对象未被修改。
- [ ] 添加全入口测试：homepage/view/chat prompt 均不包含 `unit=score`、`movement intensity averaged 3.9`、`stress load 72`、`qualityScore`、exact confidence、`sleep 480 min` 或 `deep sleep 90 min`；HR 107 bpm、HRV 84 ms、SpO2 99%、steps、distance、calories 和规范化 duration 仍可出现。

**验证方式：**

```bash
pnpm --filter @health-advisor/agent-core test -- src/__tests__/context/customer-facing-evidence.test.ts src/__tests__/context/customer-facing-unit-policy.test.ts src/__tests__/prompts/context-packet-renderer.test.ts
```

预期结果：公开包类型无法构造 `unit: 'score'`；三类任务的 prompt 均通过评分隔离和常用单位测试；所有 sleep duration 均为 `h`。

**提交说明：**

```bash
git add packages/agent-core/src/context/customer-facing-evidence.ts packages/agent-core/src/context/customer-facing-unit-policy.ts packages/agent-core/src/context/context-packet.ts packages/agent-core/src/prompts/context-packet-renderer.ts packages/agent-core/src/prompts/task-builder.ts packages/agent-core/src/index.ts packages/agent-core/src/__tests__/context/customer-facing-evidence.test.ts packages/agent-core/src/__tests__/context/customer-facing-unit-policy.test.ts packages/agent-core/src/__tests__/prompts/context-packet-renderer.test.ts data/sandbox/prompts/homepage/style/en.md data/sandbox/prompts/homepage/style/zh.md
git commit -m "feat(agent-core): project internal evidence to customer-safe facts"
```

### 任务 3.2：分离内部工具执行记录与公开工具结论

**所属模块：** 模块 3 - 客户可见 Context 与发布门禁

**目标：** 让 LLM 只看到成功工具产生的客户可用结论，工具缺失或失败时完全静默。

**前置条件：**

- 任务 2.1 已完成。
- 与任务 3.1 无代码依赖，可并行实施；两者不要同时修改 `context-packet-renderer.ts`。

**涉及文件：**

- 修改：`packages/agent-core/src/runtime/realtime-brief-tool-orchestrator.ts`
- 修改：`packages/agent-core/src/tools/estimate-caffeine-sleep-impact.ts`
- 修改：`data/sandbox/prompts/homepage/template.md`
- 测试：`packages/agent-core/src/runtime/__tests__/realtime-brief-tool-orchestrator.test.ts`

**上下文：**

保留现有 `RealtimeBriefToolEvidencePacket` 作为内部观测 artifact，新增只包含成功结论的：

```ts
interface PublicToolClaim {
  claimId: string;
  kind: 'estimated_caffeine_sleep_impact';
  summary: string;
  evidenceIds: string[];
}
```

公开 claim 不得包含 toolName、policyId、priority、reason、status、error、half-life 常量、eliminationRateK 或 measuredChemically。没有成功 claim 时不追加任何工具章节。若输出估算比例，文案本身使用“估算”即可，不追加“戒指无法测量/没有专业算法”等说明。

**实现步骤：**

- [ ] 将执行计划与 prompt projection 分成两个函数：内部执行函数保留完整 artifact，公开 projection 只消费 `status === 'success'` 的结果。
- [ ] 删除向 solver prompt 渲染 tool metadata、失败 error 和“不要引用失败工具”的分支。
- [ ] 把 homepage prompt 的“没有 estimateCaffeineSleepImpact 时不得……”改为正向规则：“仅使用当前公开工具结论；不存在时保持静默并围绕已有事件证据写作”。
- [ ] 测试三种状态：无 invocation、tool error、success without data 均不追加工具上下文；success with data 只追加 `PublicToolClaim.summary`。
- [ ] 回归测试客户输出不得出现“没有算法”“无法估算剩余比例”“ring cannot determine”“tool failed”等元说明。

**验证方式：**

```bash
pnpm --filter @health-advisor/agent-core test -- src/runtime/__tests__/realtime-brief-tool-orchestrator.test.ts
```

预期结果：只有成功且有可用数据的工具结果进入 prompt；所有非成功状态保持静默。

**提交说明：**

```bash
git add packages/agent-core/src/runtime/realtime-brief-tool-orchestrator.ts packages/agent-core/src/tools/estimate-caffeine-sleep-impact.ts packages/agent-core/src/runtime/__tests__/realtime-brief-tool-orchestrator.test.ts data/sandbox/prompts/homepage/template.md
git commit -m "fix(agent-core): keep tool internals out of realtime briefs"
```

### 任务 3.3：在发布前执行阻断式 Customer Content Policy

**所属模块：** 模块 3 - 客户可见 Context 与发布门禁

**目标：** 保证违反概率措辞、评分隔离或系统元说明边界的响应不会写入 memory/cache 或返回客户。

**前置条件：**

- 任务 3.1 和 3.2 已完成，生成 prompt 只包含公开事实与公开工具结论。

**涉及文件：**

- 创建：`packages/agent-core/src/output/realtime-brief-content-policy.ts`
- 修改：`packages/agent-core/src/output/verifier.ts`
- 修改：`packages/agent-core/src/runtime/agent-runtime.ts`
- 修改：`packages/agent-core/src/output/reflection-reviewer.ts`
- 修改：`data/sandbox/prompts/reflection-reviewer.md`
- 创建：`packages/agent-core/src/output/__tests__/realtime-brief-content-policy.test.ts`
- 测试：`packages/agent-core/src/runtime/__tests__/p0-observer-integration.test.ts`

**上下文：**

本任务不扩展 `safety-cleaner.ts`，也不替换模型文本。新增 policy 产生结构化 hard violations：

```ts
type RealtimeBriefBoundaryViolation =
  | { code: 'inferred_event_asserted_as_fact'; eventType: string }
  | { code: 'internal_score_disclosed'; metric: string }
  | { code: 'internal_capability_disclosed' }
  | { code: 'unattributed_numeric_claim'; value: string }
  | { code: 'summary_length_out_of_range'; actual: number };
```

数值依据检查使用 `CustomerFacingEvidencePacket` 与 action candidates 建立允许 claim ledger；summary/actions 中的每个数值必须匹配 ledger 中的公开事实或明确 action duration。语义边界由同步 reviewer 检查，reviewer 输入只包含公开包、输出和 boundary rules，不接收内部 score 值，避免 reviewer 反向泄漏。

运行顺序必须调整为：parse → chart token validation → customer content policy → 必要时一次 regeneration → approved 后才执行 `writeSessionMemory()`、`writeAnalyticalMemory()`、cache/API return。第二次仍失败时返回 typed generation error，不返回 fallback brief。

**实现步骤：**

- [ ] 实现公开 claim ledger 和数值归因检查，覆盖 summary、actions、futureSuggestions。
- [ ] 扩展 reviewer schema/prompt，增加 `customer_boundary` 类别，检测确定性事件断言和系统元说明；普通 homepage 也必须执行该同步边界审核。
- [ ] 把现有 memory 写入从 verifier 之前移动到所有边界通过之后；确认 regeneration 失败不会写入第一次或第二次输出。
- [ ] regeneration feedback 只传结构化 violation code 与客户规则，不拼接内部数据值。
- [ ] 添加 runtime 顺序测试：违规首次输出未写 memory；第二次通过后只写通过版本；第二次失败返回错误且无写入。
- [ ] 确认 `cleanSafetyIssues()` 不处理本计划新增的四类边界。

**验证方式：**

```bash
pnpm --filter @health-advisor/agent-core test -- src/output/__tests__/realtime-brief-content-policy.test.ts src/runtime/__tests__/p0-observer-integration.test.ts
```

预期结果：违规内容从不进入 memory 或返回 envelope；测试中不存在字符串清洗后的“通过”结果。

**提交说明：**

```bash
git add packages/agent-core/src/output/realtime-brief-content-policy.ts packages/agent-core/src/output/verifier.ts packages/agent-core/src/runtime/agent-runtime.ts packages/agent-core/src/output/reflection-reviewer.ts packages/agent-core/src/output/__tests__/realtime-brief-content-policy.test.ts packages/agent-core/src/runtime/__tests__/p0-observer-integration.test.ts data/sandbox/prompts/reflection-reviewer.md
git commit -m "feat(agent-core): fail closed on customer content violations"
```

---

## 模块 4：长度策略与回归验收

**目标：** 消除 prompt/runtime/eval 的长度定义分叉，并用截图场景建立端到端质量门禁。

**依赖：** 任务 4.1 无依赖；任务 4.2 依赖模块 1–3 和任务 4.1。

**产出：**

- [ ] 英文 summary 在所有执行路径统一为 90–180 words。
- [ ] 中文 summary 统一为 220–420 graphemes。
- [ ] 两张截图的四类问题都有 fixture、verifier 和 runtime 回归覆盖。

### 任务 4.1：建立唯一 Locale-Aware Length Policy

**所属模块：** 模块 4 - 长度策略与回归验收

**目标：** 让 prompt、runtime verifier 和 eval scorer 使用同一个长度常量与同一个计数器。

**前置条件：** 无；可与任务 1.1 并行。

**涉及文件：**

- 创建：`packages/agent-core/src/policies/homepage-length-policy.ts`
- 修改：`packages/agent-core/src/prompts/task-builder.ts`
- 修改：`packages/agent-core/src/output/verifier.ts`
- 修改：`packages/agent-core/src/evals/scorers/length-scorer.ts`
- 修改：`data/sandbox/prompts/homepage/template.md`
- 测试：`packages/agent-core/src/__tests__/prompts/task-builder.test.ts`
- 测试：`packages/agent-core/src/__tests__/evals/scorers.test.ts`
- 测试：`packages/agent-core/src/__tests__/output/verifier-knowledge.test.ts`

**上下文：**

唯一策略：

```ts
export const HOMEPAGE_SUMMARY_LENGTH = {
  en: { min: 90, max: 180, unit: 'word' },
  zh: { min: 220, max: 420, unit: 'grapheme' },
} as const;
```

使用 `Intl.Segmenter(locale, { granularity: 'word' })` 并只统计 `isWordLike` 的英文 segment；中文使用 `Intl.Segmenter('zh', { granularity: 'grapheme' })`。summary 固定为三个段落：事件观察、证据解释、建议与选择引导。actions 不计入 summary 长度。

**实现步骤：**

- [ ] 实现 `countHomepageSummaryLength(text, locale)` 和 `validateHomepageSummaryLength(text, locale)`。
- [ ] task builder 从策略生成 prompt 数字；删除硬编码的 150–300 words 和旧中文长度字符串。
- [ ] verifier 删除 `summary.length > 500` soft check，改为共享策略的 hard violation。
- [ ] eval length scorer 删除本地 homepage 默认常量，直接使用共享策略和计数器。
- [ ] 添加边界测试：英文 89/181 失败、90/180 通过；中文 219/421 失败、220/420 通过；带标点、连字符和多空格时计数一致。

**验证方式：**

```bash
pnpm --filter @health-advisor/agent-core test -- src/__tests__/prompts/task-builder.test.ts src/__tests__/evals/scorers.test.ts src/__tests__/output/verifier-knowledge.test.ts
```

预期结果：prompt、verifier 和 scorer 的边界断言完全一致，英文截图长度不再以 150 words 为最小值。

**提交说明：**

```bash
git add packages/agent-core/src/policies/homepage-length-policy.ts packages/agent-core/src/prompts/task-builder.ts packages/agent-core/src/output/verifier.ts packages/agent-core/src/evals/scorers/length-scorer.ts packages/agent-core/src/__tests__/prompts/task-builder.test.ts packages/agent-core/src/__tests__/evals/scorers.test.ts packages/agent-core/src/__tests__/output/verifier-knowledge.test.ts data/sandbox/prompts/homepage/template.md
git commit -m "fix(agent-core): unify realtime brief length policy"
```

### 任务 4.2：增加截图场景与端到端回归门禁

**所属模块：** 模块 4 - 长度策略与回归验收

**目标：** 把本次四项需求转成可重复执行的 fixture、eval 和集成验收。

**前置条件：**

- 任务 1.1–1.3、2.1、3.1–3.3、4.1 全部完成。

**涉及文件：**

- 创建：`packages/agent-core/evals/cases/core/homepage/homepage-inferred-meal-cautious-language.json`
- 创建：`packages/agent-core/evals/cases/core/homepage/homepage-no-internal-score-or-capability.json`
- 修改：`packages/agent-core/src/evals/case-schema.ts`
- 修改：`packages/agent-core/src/evals/scorers/task-scorer.ts`
- 修改：`packages/agent-core/src/__tests__/evals/scorers.test.ts`
- 测试：`apps/agent-api/src/__tests__/services/ai-orchestrator.test.ts`

**上下文：**

第一个 case 模拟最近 20 分钟符合进餐模式、校准概率高于 likely threshold 的数据，要求 summary 出现“大概率/likely/consistent with”等概率表达，禁止“刚吃完/finished a meal/confirmed meal”和 confidence 百分比。

第二个 case 使用图 2 对应运动窗口，内部 packet 保留 motion average 3.9、max 9.7 和 session score，但 fixture answer 不得包含任何派生分数；同时模拟 caffeine tool 无 invocation，禁止输出算法、工具、戒指能力和无法估算等元说明。英文 summary 必须为 90–180 words。

两个 case 都必须包含单位断言：sleep total/stages 只能使用 `h`；30 分钟运动使用 `min`，达到 60 分钟的非睡眠事件使用 `h`；不得出现同一指标混用 `h` 和 `min`。

**实现步骤：**

- [ ] 扩展 homepage eval expectation：`requireProbabilisticEventLanguage`、`forbidInternalDerivedScores`、`forbidCapabilityDisclosure`。
- [ ] 扩展数值/单位 expectation：`requiredDisplayUnits` 和 `forbiddenDisplayUnits` 以 metric 为 key 检查，不使用跨指标的全局单位正则。
- [ ] 在 task scorer 中使用结构化 expectation 和公开 claim ledger 结果，不把具体截图数字硬编码到全局 scorer。
- [ ] 创建两个 fixture case，分别覆盖中文推断进餐和英文运动简报。
- [ ] 增加 API 集成测试：通过的 envelope 不含内部字段；content policy 失败时 orchestrator 不缓存结果。
- [ ] 运行完整 shared/sandbox/agent-core/agent-api 测试、core fixture eval、typecheck 和 data validation。
- [ ] 检查 `git diff --check`，确认没有格式错误；检查 `git status --short`，只提交本计划实施产生的文件，不包含用户已有 data 修改。

**验证方式：**

```bash
pnpm --filter @health-advisor/shared test
pnpm --filter @health-advisor/sandbox test
pnpm --filter @health-advisor/agent-core test
pnpm --filter @health-advisor/agent-api test
pnpm --filter @health-advisor/agent-core eval:agent:core:fixture
pnpm typecheck
pnpm validate
git diff --check
```

预期结果：全部命令退出码为 0；两个新 eval case 无 hard failure；英文 summary 在 90–180 words；客户文本不含内部评分、exact confidence 或系统能力说明。

**提交说明：**

```bash
git add packages/agent-core/evals/cases/core/homepage/homepage-inferred-meal-cautious-language.json packages/agent-core/evals/cases/core/homepage/homepage-no-internal-score-or-capability.json packages/agent-core/src/evals/case-schema.ts packages/agent-core/src/evals/scorers/task-scorer.ts packages/agent-core/src/__tests__/evals/scorers.test.ts apps/agent-api/src/__tests__/services/ai-orchestrator.test.ts
git commit -m "test(agent-core): cover realtime brief customer boundaries"
```

---

## 执行顺序

### 依赖关系

| 任务 | blockedBy | 说明 |
| --- | --- | --- |
| 1.1 双通道契约 | - | 可立即开始，定义后续识别接口。 |
| 1.2 无标签事件识别 | 1.1 | 依赖 `SensorObservation` 和 recognition source。 |
| 1.3 概率校准与发布阈值 | 1.2 | 依赖无标签识别器的 raw score 和候选窗口。 |
| 2.1 事件确定性契约 | 1.3 | 依赖校准后的 confidence 和低置信度过滤。 |
| 3.1 客户可见事实投影 | 2.1 | 依赖 certainty band 和最终事件 packet 形状。 |
| 3.2 公开工具结论 | 2.1 | 只依赖最终概率措辞口径，可与 3.1 并行。 |
| 3.3 阻断式内容门禁 | 3.1, 3.2 | 依赖公开事实包和公开工具 claim。 |
| 4.1 唯一长度策略 | - | 可与模块 1 并行，避免修改相同文件时需在 2.1 前合并。 |
| 4.2 端到端回归 | 1.3, 2.1, 3.3, 4.1 | 集成所有行为与验收条件。 |

### 执行阶段

**Phase 1（可并行）：**

- 任务 1.1：双通道数据契约。
- 任务 4.1：唯一长度策略。

**Phase 2：**

- 任务 1.2：无标签事件识别。

**Phase 3：**

- 任务 1.3：概率校准与发布阈值。

**Phase 4：**

- 任务 2.1：事件确定性契约。

**Phase 5（可并行）：**

- 任务 3.1：客户可见事实投影。
- 任务 3.2：公开工具结论。

**Phase 6：**

- 任务 3.3：阻断式内容门禁。

**Phase 7：**

- 任务 4.2：端到端回归与最终验收。

### 关键路径

```text
1.1 → 1.2 → 1.3 → 2.1 → 3.1 → 3.3 → 4.2
```

任务 4.1 与 1.1 并行；任务 3.2 与 3.1 并行。关键路径上的接口变更完成前，后续任务不得自行复制临时类型。

---

## Acceptance Criteria

- [ ] 修改任何 Mock Timeline 的 `type` 或语义化 ID 都不会改变相同传感器观察序列的识别结果。
- [ ] `extractGodModeType()`、God Mode `confidence=1.0` 快速路径和基于 segment 边界的 sensor classification 已删除。
- [ ] 每类 sensor-inferred event 都有校准 artifact；达不到 95% precision 的类型不会发布。
- [ ] 低置信度事件不会进入 `recentEvents`、prompt 或用户回复。
- [ ] 所有 sensor-inferred event 都使用 possible/likely 表达；只有 user report 使用确定性表达。
- [ ] LLM prompt 和客户回复均不显示事件 confidence 百分比。
- [ ] Homepage、view summary 和 advisor chat 均不显示 motion/stress/sleep/quality 等派生分数。
- [ ] 所有 sleep total、average 和 stage duration 在 LLM prompt 与 Response 中都使用 `h`，不存在 sleep `min` 表达。
- [ ] 非睡眠 duration 小于 60 分钟使用 `min`，达到 60 分钟使用 `h`；同一数值只展示一种单位。
- [ ] HR、HRV、SpO2、steps、distance 和 calories 分别使用 `bpm`、`ms`、`%`、`steps`、`km`、`kcal`。
- [ ] 未登记的 metric/unit 组合无法进入 `CustomerFacingEvidencePacket`，不会被猜测或原样透传。
- [ ] tool missing/error/empty 不会向 LLM 渲染任何内部元数据，也不会生成系统能力说明。
- [ ] 违规内容在 memory、cache 和 API return 前被阻断；没有新增字符串替换或截断逻辑。
- [ ] 英文 homepage summary 的 90/180 边界通过，89/181 被拒绝；中文 220/420 边界保持一致。
- [ ] summary 固定为三个段落，actions 独立，不计入 summary 长度。
- [ ] shared、sandbox、agent-core、agent-api 测试、core fixture eval、typecheck 和 data validation 全部通过。
- [ ] 每张任务卡独立使用 Conventional Commit 提交，且不包含用户已有的 `data/sandbox` 工作区修改。

## Unresolved Questions

无。所有会改变实现路径的产品口径已在计划阶段确认。
