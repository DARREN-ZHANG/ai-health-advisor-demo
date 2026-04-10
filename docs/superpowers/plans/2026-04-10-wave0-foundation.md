# Wave 0 — 仓库与工程基座 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立 monorepo 工程基座，使仓库可以安装、编译、lint、测试、启动，并完成 apps/packages 空壳。

**Architecture:** pnpm workspace + Turborepo 编排 monorepo。TypeScript strict 模式通过根级 `tsconfig.base.json` 共享。Fastify 5 后端空壳 + Next.js 15 前端空壳分别位于 `apps/` 下。ESLint 9 扁平配置 + Prettier 根级统一配置。

**Tech Stack:** pnpm 9+, Turborepo 2.x, TypeScript 5.7+, Next.js 15, React 19, Fastify 5, Tailwind CSS 4, Vitest 3.x, Playwright 1.50+, ESLint 9 (flat config), Prettier 3.

---

## File Structure Map

| File                                                 | Responsibility          |
| ---------------------------------------------------- | ----------------------- |
| `package.json`                                       | 根级依赖与脚本          |
| `pnpm-workspace.yaml`                                | workspace 声明          |
| `turbo.json`                                         | Turborepo task pipeline |
| `tsconfig.base.json`                                 | TypeScript strict 基座  |
| `.nvmrc`                                             | Node 版本               |
| `.gitignore`                                         | 忽略规则                |
| `.editorconfig`                                      | 编辑器统一              |
| `.npmrc`                                             | pnpm 行为配置           |
| `eslint.config.mjs`                                  | ESLint 扁平配置         |
| `prettier.config.mjs`                                | Prettier 配置           |
| `packages/config/package.json`                       | config 包骨架           |
| `apps/agent-api/package.json`                        | 后端依赖                |
| `apps/agent-api/tsconfig.json`                       | 后端 TS 配置            |
| `apps/agent-api/src/index.ts`                        | 后端入口                |
| `apps/agent-api/src/app.ts`                          | Fastify 实例组装        |
| `apps/agent-api/src/routes/health.ts`                | Health 路由             |
| `apps/agent-api/src/routes/__tests__/health.test.ts` | Health 路由测试         |
| `apps/agent-api/.env.example`                        | 后端环境变量模板        |
| `apps/web/package.json`                              | 前端依赖                |
| `apps/web/tsconfig.json`                             | 前端 TS 配置            |
| `apps/web/next.config.ts`                            | Next.js 配置            |
| `apps/web/postcss.config.mjs`                        | PostCSS + Tailwind      |
| `apps/web/src/app/globals.css`                       | Tailwind CSS 入口       |
| `apps/web/src/app/layout.tsx`                        | 根 layout               |
| `apps/web/src/app/page.tsx`                          | 首页占位                |
| `apps/web/.env.example`                              | 前端环境变量模板        |
| `apps/web/playwright.config.ts`                      | Playwright 配置         |
| `apps/web/e2e/smoke.spec.ts`                         | E2E smoke 测试          |

---

### Task 1: Root Monorepo Foundation

**Files:**

- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `.nvmrc`
- Create: `.gitignore`
- Create: `.editorconfig`
- Create: `.npmrc`

- [ ] **Step 1: Write root package.json**

```json
{
  "name": "health-advisor",
  "private": true,
  "packageManager": "pnpm@9.15.0",
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "lint": "turbo run lint",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "typecheck": "turbo run typecheck",
    "test": "turbo run test",
    "test:e2e": "pnpm --filter web test:e2e",
    "clean": "turbo run clean && rimraf node_modules"
  },
  "devDependencies": {
    "@eslint/js": "^9.20.0",
    "eslint": "^9.20.0",
    "eslint-config-prettier": "^10.0.0",
    "prettier": "^3.5.0",
    "rimraf": "^6.0.0",
    "turbo": "^2.4.0",
    "typescript": "^5.7.0",
    "typescript-eslint": "^8.24.0"
  }
}
```

