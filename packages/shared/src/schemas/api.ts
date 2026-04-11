import { z } from 'zod';
import { ErrorCode } from '../types/api';

export const ErrorCodeSchema = z.nativeEnum(ErrorCode);

export const ApiMetaSchema = z.object({
  timestamp: z.string(),
  requestId: z.string(),
  durationMs: z.number().min(0),
});

export const ApiErrorSchema = z.object({
  code: ErrorCodeSchema,
  message: z.string(),
});

export function ApiResponseSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    success: z.boolean(),
    data: dataSchema.nullable(),
    error: ApiErrorSchema.nullable(),
    meta: ApiMetaSchema,
  });
}
