import type { SandboxProfile } from './sandbox';
import type { BaselineMetrics } from './sandbox';

/** 更新 profile 请求载荷 */
export interface UpdateProfilePayload {
  name?: string;
  age?: number;
  gender?: 'male' | 'female';
  avatar?: string;
  tags?: string[];
  baseline?: Partial<BaselineMetrics>;
  weeklyBaseline?: Partial<BaselineMetrics>;
  dailyBaseline?: Partial<BaselineMetrics>;
}

/** 克隆 profile 请求载荷 */
export interface CloneProfilePayload {
  sourceProfileId: string;
  newProfileId: string;
  overrides?: Partial<SandboxProfile>;
}

/** PUT /god-mode/profiles/:profileId 响应 */
export interface UpdateProfileResponse {
  profile: SandboxProfile;
  regenerated: boolean;
}

/** POST /god-mode/profiles 响应 */
export interface CloneProfileResponse {
  profile: SandboxProfile;
}

/** DELETE /god-mode/profiles/:profileId 响应 */
export interface DeleteProfileResponse {
  deletedProfileId: string;
}

/** POST /god-mode/profiles/:profileId/reset 响应 */
export interface ResetProfileResponse {
  profile: SandboxProfile;
  regenerated: boolean;
}
