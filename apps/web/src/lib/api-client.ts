import { env } from '@/config/env';
import type { ApiResponse } from '@health-advisor/shared';

/** 网络请求安全兜底超时（毫秒），用于防止请求永远挂起 */
const DEFAULT_TIMEOUT_MS = 30_000;
/**
 * AI 请求超时（毫秒）。
 * 后端单次 LLM 调用最多 60s（AGENT_SLA_TIMEOUT_MS），但 content policy 违规时会触发
 * 一次 regeneration（第二次 LLM 调用），sync gate 高风险场景还可能触发 reviewer 调用。
 * 最坏情况：2 次 LLM × 60s + 开销 ≈ 130s。设为 150s 留出余量。
 * 长期方案是 streaming（已规划），当前用长超时保证 fallback 降级响应能被前端接收。
 */
export const AI_REQUEST_TIMEOUT_MS = 150_000;
/** AI 请求建议的 UI 等待阈值（毫秒），前端可据此展示 timeout 状态 */
export const AI_UI_TIMEOUT_MS = 6_000;
let pageSessionId: string | undefined;

/** 获取当前页面实例的 sessionId；完整刷新或新标签页会创建新的 Session。 */
function getSessionId(): string {
  if (!pageSessionId) {
    pageSessionId = `session-${globalThis.crypto.randomUUID()}`;
  }
  return pageSessionId;
}

/** 接受后端回传的 sessionId，并仅在当前页面实例内保存。 */
export function setSessionId(id: string) {
  pageSessionId = id;
}

/** 结束当前页面 Session；下一次请求会创建一个全新的 Session。 */
export function clearSessionId() {
  pageSessionId = undefined;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(
  path: string,
  options: RequestInit & { timeoutMs?: number } = {},
): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...fetchOptions } = options;
  const url = `${env.NEXT_PUBLIC_AGENT_API_BASE_URL}${path}`;

  const headers = new Headers(fetchOptions.headers);
  if (!headers.has('Content-Type') && !(fetchOptions.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const sessionId = typeof window !== 'undefined' ? getSessionId() : '';
  if (sessionId) headers.set('X-Session-Id', sessionId);

  // 注入语言偏好
  const locale = typeof window !== 'undefined' ? window.localStorage.getItem('lang') || 'zh' : 'zh';
  headers.set('X-Lang', locale);

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
        errorBody?.error?.message || '请求失败',
      );
    }

    const body = (await response.json()) as ApiResponse<T>;

    // 后端会回传当前页面 Session ID；仅保存在模块内存，不跨页面复用
    const responseSessionId = response.headers.get('X-Session-Id');
    if (responseSessionId) {
      setSessionId(responseSessionId);
    }

    // 检查业务层 success 标志，避免在 success: false 时返回 null as T
    if (!body.success) {
      throw new ApiError(
        200,
        body.error?.code || 'BUSINESS_ERROR',
        body.error?.message || '请求处理失败',
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
  get: <T>(path: string, options?: RequestInit) => request<T>(path, { ...options, method: 'GET' }),

  post: <T>(path: string, body?: unknown, options?: RequestInit & { timeoutMs?: number }) =>
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
