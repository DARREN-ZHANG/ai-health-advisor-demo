# **Health Advisor Web Demo 产品需求文档 (PRD)**

## **1. 产品概述与 Demo 核心策略**

本 Demo 旨在全面、高保真地还原 Health Advisor “数据在指尖，洞察在云端，建议在身边” 的核心产品逻辑。
* **展现目标：** 完整展示产品功能框架，凸显 AI 将底层硬件无感采集的生理数据转化为高价值、个性化行动指导的“护城河”能力。
* **Demo 核心机制：** 引入**多用户数据沙盒 (Multi-Profile Sandbox)** 机制，配合隐藏的**演示控制面板 (God-Mode)**，实现单屏幕内的多场景无缝切换、多维数据协同展现以及跨终端的响应式适配。

---

## **2. 核心功能模块定义**

### **2.1 视觉与交互全局规范**
* **暗黑模式 (Dark Mode)：** 全局深色背景，建立专业医疗级质感与专注力。
* **响应式布局 (Responsive UI)：** 界面需自适应 Mobile、Tablet 及 Desktop，核心卡片采用流式布局。
* **红黄绿信号系统：** 核心卡片及背景边缘通过颜色（绿=极佳，黄=需关注，红=警告需休息）传递瞬时状态。

### **2.2 首页 (Homepage) - 实时状态与行动指南**
* **AI 晨报卡片：** 位于首屏黄金区域，80-120 字卡片，包含 [状态定调] + [数据循证] + [精准建议]。颜色随状态变动。
* **Active Sensing 灵动监测 (触发态)：** 全局最高优先级横幅。运动触发时在页面顶部顺滑下拉（覆盖当前视图顶部）。
* **Contextual Micro-Insights (药丸贴士)：** AI 晨报下方的横滑小贴士，用于轻量级预警（如咖啡因截点、压力峰值）。
* **Historical Trends 底层看板：** 模块化卡片阵列（睡眠、心率、消耗等）。首阶段允许固定排序交付，拖拽排序作为后续增强项补齐。

### **2.3 数据中心 (Data Center) - 深度审计与复盘**
* **顶层交互：** 提供【全览】【睡眠】【心率】【运动】【压力】【生理指标】Tab 切换，及 日/周/月/年 时间轴筛选。
* **全览综合简报：** AI 提取选定周期异常数据，输出因果归因（如：“运动量增加 20%，导致深睡提升 15%”）。
* **交互图表：** 平滑曲线叠图，支持 Tooltip 取值，显示“浅色基准线”及“异常点红点标记”。
* **AI 总结当前视图：** 右下角悬浮按钮，点击后基于当前图表筛选条件生成：趋势概括、相关性发现、下步行动指引。

### **2.4 健康顾问 (AI Advisor) - 全局悬浮气泡**
* **形态：** 右下角常驻 AI 气泡菜单。点击后展开为 ChatBox（移动端半屏浮层，桌面端侧边抽屉）。
* **数据驱动对话：** 用户提问后，AI 默认结合最近 14 天数据进行跨维度分析；若用户问题显式提及“昨天 / 这一个月 / 最近一年”等范围，再按请求扩展或缩小窗口。
* **多模态渲染：** AI 回复不仅包含文字，还可内嵌“微型趋势对比图”。
* **附属功能：** 顶部快捷指令（Smart Prompts），侧边/顶部展示用户专属“生理标签”。

---

## **3. 数据沙盒层技术契约 (Data Sandbox Protocol)**

为了让 Web Demo 能直接承载并解析真实的戒指/手环 CSV 导出数据，沙盒 JSON 必须严格映射真实传感器的字段。前端图表渲染与后端 AI 推理均强制依赖以下结构。

### **3.1 TypeScript 接口定义 (基于真实传感器格式)**

```typescript
// --- 用户级基础数据结构 ---
interface SandboxProfile {
  userId: string;
  basicInfo: {
    name: string;
    age: number;
    tags: string[]; // AI生成的生理标签，如 ["咖啡因敏感型", "高压职场人"]
  };
  baselines: {
    restingHR: number; // 个人基准静息心率 (参考 Vital Signs 中的 Min. Heart Rate)
    hrv: number;       // 个人基准HRV (参考 Vital Signs 中的 Avg. HRV)
  };
  dailyRecords: DailyRecord[]; // 包含过去 N 天的连续真实数据
}

// --- 每日聚合数据结构 ---
interface DailyRecord {
  date: string;          // 主键: YYYY-MM-DD
  activity: ActivityData;
  sleep: SleepData;
  vitals: VitalSignsData;
  events: string[];      // Demo专用：预留给控制台手动注入的标签，如 ["饮酒", "熬夜加班", "开始高强度有氧"]
}

// --- 活动数据 (映射自 Activity CSV) ---
interface ActivityData {
  steps: number;         // 对应 'Steps' (如: 11614)
  calories: number;      // 对应 'Calories(kcal)' (如: 2562)
}

// --- 睡眠数据 (映射自 Sleep CSV) ---
interface SleepData {
  startTime: string;         // 对应 'Start Time' (如: '2026-02-01 00:39:04')
  endTime: string;           // 对应 'End Time'
  fallingAsleepTime: string; // 对应 'Falling Asleep Time'
  wakeUpTime: string;        // 对应 'Wake-up time'
  timeAsleepMin: number;     // 对应 'Time Asleep(min)' 总睡眠时长分钟数
  sleepTimeRatio: string;    // 对应 'Sleep Time Ratio(%)' (如: '83.00%')
  stages: {
    awakeMin: number;        // 对应 'Sleep Stages - Awake(min)'
    remMin: number;          // 对应 'Sleep Stages - REM(min)'
    lightSleepMin: number;   // 对应 'Sleep Stages - Light Sleep(min)'
    deepSleepMin: number;    // 对应 'Sleep Stages - Deep Sleep(min)'
  };
}

// --- 生命体征数据 (映射自 Vital Signs CSV) ---
interface VitalSignsData {
  heartRate: {
    avgBpm: number;  // 对应 'Avg. Heart Rate(bpm)'
    minBpm: number;  // 对应 'Min. Heart Rate(bpm)'
    maxBpm: number;  // 对应 'Max. Heart Rate(bpm)'
  };
  spo2: {
    avgRatio: string; // 对应 'Avg. Spo2(%)' (如: '96%')
    minRatio: string; // 对应 'Min. Spo2(%)'
    maxRatio: string; // 对应 'Max. Spo2(%)'
  };
  hrv: {
    avgMs: number;   // 对应 'Avg. HRV(ms)'
    minMs: number;   // 对应 'Min. HRV(ms)'
    maxMs: number;   // 对应 'Max. HRV(ms)'
  };
}
```

