import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ProfileDataSchema,
  SandboxProfileSchema,
  type ProfileData,
  type SandboxProfile,
  type DailyRecord,
  type ActivitySegment,
  type DeviceBufferState,
  type DemoClock,
} from '@health-advisor/shared';
import { loadHistoryArchive } from './helpers/history-archive';
import { loadTimelineScriptFile } from './helpers/timeline-script';
import { createDemoClock } from './helpers/demo-clock';

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

/** 新版 profile 文件的结构 */
export interface ProfileFileV2 {
  profile: SandboxProfile;
  initialDemoTime: string;
  historyRef: { file: string };
  timelineScriptRef: { file: string };
}

/** buildInitialProfileState 返回的完整初始状态 */
export interface InitialProfileState {
  profileData: ProfileData;
  demoClock: DemoClock;
  segments: ActivitySegment[];
  deviceBuffer: DeviceBufferState;
  syncSessions: [];
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
 * 加载并校验单个 profile 文件（支持新版结构）
 * 新版 profile 文件包含 historyRef 和 timelineScriptRef，
 * 内部解析后会组装出包含 records 的 ProfileData 用于向后兼容。
 * @param dataDir - data/sandbox 目录的绝对路径
 * @param filePath - 相对于 data/sandbox 的文件路径（如 "profiles/profile-a.json"）
 */
export function loadProfile(dataDir: string, filePath: string): ProfileData {
  const absolutePath = join(dataDir, filePath);
  const raw = readFileSync(absolutePath, 'utf-8');
  const parsed = JSON.parse(raw);

  // 检测是否为新版结构（包含 historyRef）
  if (parsed.historyRef && parsed.timelineScriptRef) {
    return resolveProfileV2(dataDir, parsed as ProfileFileV2);
  }

  // 旧版结构直接使用 ProfileDataSchema 校验
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

/**
 * 从 historyRef 加载历史 DailyRecord 数组
 * @param dataDir - data/sandbox 目录的绝对路径
 * @param historyRef - 历史文件引用
 */
export function loadHistoryRecords(
  dataDir: string,
  historyRef: { file: string },
): DailyRecord[] {
  return loadHistoryArchive(dataDir, historyRef);
}

/**
 * 从 timelineScriptRef 加载时间轴脚本
 * @param dataDir - data/sandbox 目录的绝对路径
 * @param ref - 脚本文件引用
 */
export function loadTimelineScript(
  dataDir: string,
  ref: { file: string },
) {
  return loadTimelineScriptFile(dataDir, ref);
}

/**
 * 解析新版 profile 文件结构，组装为 ProfileData
 * - 从 historyRef 加载 records
 * - device 字段暂为 undefined（由 timeline script 的 sync 元数据构建）
 */
function resolveProfileV2(dataDir: string, file: ProfileFileV2): ProfileData {
  // 校验 profile 基础信息
  const profile = SandboxProfileSchema.parse(file.profile) as SandboxProfile;

  // 从历史存档加载 records
  const records = loadHistoryArchive(dataDir, file.historyRef);

  return {
    profile,
    records,
    // device 暂为 undefined，保持向后兼容（可由 timeline script 同步元数据构建）
    device: undefined,
  };
}

/**
 * 构建完整的初始 profile 状态
 * 用于 demo 演示的启动入口
 * @param dataDir - data/sandbox 目录的绝对路径
 * @param profileId - profile 标识
 */
export function buildInitialProfileState(
  dataDir: string,
  profileId: string,
): InitialProfileState {
  // 加载 manifest 并找到对应的 profile 文件
  const manifest = loadManifest(dataDir);
  const entry = manifest.profiles.find((item) => item.profileId === profileId);
  if (!entry) {
    throw new Error(`Profile 未找到: ${profileId}`);
  }

  // 读取原始 profile 文件
  const absolutePath = join(dataDir, entry.file);
  const raw = readFileSync(absolutePath, 'utf-8');
  const profileFile = JSON.parse(raw) as ProfileFileV2;

  // 构建各部分状态
  const profileData = resolveProfileV2(dataDir, profileFile);
  const demoClock = createDemoClock(profileId, profileFile.initialDemoTime);

  // 加载时间轴脚本
  const script = loadTimelineScriptFile(dataDir, profileFile.timelineScriptRef);

  // 设备缓存初始状态：尚未同步
  const deviceBuffer: DeviceBufferState = {
    profileId,
    lastSyncedMeasuredAt: null,
  };

  return {
    profileData,
    demoClock,
    segments: script.segments,
    deviceBuffer,
    syncSessions: [],
  };
}
