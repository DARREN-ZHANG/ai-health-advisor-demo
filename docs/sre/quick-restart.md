# 本地快速重启服务

> 供 Agent 在修改代码/prompt/配置后快速重启服务以验证改动。

## 前置条件

- pnpm 已安装
- 根目录已执行过 `pnpm install`
- packages 已构建过（首次需要 `pnpm build`，之后增量改动无需重新构建）

## 一、本地开发模式（推荐）

使用 turborepo 并行启动前后端，支持文件监听自动重载。

### 1. 启动全部服务

```bash
# 在项目根目录执行
pnpm dev
```

这会并行启动：

- `apps/agent-api` (tsx watch, 端口 3001) — 后端代码改动自动重启
- `apps/web` (next dev, 端口 3000) — 前端代码改动热更新

### 2. 仅重启后端（prompt / 配置 / agent-core 改动后）

**tsx watch 会自动检测 `.ts` 文件变更并重启**，但以下情况需要手动重启：

- `data/sandbox/` 下的数据文件变更（prompt 模板、fallback 数据、profile 数据）
  — 原因：prompt-loader 有内存缓存，重启后才重新读取
- `.env` 文件变更
  — 原因：环境变量只在启动时加载一次

手动重启方法：在 `pnpm dev` 的终端中按 `Ctrl+C` 停掉，然后重新 `pnpm dev`。

如果只想单独重启后端：

```bash
# 先杀掉占用 3001 端口的进程
pids=$(lsof -ti:3001); [ -z "$pids" ] || kill -9 $pids

# 单独启动后端
pnpm --filter @health-advisor/agent-api dev
```

### 3. 仅重启前端

Next.js dev 模式支持热更新，绝大多数前端改动不需要手动重启。

如果需要完全重启：

```bash
pids=$(lsof -ti:3000); [ -z "$pids" ] || kill -9 $pids
pnpm --filter @health-advisor/web dev
```

### 4. agent-core 包代码变更后

`agent-core` 是 `agent-api` 的工作区依赖包。当前包入口直接指向 `src/index.ts`，但类型检查和生产构建仍需要构建该包。

流程：

```bash
# 1. 构建 agent-core 及其依赖（增量构建，很快）
pnpm --filter @health-advisor/agent-core... build

# 2. 如果 pnpm dev 正在运行，tsx watch 通常会检测到工作区源码变更并重启 agent-api
#    如果没有自动重启，手动 Ctrl+C 后重新 pnpm dev
```

## 二、Docker Compose 模式

适用于模拟生产环境或测试容器化部署。

```bash
# 启动（后台运行）
docker compose up -d --build

# 查看日志
docker compose logs -f agent-api    # 后端日志
docker compose logs -f web          # 前端日志

# 重启后端（代码改动后）
docker compose restart agent-api

# 重启前端
docker compose restart web

# 全部重启
docker compose down && docker compose up -d --build

# 停止
docker compose down
```

**注意**：Docker 模式默认 `FALLBACK_ONLY_MODE=true`，不会调用真实 LLM。
如需连接 LLM，在 docker-compose.yml 或 .env 中设置：

```bash
LLM_API_KEY=sk-xxx
FALLBACK_ONLY_MODE=false
```

## 三、验证检查清单

重启后按以下顺序验证服务是否正常：

```bash
# 1. 后端健康检查
curl -s http://localhost:3001/health | head -c 200

# 预期返回 JSON envelope，data.status 为 "ok"

# 2. 前端页面访问
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000

# 预期返回 200

# 3. AI 晨报接口（需要 LLM API Key 或 fallback 模式）
curl -s -X POST http://localhost:3001/ai/morning-brief \
  -H "Content-Type: application/json" \
  -d '{"profileId":"profile-a","pageContext":{"profileId":"profile-a","page":"homepage","timeframe":"week"}}' \
  | head -c 500

# 预期返回 JSON envelope，data 内包含 source/statusColor/summary/microTips 字段
```

## 四、常见问题

| 问题                   | 原因                                    | 解决方案                                                     |
| ---------------------- | --------------------------------------- | ------------------------------------------------------------ |
| prompt 改了不生效      | prompt-loader 内存缓存                  | 重启 agent-api                                               |
| .env 改了不生效        | 环境变量只在启动时加载                  | 重启 agent-api                                               |
| agent-core 改了不生效  | 依赖包需要重新构建或后端 watch 未触发   | `pnpm --filter @health-advisor/agent-core... build` 然后重启 |
| 端口被占用             | 上次进程未正常退出                      | `pids=$(lsof -ti:3001); [ -z "$pids" ] \|\| kill -9 $pids`   |
| 前端显示"离线受限模式" | 后端返回 fallback（LLM 调用失败或超时） | 检查 API Key 配置和后端日志                                  |
| packages build 报错    | 依赖包未安装或构建顺序问题              | 根目录执行 `pnpm build`                                      |
