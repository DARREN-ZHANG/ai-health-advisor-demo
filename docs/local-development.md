# 本地开发启动指南

## 前置要求

- Node.js >= 22
- pnpm >= 9.15（项目已锁定版本）
- 操作系统：macOS / Linux / Windows (WSL)

## 快速开始

### 1. 安装依赖

```bash
pnpm install
```

### 2. 配置环境变量

#### 后端 `apps/agent-api/.env`

```bash
# === 必填 ===
LLM_API_KEY=你的API密钥           # FALLBACK_ONLY_MODE=false 时必填

# === LLM 配置 ===
LLM_BASE_URL=                     # 自定义 API 地址，留空则用 OpenAI 默认地址
                                  # 智谱: https://open.bigmodel.cn/api/paas/v4
LLM_PROVIDER=openai               # openai | anthropic | gemini（当前仅 openai 可用）
                                  # ⚠️ 不能设为空字符串，否则后端启动报错
LLM_MODEL=gpt-4o-mini             # 模型名称

# === 功能开关 ===
FALLBACK_ONLY_MODE=false          # true=使用预置回复（无需API Key）; false=调用真实 LLM
ENABLE_GOD_MODE=true              # 是否启用 God-Mode 管理面板
AI_TIMEOUT_MS=15000               # AI 请求超时（毫秒），推理模型建议 ≥ 15s

# === 以下一般不用改 ===
PORT=3001
LOG_LEVEL=info
CORS_ALLOWED_ORIGINS=http://localhost:3000
DATA_DIR=                         # 沙盒数据目录，默认自动定位到 monorepo 根目录的 data/sandbox
```

#### 前端 `apps/web/.env`

```bash
NEXT_PUBLIC_AGENT_API_BASE_URL=http://localhost:3001
NEXT_PUBLIC_ENABLE_GOD_MODE=true
```

### 3. 验证 LLM 连通性

```bash
node apps/agent-api/src/scripts/test-llm.mjs
```

预期输出：

```
=== LLM 连通性测试 ===
...
✅ 连接成功！耗时 xxxxms
```

### 4. 启动开发服务器

```bash
pnpm dev
```

这将同时启动：
- **后端 API**：http://localhost:3001
- **前端 Web**：http://localhost:3000

启动后访问 http://localhost:3000 即可使用。

## Docker 启动（备选）

```bash
docker compose up --build
```

通过 `.env` 或 shell 环境变量传入配置：

```bash
LLM_API_KEY=xxx FALLBACK_ONLY_MODE=false docker compose up --build
```

## 常用命令

| 命令 | 说明 |
|------|------|
| `pnpm dev` | 启动所有服务的开发模式 |
| `pnpm build` | 构建所有包 |
| `pnpm test` | 运行全部单元测试 |
| `pnpm test:e2e` | 运行 E2E 测试（Playwright） |
| `pnpm typecheck` | TypeScript 类型检查 |
| `pnpm lint` | ESLint 检查 |
| `pnpm validate` | 校验沙盒数据结构 |
| `pnpm reset` | 重置运行时状态 |

## 测试账号

| Profile | 姓名 | 特点 | 适用场景 |
|---------|------|------|----------|
| profile-a | 张健康 | 32岁男，指标正常 | 正常流程 |
| profile-b | 李普通 | 45岁女，数据有缺失 | 缺失值处理 |
| profile-c | 王压力 | 28岁男，高压力 | 警告/压力场景 |

切换方式：通过 God-Mode 面板（快速点击标题 "AI Health Advisor" 5次激活）。

## 常见问题

### pnpm install 失败

确保 pnpm 版本正确：

```bash
corepack enable && corepack prepare pnpm@9.15.0 --activate
```

### LLM 请求超时

1. 检查 `AI_TIMEOUT_MS` 是否足够（推理模型建议 ≥ 15000）
2. 检查 `LLM_BASE_URL` 和 `LLM_API_KEY` 是否正确
3. 运行 `node apps/agent-api/src/scripts/test-llm.mjs` 排查

### God-Mode 面板无法打开

1. 确认 `ENABLE_GOD_MODE=true`（后端 + 前端都需要）
2. 点击速度要快，5 次点击在 2 秒内完成

### 端口被占用

后端默认 3001，前端默认 3000。修改对应 `.env` 中的 `PORT`（后端）或启动参数 `--port`（前端）。

### 前端白屏

检查浏览器控制台，通常是 `NEXT_PUBLIC_AGENT_API_BASE_URL` 配置错误导致无法连接后端。

### 后端启动报 ZodError / invalid_enum_value

检查 `.env` 中 `LLM_PROVIDER` 的值。必须是 `openai`、`anthropic` 或 `gemini` 之一，**不能为空字符串**。不需要时删掉这行即可（会使用默认值 `openai`）。
