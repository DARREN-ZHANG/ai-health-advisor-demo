import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from './api-client';

function createMemoryStorage() {
  const store = new Map<string, string>();

  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
}

function createSuccessResponse<T>(data: T) {
  return new Response(
    JSON.stringify({
      success: true,
      data,
      error: null,
      meta: {
        timestamp: '2026-04-12T00:00:00.000Z',
        requestId: 'req-test',
        durationMs: 12,
      },
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    },
  );
}

describe('apiClient session header', () => {
  beforeEach(() => {
    const storage = createMemoryStorage();
    vi.stubGlobal('window', { localStorage: storage });
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('sess-test-id');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('首次请求会创建并持久化 session-id', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(createSuccessResponse({ ok: true }));

    await apiClient.get<{ ok: boolean }>('/health');

    const headers = new Headers(fetchSpy.mock.calls[0]?.[1]?.headers);
    expect(headers.get('X-Session-Id')).toBe('sess-test-id');
    expect(window.localStorage.getItem('session-id')).toBe('sess-test-id');
  });

  it('后续请求会复用已有 session-id', async () => {
    window.localStorage.setItem('session-id', 'sess-existing');

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(createSuccessResponse({ ok: true }));

    await apiClient.get<{ ok: boolean }>('/health');

    const headers = new Headers(fetchSpy.mock.calls[0]?.[1]?.headers);
    expect(headers.get('X-Session-Id')).toBe('sess-existing');
  });
});
