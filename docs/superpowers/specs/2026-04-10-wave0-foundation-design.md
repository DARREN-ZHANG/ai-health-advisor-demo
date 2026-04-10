# Wave 0 — 仓库与工程基座设计

## 1. 概述

Wave 0 建立 monorepo 工程基座，使仓库可以安装、编译、lint、测试、启动，并完成 apps/packages 空壳初始化。

## 2. 技术选型

| 维度 | 选择 | 版本策略 |
|------|------|---------|
| Node.js | 23+ Current | `.nvmrc` 指定 `23` |
| 包管理器 | pnpm 9+ | workspace protocol |
| Monorepo 编排 | Turborepo 2.x | `^` 版本范围 |
| 前端框架 | Next.js 15 (App Router) + React 19 | `^` 版本范围 |
| 前端样式 | Tailwind CSS 4 | `^` 版本范围 |
| 后端框架 | Fastify 5 | `^` 版本范围 |
| TypeScript | 5.7+ | strict mode |
| 单测 | Vitest 3.x | `^` 版本范围 |
| E2E | Playwright 1.50+ | `^` 版本范围 |
| Lint | ESLint 扁平配置 | `^` 版本范围 |
| 格式化 | Prettier | `^` 版本范围 |
| CI | 不配置 | 本地开发为主 |

## 3. 目录结构

```
health-advisor/
├── apps/
│   ├── web/                # Next.js 15 App Router
│   └── agent-api/          # Fastify 5
├── packages/
│   └── config/             # 共享配置（tsconfig/eslint/prettier/vitest）
├── package.json            # 根级 scripts
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
├── .nvmrc
├── .gitignore
├── .editorconfig
└── .npmrc
```

## 4. 根级配置

### 4.1 pnpm-workspace.yaml

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

### 4.2 turbo.json

定义 pipeline：`dev`（持久）、`build`（拓扑依赖）、`lint`、`test`、`typecheck`、`clean`。缓存键包含 `tsconfig.json` 和 `package.json`。

### 4.3 tsconfig.base.json

- `strict: true`
- `noUncheckedIndexedAccess: true`
- `exactOptionalPropertyTypes: true`
- `resolveJsonModule: true`
- `declaration: true`
- `declarationMap: true`
- `sourceMap: true`

派生配置：
- `tsconfig.react.json` — 增加 JSX、Next.js 类型
- `tsconfig.node.json` — 增加 Node 类型

### 4.4 .npmrc

```
shamefully-hoist=true
strict-peer-dependencies=false
```

### 4.5 .nvmrc

```
23
```

## 5. packages/config

提供 4 类共享配置：

| 配置类型 | 文件 | 消费方式 |
|---------|------|---------|
| TypeScript | `tsconfig.react.json` + `tsconfig.node.json` | apps 通过 `extends` 继承 |
| ESLint | `eslint.config.base.mjs` | 扁平配置，根级引用 |
| Prettier | `prettier.config.base.mjs` | 根级引用 |
| Vitest | `vitest.config.base.ts` | 包级引用 |

Playwright 配置仅 web 使用，放在 `apps/web/` 下。

## 6. apps/agent-api

```
apps/agent-api/
├── src/
│   ├── index.ts            # 入口，监听 PORT
│   ├── app.ts              # Fastify 实例组装与插件注册
│   └── routes/
│       └── health.ts       # GET /health
├── tsconfig.json
├── package.json
└── .env.example
```

**DoD：** `pnpm dev --filter agent-api` 启动后 `GET /health` 返回 `{"status":"ok","timestamp":"..."}`.

### 环境变量

```env
PORT=3001
NODE_ENV=development
LLM_PROVIDER=
LLM_MODEL=
LLM_API_KEY=
AI_TIMEOUT_MS=6000
ENABLE_GOD_MODE=true
SENTRY_DSN=
LOG_LEVEL=debug
FALLBACK_ONLY_MODE=false
```

## 7. apps/web

```
apps/web/
├── src/
│   └── app/
│       ├── layout.tsx      # 根 layout，暗黑主题基线
│       └── page.tsx        # 占位首页
├── tsconfig.json
├── next.config.ts
├── postcss.config.mjs
├── package.json
└── .env.example
```

**DoD：** `pnpm dev --filter web` 启动后首页可访问。

### 环境变量

```env
NEXT_PUBLIC_AGENT_API_BASE_URL=http://localhost:3001
NEXT_PUBLIC_ENABLE_GOD_MODE=true
```

## 8. ESLint + Prettier

- 根级 ESLint 扁平配置，统一规则
- 根级 Prettier 配置，统一格式
- `pnpm lint` 和 `pnpm format:check` 通过

## 9. Vitest + Playwright

- Vitest 基础配置在 `packages/config/vitest.config.base.ts`
- 各包可有专属覆盖
- Playwright 在 `apps/web/playwright.config.ts`，smoke spec 检查页面标题

## 10. 根级脚本

```json
{
  "dev": "turbo run dev",
  "build": "turbo run build",
  "lint": "turbo run lint",
  "format": "prettier --write .",
  "format:check": "prettier --check .",
  "typecheck": "turbo run typecheck",
  "test": "turbo run test",
  "test:e2e": "pnpm --filter web test:e2e",
  "clean": "turbo run clean && rimraf node_modules"
}
```

## 11. Wave 0 DoD

- [ ] `pnpm install` 成功
- [ ] `pnpm dev` 同时启动 web 和 agent-api
- [ ] `pnpm build` 通过
- [ ] `pnpm lint` 通过
- [ ] `pnpm typecheck` 通过
- [ ] `pnpm test` 通过
- [ ] `pnpm format:check` 通过
- [ ] agent-api `/health` 返回 `{"status":"ok"}`
- [ ] web 首页可访问并显示占位内容
