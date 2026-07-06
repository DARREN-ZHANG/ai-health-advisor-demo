import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // 1 次重试以吸收 dev server 冷启动 / 编译抖动（首次访问某路由时 Next.js
  // 需要现编 page chunk，多 worker 并发可能让某个 case 撞 30s 上限）。
  retries: 1,
  // 全局 90s：覆盖 beforeEach 等待 app hydration（最坏 60s）+ test body。
  timeout: 90_000,
  use: {
    baseURL: 'http://localhost:3000',
  },
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120_000,
    // 首次冷启动（含 .next 编译 + chunks 生成）可能需要 60s+；
    // 复用既有 dev server 时这行不会生效。
  },
});
