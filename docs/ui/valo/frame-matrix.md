# Valo 画板映射矩阵

## 画板到实现

| Figma 画板 | 路由/入口 | 主要组件 | 状态/数据 | 验收视口 | 参考图 |
| --- | --- | --- | --- | --- | --- |
| `V1-早晨起床活力满满` | `/` | Hero、Brief、Action Cards、Life Log、Bottom Nav | Prime Readiness；无 brief 默认态 | 402×874、1440×1000 | `references/home-prime-readiness.png` |
| `V2-工作久坐身体代谢低迷` | `/` | 同上 | Metabolic Sluggish；`warning` | 402×874、1440×1000 | `references/home-metabolic-sluggish.png` |
| `V3-运动后筋疲力尽` | `/` | 同上 | Glycogen Depleted；`error` | 402×874、1440×1000 | `references/home-glycogen-depleted.png` |
| `V4-下班后适当运动恢复身体活力` | `/` | 同上 | Active Recovery；`good` | 402×874、1440×1000 | `references/home-active-recovery.png` |
| `Switch Status` | 首页状态圆环 | Status Sheet / Dialog、Radio Group | 四态手动覆盖；下次 `dataUpdatedAt` 恢复 API 状态 | 402×874、1440×1000 | `references/switch-status.png` |
| `Switch Account` | 首页 Avatar | Profile Switch Sheet / Dialog | 当前 Profile、Profile 列表 | 402×874、1440×1000 | `references/switch-account.png` |
| Life Log（四态首页下半区） | `/` | Life Log Rows、Yes/No Controls | 按 Profile 隔离的 session 数据 | 402×874、1440×1000 | 四态首页参考图 |
| `Trend-Sleep` | `/trends` | Metric Tabs、Summary、Sleep Charts | 现有 Sleep 指标 | 402×874、1440×1000 | `references/trends-sleep.png` |
| `Trend-Activity` | `/trends` | Metric Tabs、Summary、Activity Charts | 现有 Activity 指标 | 402×874、1440×1000 | `references/trends-activity.png` |
| `AI Chat` | AI 入口 | Chat Shell、Suggestions、Messages、Composer | 真实 AI 会话、加载和错误态 | 402×874、1440×1000 | `references/ai-chat.png` |
| `My` | `/my` | Profile Header、Settings Rows、Bottom Nav | Account / Language 可用，其余禁用 | 402×874、1440×1000 | `references/my.png` |
| `卡片交互-app内的弹窗展现形式` | 计时 Action | Timer Dialog | running / stopped / completed | 402×874、1440×1000 | `references/timer-dialog.png` |
| `卡片交互-跳转到app外的展现形式` | Appointment Action | Appointment Confirmation | 本地确认，不外跳 | 402×874、1440×1000 | `references/appointment.png` |
| 新增 Demo Control | 首页顶部悬浮入口 | Demo Control Drawer、Timeline Groups | 13 个 Timeline segment、reset confirmation | 402×874、1440×1000 | 无原始画板，按设计系统扩展 |

## 唯一入口矩阵

| 触发区域 | 允许打开 | 禁止打开 |
| --- | --- | --- |
| 首页中央状态圆环 | Switch Status | Profile Switch、Demo Control |
| 首页 Avatar | Profile Switch | Switch Status、Demo Control |
| Demo Control 悬浮入口 | Timeline Control Drawer | Switch Status、Profile 编辑器 |

## Timeline Control 分组

| 分组 | Segment |
| --- | --- |
| 日常节律 | meal、walk、sleep、nap、deep focus、relaxation |
| 训练 | steady cardio、intermittent exercise、strength training |
| 状态/摄入 | sedentary、anxiety、caffeine、alcohol |

## 验收规则

- `Switch Status` 只能从状态圆环触发，圆环必须可键盘聚焦。
- 四态切换后 Hero、状态名和语义色同步；正文仍为 HTML。
- 402px 移动端与 1440px 桌面端均不能出现横向溢出。
- Profile Switch 和 Life Log 数据按 Profile 隔离；刷新清除 Life Log session 原型数据。
- 参考图不得在生产 UI 中作为整屏背景或可交互控件。
