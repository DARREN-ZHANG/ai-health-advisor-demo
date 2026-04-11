export enum ErrorCode {
  UNKNOWN = 'UNKNOWN',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  PROFILE_NOT_FOUND = 'PROFILE_NOT_FOUND',
  AGENT_TIMEOUT = 'AGENT_TIMEOUT',
  AGENT_FALLBACK = 'AGENT_FALLBACK',
  RATE_LIMITED = 'RATE_LIMITED',
}

export interface ApiMeta {
  timestamp: string;
  requestId: string;
  durationMs: number;
}

export interface ApiError {
  code: ErrorCode;
  message: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: ApiError | null;
  meta: ApiMeta;
}

export function createSuccessResponse<T>(data: T, meta: ApiMeta): ApiResponse<T> {
  return { success: true, data, error: null, meta };
}

export function createErrorResponse<T = never>(
  code: ErrorCode,
  message: string,
  meta: ApiMeta,
): ApiResponse<T> {
  return { success: false, data: null, error: { code, message }, meta };
}