- [ ] **Step 2: Write pnpm-workspace.yaml**

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

- [ ] **Step 3: Write .nvmrc**

```
23
```

- [ ] **Step 4: Write .gitignore**

```
node_modules
dist
.next
.env
.env.local
*.tsbuildinfo
.turbo
coverage
test-results
playwright-report
```

- [ ] **Step 5: Write .editorconfig**

```ini
root = true

[*]
end_of_line = lf
insert_final_newline = true
trim_trailing_whitespace = true
charset = utf-8
indent_style = space
indent_size = 2
```

- [ ] **Step 6: Write .npmrc**

```
shamefully-hoist=true
strict-peer-dependencies=false
```

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-workspace.yaml .nvmrc .gitignore .editorconfig .npmrc
git commit -m "chore: initialize monorepo root foundation"
```

---

### Task 2: Turborepo + TypeScript Configs

**Files:**

- Create: `turbo.json`
- Create: `tsconfig.base.json`
- Create: `packages/config/package.json`

- [ ] **Step 1: Write turbo.json**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**", "!.next/cache/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "dependsOn": ["^build"]
    },
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "test": {
      "dependsOn": ["^build"]
    },
    "clean": {
      "cache": false
    }
  }
}
```

- [ ] **Step 2: Write tsconfig.base.json**

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true
  }
}
```

- [ ] **Step 3: Create packages/config skeleton**

```bash
mkdir -p packages/config
```

`packages/config/package.json`:

```json
{
  "name": "@health-advisor/config",
  "version": "0.0.0",
  "private": true
}
```

- [ ] **Step 4: Commit**

```bash
git add turbo.json tsconfig.base.json packages/config/
git commit -m "chore: add turborepo pipeline and typescript base config"
```

---

### Task 3: Code Quality Configs (ESLint + Prettier)

**Files:**

- Create: `eslint.config.mjs`
- Create: `prettier.config.mjs`

- [ ] **Step 1: Write ESLint flat config**

`eslint.config.mjs`:

```javascript
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettierConfig,
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/playwright-report/**',
    ],
  },
);
```

- [ ] **Step 2: Write Prettier config**

`prettier.config.mjs`:

```javascript
export default {
  semi: true,
  singleQuote: true,
  trailingComma: 'all',
  printWidth: 100,
  tabWidth: 2,
};
```

- [ ] **Step 3: Commit**

```bash
git add eslint.config.mjs prettier.config.mjs
git commit -m "chore: add eslint and prettier configs"
```

---

### Task 4: Backend Skeleton (agent-api)

**Files:**

- Create: `apps/agent-api/package.json`
- Create: `apps/agent-api/tsconfig.json`
- Create: `apps/agent-api/src/index.ts`
- Create: `apps/agent-api/src/app.ts`
- Create: `apps/agent-api/src/routes/health.ts`
- Create: `apps/agent-api/src/routes/__tests__/health.test.ts`

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p apps/agent-api/src/routes/__tests__
```

- [ ] **Step 2: Write package.json**

`apps/agent-api/package.json`:

```json
{
  "name": "@health-advisor/agent-api",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "clean": "rimraf dist node_modules"
  },
  "dependencies": {
    "dotenv": "^16.4.0",
    "fastify": "^5.2.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0",
    "vitest": "^3.1.0"
  }
}
```

- [ ] **Step 3: Write tsconfig.json**

`apps/agent-api/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "target": "es2022",
    "lib": ["es2022"],
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Write app.ts — Fastify instance builder**

`apps/agent-api/src/app.ts`:

```typescript
import Fastify from 'fastify';
import { healthRoutes } from './routes/health.js';

export async function buildApp() {
  const app = Fastify({ logger: true });

  await app.register(healthRoutes);

  return app;
}
```

- [ ] **Step 5: Write health.ts — health route plugin**

`apps/agent-api/src/routes/health.ts`:

```typescript
import type { FastifyInstance } from 'fastify';

export async function healthRoutes(app: FastifyInstance) {
  app.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });
}
```

- [ ] **Step 6: Write index.ts — entry point**

`apps/agent-api/src/index.ts`:

```typescript
import 'dotenv/config';
import { buildApp } from './app.js';

const PORT = Number(process.env.PORT) || 3001;

async function main() {
  const app = await buildApp();

  try {
    await app.listen({ port: PORT, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
```

- [ ] **Step 7: Write health route test**

`apps/agent-api/src/routes/__tests__/health.test.ts`:

```typescript
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { buildApp } from '../../app.js';
import type { FastifyInstance } from 'fastify';

describe('GET /health', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  test('returns status ok with timestamp', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe('ok');
    expect(body.timestamp).toBeTruthy();
  });
});
```

- [ ] **Step 8: Commit**

```bash
git add apps/agent-api/
git commit -m "feat(agent-api): initialize Fastify backend skeleton with health route"
```

---

### Task 5: Frontend Skeleton (web)

**Files:**

- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/next.config.ts`
- Create: `apps/web/postcss.config.mjs`
- Create: `apps/web/src/app/globals.css`
- Create: `apps/web/src/app/layout.tsx`
- Create: `apps/web/src/app/page.tsx`

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p apps/web/src/app
```

- [ ] **Step 2: Write package.json**

`apps/web/package.json`:

```json
{
  "name": "@health-advisor/web",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev --port 3000",
    "build": "next build",
    "start": "next start",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:e2e": "playwright test",
    "clean": "rimraf .next dist node_modules"
  },
  "dependencies": {
    "next": "^15.2.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@playwright/test": "^1.51.0",
    "@tailwindcss/postcss": "^4.0.0",
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.7.0",
    "vitest": "^3.1.0"
  }
}
```

- [ ] **Step 3: Write tsconfig.json**

`apps/web/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "esnext",
    "moduleResolution": "bundler",
    "target": "es2022",
    "lib": ["dom", "dom.iterable", "es2022"],
    "jsx": "preserve",
    "noEmit": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src", "next-env.d.ts"]
}
```

- [ ] **Step 4: Write next.config.ts**

`apps/web/next.config.ts`:

```typescript
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {};

export default nextConfig;
```

- [ ] **Step 5: Write postcss.config.mjs**

`apps/web/postcss.config.mjs`:

```javascript
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
```

- [ ] **Step 6: Write globals.css**

`apps/web/src/app/globals.css`:

```css
@import 'tailwindcss';

:root {
  --background: #0a0a0f;
  --foreground: #e5e5e5;
}

body {
  background-color: var(--background);
  color: var(--foreground);
}
```

- [ ] **Step 7: Write layout.tsx**

`apps/web/src/app/layout.tsx`:

```tsx
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI Health Advisor',
  description: '智能健康顾问',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 8: Write page.tsx**

`apps/web/src/app/page.tsx`:

```tsx
export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold">AI Health Advisor</h1>
        <p className="mt-4 text-lg text-gray-400">智能健康顾问</p>
      </div>
    </main>
  );
}
```

- [ ] **Step 9: Commit**

```bash
git add apps/web/
git commit -m "feat(web): initialize Next.js frontend skeleton with Tailwind CSS"
```

---

### Task 6: Environment Variables

**Files:**

- Create: `apps/agent-api/.env.example`
- Create: `apps/web/.env.example`

- [ ] **Step 1: Write agent-api .env.example**

`apps/agent-api/.env.example`:

```env
# Agent API 环境变量
PORT=3001
NODE_ENV=development

# LLM 通用配置（按 provider 填写）
LLM_PROVIDER=
LLM_MODEL=
LLM_API_KEY=

# AI 行为配置
AI_TIMEOUT_MS=6000
ENABLE_GOD_MODE=true

# 可观测性
SENTRY_DSN=
LOG_LEVEL=debug

# 演示模式
FALLBACK_ONLY_MODE=false
```

- [ ] **Step 2: Write web .env.example**

`apps/web/.env.example`:

```env
# Web 环境变量
NEXT_PUBLIC_AGENT_API_BASE_URL=http://localhost:3001
NEXT_PUBLIC_ENABLE_GOD_MODE=true
```

- [ ] **Step 3: Commit**

```bash
git add apps/agent-api/.env.example apps/web/.env.example
git commit -m "chore: add .env.example templates for both apps"
```

---

### Task 7: Install Dependencies + Verify Tooling

- [ ] **Step 1: Run pnpm install**

```bash
pnpm install
```

Expected: Installation succeeds with no errors. `pnpm-lock.yaml` is generated.

- [ ] **Step 2: Verify TypeScript compilation**

```bash
pnpm typecheck
```

Expected: Both apps typecheck successfully with no errors.

- [ ] **Step 3: Verify ESLint**

```bash
pnpm lint
```

Expected: Lint passes with no errors.

- [ ] **Step 4: Verify Prettier**

```bash
pnpm format:check
```

Expected: All files pass format check. If any file fails, run `pnpm format` to fix and re-check.

- [ ] **Step 5: Verify Vitest tests**

```bash
pnpm test
```

Expected: agent-api health route test passes.

- [ ] **Step 6: Commit lockfile**

```bash
git add pnpm-lock.yaml
git commit -m "chore: lock dependencies after initial install"
```

---

### Task 8: Playwright Setup + Smoke Test

**Files:**

- Create: `apps/web/playwright.config.ts`
- Create: `apps/web/e2e/smoke.spec.ts`

- [ ] **Step 1: Create e2e directory**

```bash
mkdir -p apps/web/e2e
```

- [ ] **Step 2: Write playwright.config.ts**

`apps/web/playwright.config.ts`:

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: 0,
  use: {
    baseURL: 'http://localhost:3000',
  },
  webServer: {
    command: 'pnpm dev',
    reuseExistingServer: true,
  },
});
```

- [ ] **Step 3: Write smoke test**

`apps/web/e2e/smoke.spec.ts`:

```typescript
import { expect, test } from '@playwright/test';

test('smoke: page loads with title', async ({ page }) => {
  await page.goto('/');
  const title = await page.title();
  expect(title).toBeTruthy();
});
```

- [ ] **Step 4: Install Playwright browsers**

```bash
pnpm --filter @health-advisor/web exec playwright install chromium
```

Expected: Chromium browser downloads successfully.

- [ ] **Step 5: Run smoke test**

```bash
# 先启动 web 开发服务器（在另一个终端），然后运行：
pnpm --filter @health-advisor/web test:e2e
```

Expected: Smoke test passes — page loads and has a non-empty title.

- [ ] **Step 6: Commit**

```bash
git add apps/web/playwright.config.ts apps/web/e2e/
git commit -m "test(web): add Playwright config and smoke test"
```

---

### Task 9: Full DoD Verification

- [ ] **Step 1: Clean install**

```bash
pnpm install
```

Expected: No errors.

- [ ] **Step 2: Build all packages**

```bash
pnpm build
```

Expected: Both apps build successfully.

- [ ] **Step 3: Start both apps simultaneously**

```bash
pnpm dev
```

Expected:

- agent-api logs 启动信息，监听 port 3001
- web 可访问 http://localhost:3000

- [ ] **Step 4: Verify agent-api health endpoint**

```bash
curl http://localhost:3001/health
```

Expected: `{"status":"ok","timestamp":"..."}`

- [ ] **Step 5: Verify web homepage**

打开 http://localhost:3000。Expected: "AI Health Advisor" 标题在暗色背景上可见。

- [ ] **Step 6: Stop dev servers and run all quality checks**

```bash
# Ctrl+C 停止 turbo dev，然后：
pnpm lint && pnpm typecheck && pnpm test && pnpm format:check
```

Expected: All pass.

- [ ] **Step 7: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "chore: wave 0 complete — monorepo foundation ready"
```
