import { env } from '@/config/env';
import type { ApiResponse } from '@health-advisor/shared';

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
  options: RequestInit = {}
): Promise<T> {
  const url = `${env.NEXT_PUBLIC_AGENT_API_BASE_URL}${path}`;
  
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(url, {
    ...options,
    headers,
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

  const data = (await response.json()) as ApiResponse<T>;
  return data.data as T;
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
