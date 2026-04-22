# 离线演示 Runbook

> HD-016 | 在断网或 LLM Provider 不可用时的演示指引。

## 适用场景

- 演示现场无稳定网络
- LLM API Key 额度用尽或服务商故障
- 离线环境（内网/展台）

---

## 方式一：Fallback-Only 模式（推荐）

### 原理

设置 `FALLBACK_ONLY_MODE=true` 后，agent-api 跳过所有 LLM 调用，直接返回预设的 fallback 响应。所有功能仍可演示，数据来自本地沙箱文件。

### 步骤

1. **启动后端**

   ```bash
   # 方式 A：直接运行
   cd apps/agent-api
   FALLBACK_ONLY_MODE=true ENABLE_GOD_MODE=true pnpm dev

   # 方式 B：Docker Compose
   FALLBACK_ONLY_MODE=true docker compose up --build
   ```

2. **启动前端**

   ```bash
   cd apps/web
   pnpm dev
   ```

3. **验证**

   - 首页标题区域显示 "运行在离线受限模式"
   - AI Advisor 回复带有黄色 "Fallback" 标签
   - 所有图表数据正常（来自沙箱数据文件）

### 注意事项

- 无需配置 `LLM_API_KEY`
- `LLM_PROVIDER` 和 `LLM_MODEL` 可保持默认值
- AI 回复质量为预设模板，不如 LLM 生成灵活

---

## 方式二：Docker Compose 一键离线

```bash
# 构建并启动（默认即 fallback 模式）
docker compose up --build

# 自定义 API 地址
NEXT_PUBLIC_AGENT_API_BASE_URL=http://localhost:3002 docker compose up --build
```

### 默认配置

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `FALLBACK_ONLY_MODE` | `true` | 离线模式 |
| `ENABLE_GOD_MODE` | `true` | 启用 God-Mode |
| `LOG_LEVEL` | `info` | 日志级别 |

### 验证服务健康

```bash
curl -f http://localhost:3002/health
# 应返回 200 OK
```

---

## 演示流程建议

### 5 分钟快速演示

1. **首页** — 展示晨报、微贴士、趋势卡片
2. **Data Center** — 切换 Tab 和时间范围，展示图表
3. **AI Advisor** — 发送问题，展示 fallback 回复
4. **God-Mode** — 切换档案、注入事件

### 10 分钟完整演示

在 5 分钟流程基础上增加：

5. **档案切换** — 展示不同用户档案的数据差异
6. **事件注入** — 模拟实时健康事件触发
7. **指标覆盖** — 演示自定义指标调整
8. **重置** — 展示一键重置功能

---

## 常见问题

### Q: 页面白屏？
A: 确认 agent-api 是否正常运行，检查 `http://localhost:3002/health`。

### Q: AI 回复很慢？
A: 检查是否误用了 LLM 模式。确认 `FALLBACK_ONLY_MODE=true`。

### Q: Docker 构建失败？
A: 确认 pnpm lockfile 存在且 Docker 有足够内存（建议 4GB+）。

### Q: 图表无数据？
A: 确认 `data/sandbox/` 目录存在且包含有效的 profile JSON 文件。可运行 `pnpm validate` 检查。
