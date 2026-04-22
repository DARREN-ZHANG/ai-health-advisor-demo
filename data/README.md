# Health Advisor - Sandbox 数据

本目录包含 sandbox（沙盒）模式使用的模拟健康数据，用于开发和演示场景。

## 目录结构

```
data/sandbox/
├── manifest.json          # 数据清单，列出所有可用 profile
├── profiles/              # 用户画像基础档案（含 baseline 和引用）
│   ├── profile-a.json     # 张健康 — 32岁男性，健康稳定
│   ├── profile-b.json     # 李普通 — 45岁女性，数据有缺失
│   └── profile-c.json     # 王压力 — 28岁男性，高压力边缘
├── history/               # 冻结历史日级汇总（DailyRecord[]）
│   ├── profile-a-daily-records.json
│   ├── profile-b-daily-records.json
│   └── profile-c-daily-records.json
├── timeline-scripts/      # 当前活动日 baseline 活动片段模板
│   ├── profile-a-day-1.json   # 张健康的晨间初始状态
│   ├── profile-b-day-1.json   # 李普通的晨间初始状态
│   └── profile-c-day-1.json   # 王压力的晨间初始状态
├── fallbacks/             # AI 回退响应（当 AI 不可用时使用）
│   ├── homepage.json
│   ├── view-summary.json
│   └── advisor-chat.json
├── prompts/               # AI 提示词模板
│   ├── system.md
│   ├── homepage.md
│   ├── view-summary.md
│   └── advisor-chat.md
└── scenarios/             # God Mode 场景定义
    └── manifest.json
```

## 数据分层

每个 profile 由三类资产组成：

1. **profiles/*.json** — 画像基础字段 + baseline 指标 + 初始 demo 时刻 + 引用元数据
2. **history/*.json** — 冻结历史 DailyRecord[]（20 天连续数据）
3. **timeline-scripts/*.json** — 当前活动日 baseline 活动片段（demo 开始时已在设备缓冲区的数据）

## 验证数据

```bash
npx tsx data/validate.ts
```

此脚本会校验：
- Profile 画像结构、historyRef/timelineScriptRef 引用正确性
- History 文件日期连续性（20 天）和 schema 合规
- Timeline Script 片段无时间重叠、initialDemoTime 一致性
- Fallback 文案 schema 和 chartToken 引用
- Scenario 定义结构（含 timeline_append、sync_trigger 等新类型）
- Prompt 文件存在性
