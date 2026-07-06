# Valo UI 跨视口视觉验收

## 状态

- 阶段：I7.3 视觉差异修复完成
- 日期：2026-07-06
- 实现基线：`16a0f7d fix(web): localize toast close and tune aria-live politeness`
- 结论：**通过最终验收**。P0/P1/P2 均为 0。C2.2 进入条件全部满足。

## 验收环境与方法

- 使用 Chrome 验证真实本地应用交互；Web 与 Agent API 分别运行在 `localhost:3000`、`localhost:3002`。
- 使用本机 Chrome 的无头模式生成精确视口证据：`390×844`、`402×874`、`768×1024`、`1440×1000`。
- Timer、Appointment、Demo loading/error 使用与 I7.2 相同的确定性路由响应；没有依赖真实 LLM 输出。
- 参考基线：`docs/ui/valo/references/*.png` 与 `docs/ui/valo/design-manifest.md`。
- 行为回归：`valo-ui.spec.ts` 与 `demo-control.spec.ts` 共 18 项，全部通过。

## 证据索引

I7.3 修复后截图位于 `docs/ui/valo/qa/i7.3/`，共 24 张（6 场景 × 4 视口）。

| 场景 | 402×874 | 1440×1000 |
|---|---|---|
| Home | `home-402x874.png` | `home-1440x1000.png` |
| Switch Status | `switch-status-402x874.png` | `switch-status-1440x1000.png` |
| Demo Control | `demo-control-402x874.png` | `demo-control-1440x1000.png` |
| AI Chat | `ai-chat-402x874.png` | `ai-chat-1440x1000.png` |
| Trends Overview | `trends-overview-402x874.png` | `trends-overview-1440x1000.png` |
| My | `my-402x874.png` | `my-1440x1000.png` |

补充：390×844 与 768×1024 视口的截图也一并落入 `qa/i7.3/`，文件名遵循 `<scenario>-<viewport>.png` 模式。截图由 `apps/web/e2e/i7.3-screenshots.spec.ts` 在 Playwright 中通过 `page.route` mock 全部后端响应生成，可重复运行：`pnpm --filter web exec playwright test e2e/i7.3-screenshots.spec.ts --workers=1`。

首轮证据保留在 `qa/first-pass/`，作为修复前对比基线。

## 通过项

| 验收项 | 结果 | 证据 |
|---|---|---|
| 只有状态圆环打开 Switch Status | 通过 | Chrome 实测：圆环打开后 `switch-status` 可见，Account/Demo 均未展开 |
| Avatar 不打开 Switch Status | 通过 | 四视口审计：Account form=1，Status form=0 |
| Demo Control 不打开 Switch Status | 通过 | 四视口审计：Status form=0 |
| 移动端 Bottom Sheet / 桌面端居中 Dialog | 通过 | 390/402/768 为 Bottom Sheet；1440 为 420px 居中 Dialog |
| 状态选择立即应用并关闭 | 通过 | Hero 状态即时变为 `prime-readiness`，可见 Dialog 数归零 |
| Demo Control 13 片段分组 | 通过 | 日常节律 6、运动训练 3、状态与摄入 4 |
| Demo loading / error / reset confirm | 通过 | 首轮证据 6 张位于 `qa/first-pass/`；P1-03 / P2-01 在 I7.3 已修复，行为回归见 `demo-control.spec.ts` |
| Timer / Appointment | 通过 | 移动 Sheet 与桌面 Dialog 均可操作 |
| Life Log / Sleep / Activity / AI Chat / My | 通过基础可用性 | 页面和关键控件可操作；I7.3 视觉证据见 `qa/i7.3/` |
| 横向溢出 | 通过 | `/`、`/data-center`、`/my` 在四视口均 `scrollWidth === innerWidth` |
| 底部导航冲突 | 通过 | 移动端固定导航未遮挡主要操作；桌面端不渲染 BottomNav |

## 差异清单（I7.3 已全部修复）

| 编号 | 标题 | 修复 commit | 备注 |
|---|---|---|---|
| P1-01 | Home Hero 未使用固化的 Valo 视觉资产 | `96a0c42` + `28c76cf` | HeroAssetLayer 消费 4 张 PNG + manifest，state 切换走 onLoad 渐显；前置基础设施 `91e7209` 提供组件与清单 |
| P1-02 | 移动端选择状态后焦点未返回状态圆环 | `c1fd2ed` + `bd2b802` | triggerRef 透传到 useFocusReturn；Playwright 用 `toBeFocused` 自动重试吸收 exit 动画时序 |
| P1-03 | Demo Control 错误态会丢失可见头部与摘要 | `95b5600` | `bodyScroll=native` + `shrink-0` 替代 sticky；AI Chat 同步修复 |
| P1-04 | AI Chat 与设计画板的核心构图不一致 | `434388f` + `12c700e` | SVG 霓虹环 + 3 胶囊 SmartPrompts + 胶囊 Composer；SmartPrompts 仅空态可见；后续 `12c700e` 修复 gradient id 冲突 |
| P2-01 | 错误 Toast 未纳入 Valo token 与可访问语义 | `380ae0e` + `16a0f7d` | TYPE_TOKEN 映射 + `role=alert` + `aria-live` 按 type 派生 + i18n 关闭按钮 |

修复细节：

- **P1-01**：新增 `apps/web/src/lib/hero-asset-manifest.ts` 与 `HeroAssetLayer` 组件；用户手动从 Figma 导出 4 张 804×732 PNG 到 `apps/web/public/valo/hero/`；位图切换走 `useEffect + onLoad + opacity transition` 避免硬切。
- **P1-02**：`useOverlayBehavior` 接受 `triggerRef`，透传到 `useFocusReturn`；`SwitchStatusDialog` 把圆环 ref 显式传给两个 overlay；其他 overlay 调用方仅开放接口不强制传。
- **P1-03**：`ValoSheet/ValoDialog` 新增 `bodyScroll?: 'managed' | 'native'`（默认 managed，向后兼容）；DemoControlContent 与 ChatContent 外层改为 `flex flex-1 flex-col min-h-0`，header/footer 改 `shrink-0`。
- **P1-04**：SmartPrompts 4→3 胶囊（移除 stress-inquiry，i18n 翻译保留向后兼容）；EmptyState 重写为 SVG 霓虹环（双 circle + linearGradient + drop-shadow），渐变 id 用 `useId` 去重；Composer textarea 与 send 按钮改 `rounded-full`；SmartPrompts 从 footer 移到空态分支。
- **P2-01**：`TYPE_TOKEN` 把 info/success/warning/error 绑到 prime/active/sluggish/depleted；容器 `role=alert + aria-live（assertive for error, polite for others） + aria-atomic=true`；关闭按钮加 `type=button + aria-label=i18n + stopPropagation`。

## C2.2 进入条件（已满足）

- ✅ I7.3 修复 P1-01 至 P1-04 与 P2-01，并为 P1-02 / P1-03 增加浏览器回归测试。
- ✅ 重新生成四视口截图，落到 `qa/i7.3/`，不复用首轮截图。
- ✅ 最终要求达成：P0/P1/P2 均为 0；无横向溢出、底部导航冲突、弹层遮挡、文字裁切或不可操作控件。
