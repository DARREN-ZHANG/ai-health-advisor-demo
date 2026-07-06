import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// 每个测试后清理 DOM，避免用例间状态泄漏
afterEach(() => {
  cleanup();
});
