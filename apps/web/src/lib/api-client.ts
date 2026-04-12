import { env } from '@/config/env';
import type { ApiResponse } from '@health-advisor/shared';

/** 默认请求超时时间（毫秒），与后端 AI 超时策略对齐 */
const DEFAULT_TIMEOUT_MS = 6_000;
const SESSION_ID_STORAGE_KEY = 'session-id';

function getOrCreateSessionId(): string {
  const existing = window.localStorage.getItem(SESSION_ID_STORAGE_KEY);
  if (existing) {
    return existing;
  }

  const next = crypto.randomUUID();
  window.localStorage.setItem(SESSION_ID_STORAGE_KEY, next);
  return next;
}

export function clearSessionId() {
  window.localStorage.removeItem(SESSION_ID_STORAGE_KEY);
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(
  path: string,
  options: RequestInit & { timeoutMs?: number } = {}
): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...fetchOptions } = options;
  const url = `${env.NEXT_PUBLIC_AGENT_API_BASE_URL}${path}`;

  const headers = new Headers(fetchOptions.headers);
  if (!headers.has('Content-Type') && !(fetchOptions.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const sessionId = typeof window !== 'undefined' ? getOrCreateSessionId() : '';
  if (sessionId) {
    headers.set('X-Session-Id', sessionId);
  }

  // 6 秒超时控制
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      headers,
      signal: controller.signal,
    });

    if (!response.ok) {
      let errorData: unknown;
      try {
        errorData = await response.json();
      } catch {
        throw new ApiError(response.status, 'UNKNOWN_ERROR', '服务器响应错误');
      }

      const errorBody = errorData as { error?: { code?: string; message?: string } };

      throw new ApiError(
        response.status,
        errorBody?.error?.code || 'SERVER_ERROR',
        errorBody?.error?.message || '请求失败'
      );
    }

    const body = (await response.json()) as ApiResponse<T>;

    // 检查业务层 success 标志，避免在 success: false 时返回 null as T
    if (!body.success) {
      throw new ApiError(
        200,
        body.error?.code || 'BUSINESS_ERROR',
        body.error?.message || '请求处理失败'
      );
    }

    return body.data as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiError(0, 'TIMEOUT', '请求超时，请稍后重试');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export const apiClient = {
  get: <T>(path: string, options?: RequestInit) =>
    request<T>(path, { ...options, method: 'GET' }),

  post: <T>(path: string, body?: unknown, options?: RequestInit) =>
    request<T>(path, {
      ...options,
      method: 'POST',
      body: JSON.stringify(body),
    }),

  put: <T>(path: string, body?: unknown, options?: RequestInit) =>
    request<T>(path, {
      ...options,
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  delete: <T>(path: string, options?: RequestInit) =>
    request<T>(path, { ...options, method: 'DELETE' }),
};
