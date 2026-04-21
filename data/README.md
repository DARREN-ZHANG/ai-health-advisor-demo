# Health Advisor - Sandbox 数据

本目录包含 sandbox（沙盒）模式使用的模拟健康数据，用于开发和演示场景。

## 目录结构

```
data/sandbox/
├── manifest.json          # 数据清单，列出所有可用 profile
├── profiles/              # 用户健康档案（含日级汇总和设备同步配置）
│   ├── profile-a.json     # 张健康 — 32岁男性，健康稳定
│   ├── profile-b.json     # 李普通 — 45岁女性，数据有缺失
│   └── profile-c.json     # 王压力 — 28岁男性，高压力边缘
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

## 验证数据

```bash
npx tsx data/validate.ts
```

此脚本会校验所有 profile 的 JSON schema、日期连续性、设备同步配置和数据合理性。
