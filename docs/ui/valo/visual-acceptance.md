# Valo UI 跨视口视觉验收

## 状态

- 阶段：C2.1 首轮视觉比对完成
- 日期：2026-07-06
- 实现基线：`7fe6d4c fix(web): wait for app ready in e2e specs`
- 结论：**未通过最终验收**。P0 为 0；P1 为 4；P2 为 1。修复 P1 后进入 I7.3，并由 C2.2 重跑完整矩阵。

## 验收环境与方法

- 使用 Chrome 验证真实本地应用交互；Web 与 Agent API 分别运行在 `localhost:3000`、`localhost:3002`。
- 使用本机 Chrome 的无头模式生成精确视口证据：`390×844`、`402×874`、`768×1024`、`1440×1000`。
- Timer、Appointment、Demo loading/error 使用与 I7.2 相同的确定性路由响应；没有依赖真实 LLM 输出。
- 参考基线：`docs/ui/valo/references/*.png` 与 `docs/ui/valo/design-manifest.md`。
- 行为回归：`valo-ui.spec.ts` 与 `demo-control.spec.ts` 共 18 项，全部通过。

## 证据索引

所有首轮截图位于 `docs/ui/valo/qa/first-pass/`，共 30 张。

| 场景 | 402×874 | 1440×1000 |
|---|---|---|
| Home | `home-402x874.png` | `home-1440x1000.png` |
| Switch Status | `switch-status-402x874.png` | `switch-status-1440x1000.png` |
| Profile Switch | `profile-switch-402x874.png` | `profile-switch-1440x1000.png` |
| Demo Control | `demo-control-402x874.png` | `demo-control-1440x1000.png` |
| Demo loading | `demo-loading-402x874.png` | `demo-loading-1440x1000.png` |
| Demo error | `demo-error-402x874.png` | `demo-error-1440x1000.png` |
| Demo reset confirm | `demo-reset-confirm-402x874.png` | `demo-reset-confirm-1440x1000.png` |
| Timer | `timer-402x874.png` | `timer-1440x1000.png` |
| Appointment | `appointment-402x874.png` | `appointment-1440x1000.png` |
| Trends overview | `trends-overview-402x874.png` | `trends-overview-1440x1000.png` |
| Trends Sleep | `trends-sleep-402x874.png`（整页） | `trends-sleep-1440x1000.png`（整页） |
| Trends Activity | `trends-activity-402x874.png`（整页） | `trends-activity-1440x1000.png`（整页） |
| AI Chat | `ai-chat-402x874.png` | `ai-chat-1440x1000.png` |
| My | `my-402x874.png`（整页） | `my-1440x1000.png`（整页） |

补充 Home 视口：`home-390x844.png`、`home-768x1024.png`。

## 通过项

| 验收项 | 结果 | 证据 |
|---|---|---|
| 只有状态圆环打开 Switch Status | 通过 | Chrome 实测：圆环打开后 `switch-status` 可见，Account/Demo 均未展开 |
| Avatar 不打开 Switch Status | 通过 | 四视口审计：Account form=1，Status form=0 |
| Demo Control 不打开 Switch Status | 通过 | 四视口审计：Status form=0 |
| 移动端 Bottom Sheet / 桌面端居中 Dialog | 通过 | 390/402/768 为 Bottom Sheet；1440 为 420px 居中 Dialog |
| 状态选择立即应用并关闭 | 通过 | Hero 状态即时变为 `prime-readiness`，可见 Dialog 数归零 |
| Demo Control 13 片段分组 | 通过 | 日常节律 6、运动训练 3、状态与摄入 4 |
| Demo loading / error / reset confirm | 通过但有差异 | 对应 6 张证据图；错误态见 P1-03、P2-01 |
| Timer / Appointment | 通过 | 移动 Sheet 与桌面 Dialog 均可操作 |
| Life Log / Sleep / Activity / AI Chat / My | 通过基础可用性 | 页面和关键控件可操作；视觉差异见下文 |
| 横向溢出 | 通过 | `/`、`/data-center`、`/my` 在四视口均 `scrollWidth === innerWidth` |
| 底部导航冲突 | 通过 | 移动端固定导航未遮挡主要操作；桌面端不渲染 BottomNav |

