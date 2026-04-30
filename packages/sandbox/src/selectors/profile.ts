import type { ProfileData, Locale, LocalizableText } from '@health-advisor/shared';
import { DEFAULT_LOCALE, localize } from '@health-advisor/shared';

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
 * @param locale - 语言偏好，默认 'zh'
 */
export function listProfiles(profiles: Map<string, ProfileData>, locale: Locale = DEFAULT_LOCALE): ProfileSummary[] {
  const result: ProfileSummary[] = [];
  for (const [, data] of profiles) {
    result.push({
      profileId: data.profile.profileId,
      name: localize(data.profile.name, locale),
      age: data.profile.age,
      gender: data.profile.gender,
      recordCount: data.records.length,
    });
  }
  return result;
}
