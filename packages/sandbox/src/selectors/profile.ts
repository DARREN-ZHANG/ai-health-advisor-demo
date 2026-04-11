import type { ProfileData } from '@health-advisor/shared';

/**
 * 根据 profileId 获取 profile，找不到时抛出错误
 */
export function getProfile(profiles: Map<string, ProfileData>, profileId: string): ProfileData {
  const profile = profiles.get(profileId);
  if (!profile) {
    throw new Error(`Profile not found: ${profileId}`);
  }
  return profile;
}

/** 摘要信息 */
export interface ProfileSummary {
  profileId: string;
  name: string;
  age: number;
  gender: string;
  recordCount: number;
}

/**
 * 列出所有 profile 的摘要信息
 */
export function listProfiles(profiles: Map<string, ProfileData>): ProfileSummary[] {
  const result: ProfileSummary[] = [];
  for (const [, data] of profiles) {
    result.push({
      profileId: data.profile.profileId,
      name: data.profile.name,
      age: data.profile.age,
      gender: data.profile.gender,
      recordCount: data.records.length,
    });
  }
  return result;
}