## 差异清单

### P1-01：Home Hero 未使用固化的 Valo 视觉资产

- 现象：当前 Hero 仅由 CSS 径向渐变绘制；仓库中不存在 `apps/web/public/valo/hero/*.png` 与 `asset-manifest.json`。
- 与参考差异：缺少星空/弧面装饰、Valo 标识、双层霓虹圆环及对应四态背景；移动端还保留了通用 `HEALTH ADVISOR` 顶栏。
- 证据：`home-402x874.png` 对比 `references/home-active-recovery.png`；代码只在 `HealthHero.tsx` 使用 `backgroundImage: gradient`。
- 修复边界：先完成 C1.2 的四个独立 Hero 装饰素材，再让 Hero 按状态消费清单；禁止继续用 CSS 渐变充当设计资产。

### P1-02：移动端选择状态后焦点未返回状态圆环

- 现象：选择 `prime-readiness` 并等待退出动画后，390、402、768 三个视口的 `document.activeElement` 均不是圆环；1440 视口通过。
- 影响：不满足设计清单与 I1.2 的焦点返回契约，键盘/辅助技术用户在移动布局中丢失操作位置。
- 根因范围：`SwitchStatusDialog` 接收 `triggerRef` 但未传给 `ValoSheet`；移动/桌面双实例同时挂载时依赖 `useOverlayBehavior` 自动捕获焦点不稳定。
- 修复边界：使用显式 trigger ref 的通用覆盖层契约修复，不增加视口特判或延迟补偿。

### P1-03：Demo Control 错误态会丢失可见头部与摘要

- 现象：普通片段请求返回 500 后，移动 Sheet 与桌面 Drawer 的头部、关闭按钮和摘要区域均被滚出首屏，内容上方出现大块空区。
- 影响：错误发生后无法直接看到抽屉标题和关闭入口；与 sticky header 契约不符。
- 证据：`demo-error-402x874.png`、`demo-error-1440x1000.png`；loading 状态对应截图正常。
- 根因范围：`ValoSheet/ValoDialog` 外层滚动容器与 `DemoControlContent` 内层滚动区嵌套，错误 Toast/焦点变化后外层滚动位置未归零。
- 修复边界：Demo Control 只保留一个内容滚动区，Header/Footer 固定在该滚动区之外；禁止通过错误完成后强制 `scrollTo(0,0)` 补偿。

### P1-04：AI Chat 与设计画板的核心构图不一致

- 现象：当前移动端使用 `AI 顾问 / BETA` 工具栏、5 个上下文标签、4 个矩形 prompt 与方形发送按钮；设计画板为 Valo 角色主视觉、3 个大圆角建议项和胶囊输入框。
- 影响：功能完整，但不满足 C2 的画板视觉比对目标。
- 证据：`ai-chat-402x874.png` 对比 `references/ai-chat.png`。
- 修复边界：保留生理标签和现有聊天能力，但按画板重新组织首屏层级、空态主视觉、建议项和 Composer；桌面仍使用既定 Drawer 形态。

### P2-01：错误 Toast 未纳入 Valo token 与可访问语义

- 现象：错误 Toast 使用硬编码 `bg-red-600/border-red-400`，视觉上脱离 Valo 表面体系；容器没有 `role="alert"` 或 `aria-live`。
- 证据：`demo-error-402x874.png`、`ToastContainer.tsx`。
- 修复建议：改用 `--valo-depleted`、`--valo-surface`、`--valo-border`，并添加适当 live-region 语义。

## C2.2 进入条件

- I7.3 修复 P1-01 至 P1-04，并为 P1-02、P1-03 增加浏览器回归测试。
- 重新生成四视口截图，不复用本目录中的首轮截图作为最终证据。
- 最终要求：P0/P1 为 0；无横向溢出、底部导航冲突、弹层遮挡、文字裁切或不可操作控件。
