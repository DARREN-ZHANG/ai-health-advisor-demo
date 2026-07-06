# Valo 设计清单

## 取证范围

- 来源：`Valo-App-Demo`，Figma file key `xRPTN25efPZD6q4QxBKxvp`。
- 取证方式：使用已登录 Chrome 会话读取画布、图层和右侧属性面板；未调用 Figma MCP。
- 取证日期：2026-07-05。
- 参考图：`docs/ui/valo/references/`，均由 Figma 以 PNG 2x 直接导出。
- 移动端设计宽度统一为 `402px`；主要模态画板高度为 `874px`。

## 视觉基础

### 色彩

| Token | 设计值/基准 | 用途 |
| --- | --- | --- |
| `--valo-canvas` | `#111118` | 页面、Sheet 和卡片的主背景 |
| `--valo-text-primary` | `#FFFFFF` | 标题、重要数值、主要操作 |
| `--valo-text-secondary` | `#999999` | 次要标签、时间和禁用项 |
| `--valo-prime` | 紫色光谱 | Prime Readiness；主色建议从 Hero 素材取色 |
| `--valo-active` | 绿色光谱；画板可见 `#1BF697` | Active Recovery |
| `--valo-sluggish` | 橙色光谱 | Metabolic Sluggish |
| `--valo-depleted` | 红色光谱 | Glycogen Depleted |
| `--valo-surface` | 深紫黑 | 卡片、底部导航、Sheet 内容面 |
| `--valo-scrim` | 黑色半透明 | Switch Status、Switch Account 与 Timer 背后的遮罩 |

颜色实现应以语义 token 驱动。四态颜色不可写进正文图片；状态标题、按钮和可交互控件必须保持 HTML。

### 字体

| 场景 | 字体 | 画板证据 |
| --- | --- | --- |
| Hero 状态标题、时间段标题 | `DM Serif Display` | Prime Readiness 图层：18px、Regular、0.5px 字距 |
| 页面正文、按钮、导航、表单 | `SF Pro` / 系统无衬线回退 | My 导航标签：12px、Medium、16px 行高 |

Web 端使用系统字体栈承接 SF Pro；不得把标题或正文转成图片。Hero 标题使用衬线字体栈，缺少 DM Serif Display 时需由实现任务显式引入字体资源，而非依赖截图。

### 布局与形状

- 基准视口：`402 × 874`；长页面保持 402px 宽并纵向滚动。
- 页面左右安全边距：16px；主内容区常用 16px/24px 垂直节奏。
- Action 卡双列展示；窄视口不足时按实现计划转换为单列。
- 卡片和 Sheet 使用大圆角、弱边框和深色层级；按钮使用药丸或 8px-12px 圆角矩形。
- 底部导航固定在安全区上方，Home / Trends / My 三个主入口保持一致。
- Hero 装饰图层允许位图；状态标题、状态圆环交互、Avatar、Demo Control、正文和按钮均由 HTML/CSS 构成。

## 首页四态

| 状态 | 来源画板 | 画板尺寸 | 参考图 | 行为合同 |
| --- | --- | ---: | --- | --- |
| Prime Readiness | `V1-早晨起床活力满满` | 402 × 1803 | `references/home-prime-readiness.png` | API 无 brief 时的紫色默认态 |
| Metabolic Sluggish | `V2-工作久坐身体代谢低迷` | 402 × 1878 | `references/home-metabolic-sluggish.png` | warning 对应的橙色态 |
| Glycogen Depleted | `V3-运动后筋疲力尽` | 402 × 1902 | `references/home-glycogen-depleted.png` | error 对应的红色态 |
| Active Recovery | `V4-下班后适当运动恢复身体活力` | 402 × 1998 | `references/home-active-recovery.png` | good 对应的绿色态 |

四个首页共享以下结构：

1. 顶部状态栏、Avatar、品牌标识和 Demo Control 入口。
2. 发光状态 Hero，中央状态圆环为 `Switch Status` 的唯一触发器。
3. Now 简报、micro tip、Action 卡。
4. Afternoon / Night 静态示例段落。
5. Life Log 会话数据区。
6. 固定底部主导航。

## 弹层与交互

### Switch Status

- 来源画板：`Switch Status`，`402 × 874`。
- 参考图：`references/switch-status.png`。
- 移动端为底部 Sheet；桌面端实现为 420px 居中 Dialog。
- 遮罩覆盖首页，但保留 Hero 轮廓作为上下文。
- 设计稿原始列表含重复/额外状态；实现严格收敛为四项：Prime Readiness、Active Recovery、Metabolic Sluggish、Glycogen Depleted。
- 唯一入口是首页中央状态圆环。Avatar 只打开 Profile Switch，Demo Control 只打开 Timeline Control。
- 圆环本身是语义 `button`，不可使用透明覆盖层替代。

### Switch Account / Profile Switch

- 来源画板：`Switch Account`，`402 × 874`。
- 参考图：`references/switch-account.png`。
- 由首页 Avatar 打开；列表使用头像、姓名和单选状态。
- 选择后立即切换并关闭；不在该弹层放置 Timeline 或状态切换入口。

### Timer

- 来源画板：`卡片交互-app内的弹窗展现形式`，`402 × 874`。
- 参考图：`references/timer-dialog.png`。
- 从可计时 Action 进入；展示真实倒计时、Stop 和立即完成。
- 自然完成或立即完成提交 `micro_event` 并刷新 brief；Stop 只取消。

### Appointment

- 来源画板：`卡片交互-跳转到app外的展现形式`，`402 × 874`。
- 参考图：`references/appointment.png`。
- 原设计表达外部预约承接；本原型只显示确认反馈，不调用外部日历应用。

### Demo Control / Timeline Control

- 新 Figma 设计中没有 Timeline Control 画板。
- 实现需在首页顶部、Avatar 旁增加悬浮入口；仅当 `NEXT_PUBLIC_ENABLE_GOD_MODE=true` 时显示。
- 移动端打开约 `92dvh` 的底部 Sheet；桌面端打开 480px 右侧 Drawer。
- 抽屉仅承载 Timeline Control，不混入 Profile 编辑、复制、重置或删除。

## Trends、AI Chat 与 My

### Trends

- `Trend-Sleep`：`402 × 2544`，参考图 `references/trends-sleep.png`。
- `Trend-Activity`：`402 × 2164`，参考图 `references/trends-activity.png`。
- 页面使用顶部指标切换、摘要卡、趋势图和解释区；Sleep / Activity 最贴近设计，其余现有指标复用同一视觉系统并完整保留。

### AI Chat

- 来源画板：`AI Chat`，`402 × 874`。
- 参考图：`references/ai-chat.png`。
- 包含品牌空态、建议问题、消息区和底部输入；真实 AI 能力、错误态和加载态继续保留。

### My

- 来源画板：`My`，`402 × 1064`。
- 参考图：`references/my.png`。
- 只有 Account 和 Language 可交互；其他条目必须以明确禁用样式呈现。

## 可访问性与响应式合同

- 所有可点击区域使用原生 button/link/radio 语义和可见焦点。
- Sheet / Dialog 打开后进行焦点约束；关闭后焦点返回触发器。
- 状态色不能成为唯一信息载体，四态名称始终可见。
- 移动端验收视口：`402 × 874`。
- 桌面端验收视口：`1440 × 1000`；内容居中并限制最大宽度，弹层按桌面规格切换。
- 参考图只用于视觉验收，不作为整屏生产素材。
