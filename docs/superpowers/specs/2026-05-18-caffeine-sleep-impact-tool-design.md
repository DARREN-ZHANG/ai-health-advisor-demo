# Caffeine Sleep Impact Tool 设计文档

> 日期：2026-05-18
> 状态：已确认

## 概述

新增一个 Agent 可调用的 Demo Tool：`estimateCaffeineSleepImpact`。

该 Tool 将现有 `possible_caffeine_intake` 概率事件进一步转化为用户更容易理解的“估算咖啡因剩余比例”，并预测目标入睡时间的睡眠影响。它不重新检测咖啡因摄入，也不声称测量血液咖啡因浓度。内部仍基于可穿戴生理信号代理模型，用户侧表达为“按生理信号估算的体内咖啡因负荷剩余比例”。

## 产品目标

Demo 需要展示 Valo 从健康追踪走向 Bio-Hacking 的能力：

- 用户或 Agent 关注“今晚睡眠会不会被下午咖啡因影响”
- Agent 调用 Tool 查询最近的 `possible_caffeine_intake`
- Tool 用指数衰减模型估算目标入睡时间的咖啡因负荷剩余比例
- Agent 用支持型语气给出睡眠影响解释和行动建议

示例表达：

> 按你的戒指生理信号估算，这次咖啡因负荷到 23:00 可能仍剩约 48%。这不是血液化学实测，但足以提示今晚入睡和深睡可能受影响。

## 非目标

本轮不做：

- 血液咖啡因 mg/L 或 mg 总量估算
- 咖啡、茶、能量饮料等具体饮品分类
- 手动咖啡记录入口
- 自动摄入检测算法重写
- 跨多天强化学习或遗传型快慢代谢分类
- 睡眠医学诊断

## 既有能力复用

当前仓库已经具备：

- `possible_caffeine_intake` 识别事件
- `queryTimelineEvents` Tool 可查询时间线事件
- Agent ReAct Tool 注册机制
- 咖啡因事件的概率性表达约束
- God Mode 可生成咖啡因响应 Demo 数据

本设计只新增一个估算 Tool，不改变 `possible_caffeine_intake` 的检测职责。

## Tool 定义

### 名称

`estimateCaffeineSleepImpact`

### 输入

```ts
interface EstimateCaffeineSleepImpactInput {
  targetSleepTime?: string;
}
```

字段说明：

| 字段 | 说明 |
|------|------|
| `targetSleepTime` | 目标入睡时间，ISO-like 本地时间字符串，例如 `2026-05-18T23:00` |

若 `targetSleepTime` 缺失，Demo 默认使用当天 `23:00`。Agent 在用户明确提到“今晚 11 点”时，应传入明确时间。

### 输出

```ts
interface EstimateCaffeineSleepImpactOutput {
  hasCaffeineEvent: boolean;
  event?: {
    start: string;
    end: string;
    confidence: number;
  };
  estimatedCaffeineLoad?: {
    basis: 'physiological_proxy';
    measuredChemically: false;
    halfLifeHours: number;
    eliminationRateK: number;
    hoursUntilSleep: number;
    remainingRatioAtSleep: number;
  };
  sleepImpact?: {
    riskLevel: 'low' | 'moderate' | 'high';
    rationale: string;
  };
  advice?: {
    tone: 'supportive_partner';
    message: string;
  };
}
```

当 `hasCaffeineEvent` 为 `false` 时，Tool 返回空估算结果。Agent 只能说“没有足够证据估算咖啡因对今晚睡眠的影响”，不能编造摄入事件。

## 估算模型

Demo 使用指数衰减模型：

```text
C(t) = C0 * e^(-kt)
k = ln(2) / halfLifeHours
remainingRatio = e^(-k * hoursUntilSleep)
```

其中：

- `C0` 不表示血液绝对浓度，只作为本次咖啡因负荷的归一化起点
- `remainingRatioAtSleep` 表示目标入睡时间仍可能存在的相对负荷比例
- 默认 `halfLifeHours = 5`
- `measuredChemically` 固定为 `false`
- `basis` 固定为 `physiological_proxy`

## 事件选择

Tool 从 `ctx.packet.homepage.recentEvents` 中查找最近一个 `possible_caffeine_intake` 事件。

筛选规则：

1. 只使用 `type === 'possible_caffeine_intake'`
2. 事件开始时间必须早于 `targetSleepTime`
3. 优先选择距离目标睡眠时间最近的事件
4. 若没有符合条件的事件，返回 `hasCaffeineEvent: false`

本轮不合并多次咖啡因事件。若未来需要处理多杯咖啡，可将每个事件转为一条归一化曲线再叠加。

## 风险分级

风险等级由 `remainingRatioAtSleep` 和事件 `confidence` 共同决定。

基础分级：

| 剩余比例 | 风险 |
|------|------|
| `< 0.25` | `low` |
| `0.25 - 0.50` | `moderate` |
| `> 0.50` | `high` |

置信度处理：

- `confidence >= 0.8`：按基础分级输出
- `confidence < 0.8`：不下调数值结果，但 `rationale` 必须说明“摄入证据有限”

不通过后处理强行改写 Agent 文案，风险说明由 Tool 输出结构化依据，Agent 按系统概率语言约束表达。

## 用户表达约束

允许表达：

- “估算咖啡因剩余比例”
- “估算体内咖啡因负荷”
- “按生理信号推断”
- “可能影响入睡和深睡”
- “不是血液化学实测”

禁止表达：

- “血液咖啡因浓度为 X”
- “确认摄入咖啡因”
- “你喝了咖啡”
- “一定会失眠”
- “医学诊断”

推荐语气是支持型伙伴，而不是管控型提醒。

## 示例输出

```json
{
  "hasCaffeineEvent": true,
  "event": {
    "start": "2026-05-18T16:00",
    "end": "2026-05-18T18:00",
    "confidence": 0.84
  },
  "estimatedCaffeineLoad": {
    "basis": "physiological_proxy",
    "measuredChemically": false,
    "halfLifeHours": 5,
    "eliminationRateK": 0.139,
    "hoursUntilSleep": 7,
    "remainingRatioAtSleep": 0.38
  },
  "sleepImpact": {
    "riskLevel": "moderate",
    "rationale": "到目标入睡时间预计仍有约 38% 的咖啡因负荷，可能轻到中度影响入睡和深睡比例。"
  },
  "advice": {
    "tone": "supportive_partner",
    "message": "今晚可以把入睡前 60 分钟留给降刺激活动。如果还想喝热饮，建议换成无咖啡因选项。"
  }
}
```

## 测试计划

需要覆盖：

- 无 `possible_caffeine_intake` 事件时返回 `hasCaffeineEvent: false`
- 有事件且目标睡眠时间晚于事件时，正确计算 `remainingRatioAtSleep`
- `remainingRatioAtSleep < 0.25` 输出 `low`
- `0.25 <= remainingRatioAtSleep <= 0.50` 输出 `moderate`
- `remainingRatioAtSleep > 0.50` 输出 `high`
- `confidence < 0.8` 时 rationale 明确证据有限
- 输出 schema 固定 `basis: physiological_proxy` 和 `measuredChemically: false`
- Tool 被注册到 ReAct tool map 后可被 planner 选择

## 后续演进

Demo 后可继续扩展：

- 支持用户手动记录咖啡时间作为输入
- 支持多次摄入曲线叠加
- 用摄入后 HR/HRV 恢复斜率估算个人半衰期
- 用睡眠 latency、deep sleep、micro-arousal 反向校准半衰期
- 建立用户级 `caffeineSensitivity` 或 `caffeineHalfLifeHours` 记忆
