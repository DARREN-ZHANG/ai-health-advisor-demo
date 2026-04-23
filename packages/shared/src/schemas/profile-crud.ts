import { z } from 'zod';
import { BaselineMetricsSchema } from './sandbox';

/** PUT /god-mode/profiles/:profileId 请求体 */
export const UpdateProfileRequestSchema = z.object({
  name: z.string().min(1).optional(),
  age: z.number().int().min(1).max(150).optional(),
  gender: z.enum(['male', 'female']).optional(),
  avatar: z.string().min(1).optional(),
  tags: z.array(z.string().min(1)).min(1).optional(),
  baseline: BaselineMetricsSchema.partial().optional(),
});

/** POST /god-mode/profiles 请求体 */
export const CloneProfileRequestSchema = z.object({
  sourceProfileId: z.string().min(1),
  newProfileId: z.string().regex(
    /^[a-z0-9-]+$/,
    'Profile ID 只允许小写字母、数字和连字符',
  ),
  overrides: z.object({
    name: z.string().min(1).optional(),
    age: z.number().int().min(1).max(150).optional(),
    gender: z.enum(['male', 'female']).optional(),
    avatar: z.string().min(1).optional(),
    tags: z.array(z.string().min(1)).min(1).optional(),
    baseline: BaselineMetricsSchema.partial().optional(),
  }).optional(),
});
