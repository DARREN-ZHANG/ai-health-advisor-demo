import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient, clearSessionId } from './api-client';

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

function createSuccessResponse<T>(data: T, headers: Record<string, string> = {}) {
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
      headers: { 'Content-Type': 'application/json', ...headers },
    },
  );
}

describe('apiClient session header', () => {
  beforeEach(() => {
    const storage = createMemoryStorage();
    vi.stubGlobal('window', { localStorage: storage });
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'page-session-id') });
    clearSessionId();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('首次请求会主动发送页面级 session-id，且不写入 localStorage', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        createSuccessResponse({ ok: true }, { 'X-Session-Id': 'sess-issued-by-server' }),
      );

    await apiClient.get<{ ok: boolean }>('/health');

    const headers = new Headers(fetchSpy.mock.calls[0]?.[1]?.headers);
    expect(headers.get('X-Session-Id')).toBe('session-page-session-id');
    expect(window.localStorage.getItem('session-id')).toBeNull();
  });

  it('同一页面内的并行请求复用同一个 session-id', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => createSuccessResponse({ ok: true }));

    await Promise.all([
      apiClient.get<{ ok: boolean }>('/health'),
      apiClient.get<{ ok: boolean }>('/profiles'),
    ]);

    const firstHeaders = new Headers(fetchSpy.mock.calls[0]?.[1]?.headers);
    const secondHeaders = new Headers(fetchSpy.mock.calls[1]?.[1]?.headers);
    expect(firstHeaders.get('X-Session-Id')).toBe('session-page-session-id');
    expect(secondHeaders.get('X-Session-Id')).toBe('session-page-session-id');
  });
});