### **3.2 数据处理与关联要求（开发须知）**

1. **缺失指标的降级：** 真实数据中不存在“体温”与“睡眠评分”。前端与 AI Prompt 需移除对体温的强制依赖；对于睡眠状态，可通过 `timeAsleepMin` 和深睡时长由 AI 综合评价替代单一分数。
2. **事件数据 (Events) 的注入：** 真实 CSV 仅有生理指标，开发团队在构建 `sandbox_data.json` 时，必须手动在特定日期的 `events` 数组里增加剧情。例如：当观察到某日 `Avg. HRV` 骤降时，手动写入 `events: ["饮酒", "晚睡"]`，为 AI 提供因果推断的剧情支撑。
3. **数据格式清洗：** 血氧（SpO2）等带 `%` 符号的字符串无需强转为数字，保留其格式直接喂给大模型即可。

---

## **4. AI 交互与输出规范契约 (AI I/O Specification)**

为解决大模型“黑盒”问题及多模态渲染需求，约定以下前后端协议。

### **4.1 System Prompt 注入结构 (后端侧)**
后端向 LLM 发起请求时，必须使用以下结构包裹用户的提问：
1. **Persona：** “你是一个顶尖运动医学专家与私人健康助理，语气知性、直截了当。遵循红黄绿状态逻辑。”
2. **Context Injection：** “当前用户的生理标签为 [传入tags]。默认注入过去 14 天完整数据：[JSON String]；若用户问题显式要求其他时间范围，则按请求扩展或缩小窗口。”
3. **Task Constraints：** “请基于数据给出具体行动指令（80-120字）。如有必要展示趋势，请在文本中使用图表占位符。”

### **4.2 多模态渲染协议 (正式线缆协议)**
为了让 AI 回复稳定渲染为前端组件，正式前后端契约采用**结构化响应**而不是前端扫描自由文本。
* **协议规则：** 后端必须把 AI 输出收口为结构化字段，至少包含：`summary`、`statusColor`、可选 `chartTokens[]`、可选 `microTips[]` 与元信息。前端只消费这些显式字段，不从自由文本中猜状态或图表。
* **图表 token 规则：** 若模型或 prompt 资产内部使用 `[CHART:HRV_7DAYS]` 一类作者侧占位符，必须由后端在解析阶段将其转换为受控 `chartTokens[]`，并在最终 `summary` 中清除原始标记。
* **前端行为：** 前端接收后端返回的 `chartTokens[]`，按白名单渲染对应微型图表；不直接读取原始 JSON 沙盒，也不直接解析 LLM 原始文本。

---

## **5. 演示防翻车容错机制 (Fallback & Error Handling)**

为确保在不可控网络环境下（如投资人会议断网、API 限流）Demo 依然完美运行。

* **超时降级机制：**
  * 前端设定 AI 请求的超时时间为 **6 秒**。
  * 若超过 6 秒未返回，前端结束等待态并展示统一 timeout UI；**正式 fallback 文案必须由后端按结构化协议返回**，前端不得伪造一条“看似来自 AI”的备用回答。
* **优雅的加载状态 (Loading State)：**
  * 在等待 AI 响应的 1-5 秒内，ChatBox 或总结弹窗必须展示具有科技感的 Skeleton 骨架屏动画，并配有动态微文案（如：“正在分析交叉数据...”），将等待转化为视觉体验。
* **空数据保护：** 即使切换用户导致某些天数数据缺失，前端图表需支持断点平滑处理，AI Prompt 需明确规定“禁止对缺失数据进行幻觉生成”。

---

## **6. 演示控制台交互边界 (God-Mode UI Boundaries)**

God-Mode 菜单悬浮于全局之外，其触发的操作需遵循严格的路由和状态更新规则，不得破坏当前演示流。

* **[全局刷新类] 沙盒身份切换：**
  * **行为：** 切换 User Profile 时，触发全局 State 重置。
  * **路由表现：** 不强制跳转页面。如果在 Data Center，图表原地丝滑刷新为新用户数据；如果在 Homepage，则重新渲染新用户的 AI 晨报。
* **[全局中断类] 瞬时事件注入 (如“开启运动”)：**
  * **行为：** 触发灵动监测。
  * **路由表现：** **无论当前处于何种视图（甚至在 ChatBox 里），顶部必须强制下拉 Active Sensing 横幅。** 不触发页面跳转，用户处理完横幅后底层状态保留不变。
* **[局部状态变更类] 修改指标 (如“模拟极差睡眠”)：**
  * **行为：** 动态修改当前 JSON 沙盒状态。
  * **路由表现：** 触发局部重绘。若在首页，AI 晨报卡片颜色平滑过渡为红色，文案淡出并更新为预警指令，避免生硬刷新闪烁。
