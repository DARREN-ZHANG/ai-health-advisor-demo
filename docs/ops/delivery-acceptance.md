# 交付验收清单

> HD-020 | 可按清单逐项验收系统目标与 PRD 核心能力。

---

## 一、工程基座

- [ ] Monorepo 可安装、编译、lint、测试、启动
- [ ] Turborepo pipeline 正常（dev/build/lint/test/typecheck）
- [ ] TypeScript 严格模式，无 any 滥用
- [ ] ESLint 零 error
- [ ] 测试覆盖率 >= 80%

---

## 二、后端（agent-api）

- [ ] Fastify 服务正常启动，监听 3002 端口
- [ ] `/health` 端点返回 200
- [ ] 环境变量 Zod 校验生效（缺少 LLM_API_KEY 时拒绝启动）
- [ ] 启动资产校验（profiles/fallbacks 缺失时 FATAL 退出）
- [ ] AI 路由（morning-brief / view-summary / chat）正常响应
- [ ] Fallback 机制在 LLM 不可用时兜底
- [ ] 请求生命周期日志（requestId / durationMs / aiMeta）
- [ ] Session 管理正常（X-Session-Id 请求/响应）

---

## 三、前端（web）

- [ ] Next.js 15 正常启动，监听 3000 端口
- [ ] 首页加载无白屏，骨架态正常
- [ ] 晨报卡片展示 AI 生成内容
- [ ] 历史趋势图表正常渲染
- [ ] Data Center 所有 Tab 可切换，图表正常
- [ ] AI Advisor 抽屉打开/关闭正常
- [ ] AI Advisor 发送/接收消息正常
- [ ] God-Mode 激活/档案切换/事件注入/重置正常
- [ ] 404 页面正常显示
- [ ] 错误边界正常捕获异常（无白屏）
- [ ] 移动端布局正常（底部导航、响应式）

---

## 四、AI / LLM

- [ ] LLM 集成正常（至少支持 OpenAI / Anthropic / Gemini 之一）
- [ ] Prompt 模板加载正常
- [ ] AI 响应结构化（AgentResponseEnvelope）
- [ ] 超时处理（6s AI 超时 + 30s 网络超时）
- [ ] Fallback 响应在 LLM 失败时触发
- [ ] Fallback 内容包含 summary / microTips / chartTokens

---

## 五、沙箱数据

- [ ] Profile JSON 文件完整且符合 Schema
- [ ] Fallback JSON 结构正确（summary / chartTokens / microTips）
- [ ] Scenario 清单结构正确
- [ ] `pnpm validate` 校验通过
- [ ] 多档案切换正常（至少 2 个档案）

---

## 六、God-Mode

- [ ] 隐藏激活机制（5 次点击）正常
- [ ] 档案切换实时生效
- [ ] Active Sensing 事件注入和 Banner 显示
- [ ] 指标覆盖功能正常
- [ ] 重置功能清除所有覆盖
- [ ] API 端点正常（/god-mode/*）

---

## 七、Docker & 部署

- [ ] agent-api Docker 镜像构建成功
- [ ] web Docker 镜像构建成功
- [ ] `docker compose up` 一键启动正常
- [ ] agent-api healthcheck 通过
- [ ] web 依赖 agent-api 健康后启动
- [ ] `scripts/reset.sh` 重置功能正常

---

## 八、文档

- [ ] 架构文档（ARCHITECTURE.md）与实现一致
- [ ] PRD 核心能力全部实现
- [ ] Smoke Runbook 可执行
- [ ] 离线演示 Runbook 可执行
- [ ] Demo Rehearsal 清单完整

---

## 九、验收结论

| 项目 | 状态 | 备注 |
|------|------|------|
| 验收人 | | |
| 验收日期 | | |
| 结论 | PASS / FAIL | |
| 遗留问题 | | |

> 验收标准：以上所有 checklist 项全部 PASS 方可交付。
