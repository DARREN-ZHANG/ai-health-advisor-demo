# Release Candidate 冻结记录

> HD-018 | RC 分支与环境变量集合冻结。

---

## RC 分支

- **分支名**: `release/1.0.0-rc.1`
- **基于**: `main` at commit `8ca1b19`
- **创建日期**: 2026-04-13

---

## 环境变量集合

### agent-api 必需变量

| 变量 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `PORT` | number | `3002` | 服务端口 |
| `NODE_ENV` | enum | `development` | 运行环境 |
| `LLM_PROVIDER` | enum | `openai` | LLM 提供商 |
| `LLM_MODEL` | string | `gpt-4o-mini` | 模型名称 |
| `LLM_API_KEY` | string | — | API 密钥（fallback 模式下可选） |
| `LLM_TEMPERATURE` | number | `0.3` | 生成温度 |
| `LLM_MAX_RETRIES` | number | `2` | 最大重试次数 |
| `AI_TIMEOUT_MS` | number | `6000` | AI 超时（毫秒） |
| `ENABLE_GOD_MODE` | boolean | `false` | 启用上帝模式 |
| `FALLBACK_ONLY_MODE` | boolean | `false` | 纯离线模式 |
| `LOG_LEVEL` | enum | `info` | 日志级别 |
| `DATA_DIR` | string | `./data/sandbox` | 沙箱数据目录 |

### web 必需变量（构建时）

| 变量 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `NEXT_PUBLIC_AGENT_API_BASE_URL` | string | `http://localhost:3002` | 后端 API 地址 |
| `NEXT_PUBLIC_ENABLE_GOD_MODE` | boolean | `false` | 启用上帝模式 |

### Docker Compose 变量覆盖

| 变量 | Docker 默认值 | 说明 |
|------|---------------|------|
| `FALLBACK_ONLY_MODE` | `true` | 离线演示友好 |
| `ENABLE_GOD_MODE` | `true` | 演示完整功能 |

---

## 依赖版本冻结

### 运行时核心依赖

| 包 | 版本 |
|----|------|
| next | 15.x |
| react / react-dom | 19.x |
| fastify | 5.2.x |
| @langchain/core | 0.3.x |
| @tanstack/react-query | 5.x |
| zustand | 5.x |
| zod | 3.x |
| echarts | 5.x |

### 开发依赖

| 包 | 版本 |
|----|------|
| typescript | 5.7.x |
| vitest | 3.x |
| eslint | 9.x |
| playwright | 1.50.x |
| turbo | 2.x |
| pnpm | 10.x |

---

## 冻结规则

1. **禁止**合并新功能到 RC 分支
2. **允许**修复 Bug 并 cherry-pick 到 RC
3. **允许**更新文档
4. 任何依赖版本变更需经 TL 审批
5. RC 验收通过后合并回 `main` 并打 tag `v1.0.0`
