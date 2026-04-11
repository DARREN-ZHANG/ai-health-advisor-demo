import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ProfileDataSchema, type ProfileData } from '@health-advisor/shared';

/** manifest.json 中每个 profile 的条目 */
export interface ManifestProfileEntry {
  profileId: string;
  name: string;
  file: string;
}

/** manifest.json 的完整结构 */
export interface Manifest {
  version: string;
  profiles: ManifestProfileEntry[];
}

/**
 * 加载并解析 manifest.json
 * @param dataDir - data/sandbox 目录的绝对路径
 */
export function loadManifest(dataDir: string): Manifest {
  const filePath = join(dataDir, 'manifest.json');
  const raw = readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as Manifest;
}

/**
 * 加载并校验单个 profile 文件
 * @param dataDir - data/sandbox 目录的绝对路径
 * @param filePath - 相对于 data/sandbox 的文件路径（如 "profiles/profile-a.json"）
 */
export function loadProfile(dataDir: string, filePath: string): ProfileData {
  const absolutePath = join(dataDir, filePath);
  const raw = readFileSync(absolutePath, 'utf-8');
  const parsed = JSON.parse(raw);
  return ProfileDataSchema.parse(parsed);
}

/**
 * 加载 manifest 中声明的所有 profile
 * @param dataDir - data/sandbox 目录的绝对路径
 * @returns 以 profileId 为键的 Map
 */
export function loadAllProfiles(dataDir: string): Map<string, ProfileData> {
  const manifest = loadManifest(dataDir);
  const profiles = new Map<string, ProfileData>();
  for (const entry of manifest.profiles) {
    const profileData = loadProfile(dataDir, entry.file);
    profiles.set(entry.profileId, profileData);
  }
  return profiles;
}
