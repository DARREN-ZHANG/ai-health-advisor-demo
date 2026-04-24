import { readFileSync, existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  loadManifest,
  loadHistoryRecords,
  generateHistory,
  generateTimelineScript,
  buildProfileConfig,
  deriveSleepConfig,
  writeProfileFile,
  writeManifest,
  writeHistoryFile,
  writeTimelineScriptFile,
  type Manifest,
  type ProfileFileV2,
} from '@health-advisor/sandbox';
import {
  SandboxProfileSchema,
  type SandboxProfile,
  type BaselineMetrics,
} from '@health-advisor/shared';
import type { DailyRecord } from '@health-advisor/sandbox';

export interface ProfileManagerDeps {
  dataDir: string;
  reloadProfiles: () => void;
}

export class ProfileManager {
  private originalSnapshots = new Map<string, string>();

  constructor(private deps: ProfileManagerDeps) {
    this.saveSnapshots();
  }

  /** 启动时保存所有 profile 的原始快照 */
  private saveSnapshots(): void {
    const manifest = loadManifest(this.deps.dataDir);
    for (const entry of manifest.profiles) {
      const filePath = join(this.deps.dataDir, entry.file);
      const content = readFileSync(filePath, 'utf-8');
      this.originalSnapshots.set(entry.profileId, content);
    }
  }

  /** 检测 baseline 字段是否发生变化 */
  private hasBaselineChanged(
    oldBaseline: BaselineMetrics,
    newBaseline: BaselineMetrics,
  ): boolean {
    return (
      oldBaseline.restingHr !== newBaseline.restingHr ||
      oldBaseline.hrv !== newBaseline.hrv ||
      oldBaseline.spo2 !== newBaseline.spo2 ||
      oldBaseline.avgSleepMinutes !== newBaseline.avgSleepMinutes ||
      oldBaseline.avgSteps !== newBaseline.avgSteps
    );
  }

  /** 获取历史数据的日期范围（今天往前 30 天） */
  private getHistoryDateRange(): { startDate: string; endDate: string } {
    const today = new Date();
    const endDate = today.toISOString().slice(0, 10);
    const startDateObj = new Date(today);
    startDateObj.setDate(startDateObj.getDate() - 30);
    const startDate = startDateObj.toISOString().slice(0, 10);
    return { startDate, endDate };
  }

  /** 获取指定天数的历史日期范围 */
  private getDateRangeForDays(days: number): { startDate: string; endDate: string } {
    const today = new Date();
    const endDate = today.toISOString().slice(0, 10);
    const startDateObj = new Date(today);
    startDateObj.setDate(startDateObj.getDate() - (days - 1));
    const startDate = startDateObj.toISOString().slice(0, 10);
    return { startDate, endDate };
  }

  /** 检测部分 baseline 字段是否发生变化（用于 weekly/daily baseline） */
  private hasPartialBaselineChanged(
    oldBaseline: Partial<BaselineMetrics> | undefined,
    newBaseline: Partial<BaselineMetrics> | undefined,
  ): boolean {
    if (!oldBaseline && !newBaseline) return false;
    if (!oldBaseline || !newBaseline) return true;
    const keys: (keyof BaselineMetrics)[] = ['restingHr', 'hrv', 'spo2', 'avgSleepMinutes', 'avgSteps'];
    return keys.some((key) => oldBaseline[key] !== newBaseline[key]);
  }

  /** 增量替换 history 记录：用新记录覆盖现有记录中相同日期的条目 */
  private patchHistoryRecords(
    existing: DailyRecord[],
    newRecords: DailyRecord[],
  ): DailyRecord[] {
    const newRecordMap = new Map(newRecords.map((r) => [r.date, r]));
    const merged = existing.map((record) => newRecordMap.get(record.date) ?? record);
    // 添加 existing 中没有的新日期记录
    const existingDates = new Set(existing.map((r) => r.date));
    for (const newRecord of newRecords) {
      if (!existingDates.has(newRecord.date)) {
        merged.push(newRecord);
      }
    }
    // 按日期排序
    merged.sort((a, b) => a.date.localeCompare(b.date));
    return merged;
  }

  /** 更新 profile 字段（局部更新），返回更新后的 profile 和是否触发了重生成 */
  updateProfile(
    profileId: string,
    changes: {
      name?: string;
      age?: number;
      gender?: 'male' | 'female';
      avatar?: string;
      tags?: string[];
      baseline?: Partial<BaselineMetrics>;
      weeklyBaseline?: Partial<BaselineMetrics>;
      dailyBaseline?: Partial<BaselineMetrics>;
    },
  ): { profile: SandboxProfile; regenerated: boolean } {
    const manifest = loadManifest(this.deps.dataDir);
    const entry = manifest.profiles.find((e) => e.profileId === profileId);
    if (!entry) {
      throw Object.assign(new Error(`Profile '${profileId}' not found`), { statusCode: 404 });
    }

    // 读取当前 profile 文件
    const profilePath = join(this.deps.dataDir, entry.file);
    const originalContent = readFileSync(profilePath, 'utf-8');
    const profileFile = JSON.parse(originalContent) as ProfileFileV2;
    const oldBaseline = { ...profileFile.profile.baseline };
    const oldWeeklyBaseline = profileFile.profile.weeklyBaseline
      ? { ...profileFile.profile.weeklyBaseline }
      : undefined;
    const oldDailyBaseline = profileFile.profile.dailyBaseline
      ? { ...profileFile.profile.dailyBaseline }
      : undefined;

    // 浅合并 profile 层字段
    if (changes.name !== undefined) profileFile.profile.name = changes.name;
    if (changes.age !== undefined) profileFile.profile.age = changes.age;
    if (changes.gender !== undefined) profileFile.profile.gender = changes.gender;
    if (changes.avatar !== undefined) profileFile.profile.avatar = changes.avatar;
    if (changes.tags !== undefined) profileFile.profile.tags = changes.tags;
    if (changes.baseline !== undefined) {
      profileFile.profile.baseline = {
        ...profileFile.profile.baseline,
        ...changes.baseline,
      };
    }
    if (changes.weeklyBaseline !== undefined) {
      profileFile.profile.weeklyBaseline = {
        ...profileFile.profile.weeklyBaseline,
        ...changes.weeklyBaseline,
      };
    }
    if (changes.dailyBaseline !== undefined) {
      profileFile.profile.dailyBaseline = {
        ...profileFile.profile.dailyBaseline,
        ...changes.dailyBaseline,
      };
    }

    // Zod 校验
    const validated = SandboxProfileSchema.safeParse(profileFile.profile);
    if (!validated.success) {
      throw Object.assign(
        new Error(validated.error.issues.map((i) => i.message).join('; ')),
        { statusCode: 422 },
      );
    }

    // 检测三种 baseline 变化
    const baselineChanged = this.hasBaselineChanged(oldBaseline, profileFile.profile.baseline);
    const weeklyBaselineChanged = this.hasPartialBaselineChanged(
      oldWeeklyBaseline,
      profileFile.profile.weeklyBaseline,
    );
    const dailyBaselineChanged = this.hasPartialBaselineChanged(
      oldDailyBaseline,
      profileFile.profile.dailyBaseline,
    );
    const anyBaselineChanged = baselineChanged || weeklyBaselineChanged || dailyBaselineChanged;

    try {
      // 写回 profile 文件
      writeProfileFile(this.deps.dataDir, entry.file, profileFile);

      if (baselineChanged) {
        // 全局 baseline 变更 → 30 天全量重生成
        const { startDate, endDate } = this.getHistoryDateRange();
        const config = buildProfileConfig(validated.data);
        const history = generateHistory(config, startDate, endDate);
        writeHistoryFile(this.deps.dataDir, profileFile.historyRef.file, history);

        // 重生成 timeline script
        const sleepConfig = deriveSleepConfig(validated.data.baseline.avgSleepMinutes);
        const script = generateTimelineScript(
          profileId,
          endDate,
          profileFile.initialDemoTime,
          sleepConfig,
        );
        writeTimelineScriptFile(this.deps.dataDir, profileFile.timelineScriptRef.file, script);
      }

      if (weeklyBaselineChanged && !baselineChanged) {
        // 近一周 baseline 变更 → 只重生成最近 7 天，增量替换
        const { startDate, endDate } = this.getDateRangeForDays(7);
        const mergedBaseline = {
          ...validated.data.baseline,
          ...validated.data.weeklyBaseline,
        };
        const config = buildProfileConfig({ ...validated.data, baseline: mergedBaseline });
        const newHistory = generateHistory(config, startDate, endDate);

        // 读取现有 history 文件并增量替换
        const existingHistory = loadHistoryRecords(this.deps.dataDir, profileFile.historyRef);
        const patchedRecords = this.patchHistoryRecords(existingHistory, newHistory.records);
        writeHistoryFile(this.deps.dataDir, profileFile.historyRef.file, {
          profileId,
          dateRange: { start: patchedRecords[0]!.date, end: patchedRecords[patchedRecords.length - 1]!.date },
          records: patchedRecords,
        });
      }

      if (dailyBaselineChanged && !baselineChanged) {
        // 近24h baseline 变更 → 只重生成最近 1 天，增量替换 + timeline script
        const { startDate, endDate } = this.getDateRangeForDays(1);
        const mergedBaseline = {
          ...validated.data.baseline,
          ...validated.data.dailyBaseline,
        };
        const config = buildProfileConfig({ ...validated.data, baseline: mergedBaseline });
        const newHistory = generateHistory(config, startDate, endDate);

        // 读取现有 history 文件并增量替换
        const existingHistory = loadHistoryRecords(this.deps.dataDir, profileFile.historyRef);
        const patchedRecords = this.patchHistoryRecords(existingHistory, newHistory.records);
        writeHistoryFile(this.deps.dataDir, profileFile.historyRef.file, {
          profileId,
          dateRange: { start: patchedRecords[0]!.date, end: patchedRecords[patchedRecords.length - 1]!.date },
          records: patchedRecords,
        });

        // 重生成 timeline script
        const sleepConfig = deriveSleepConfig(mergedBaseline.avgSleepMinutes);
        const script = generateTimelineScript(
          profileId,
          endDate,
          profileFile.initialDemoTime,
          sleepConfig,
        );
        writeTimelineScriptFile(this.deps.dataDir, profileFile.timelineScriptRef.file, script);
      }

      // 重载内存
      this.deps.reloadProfiles();
    } catch (error) {
      // 回滚 profile 文件到修改前状态
      writeFileSync(profilePath, originalContent, 'utf-8');
      throw error;
    }

    return { profile: validated.data, regenerated: anyBaselineChanged };
  }

  /** 从现有 profile 克隆创建新 profile */
  cloneProfile(
    sourceProfileId: string,
    newProfileId: string,
    overrides?: Partial<SandboxProfile>,
  ): SandboxProfile {
    const manifest = loadManifest(this.deps.dataDir);

    // 校验 newProfileId 不重复
    if (manifest.profiles.some((e) => e.profileId === newProfileId)) {
      throw Object.assign(
        new Error(`Profile '${newProfileId}' already exists`),
        { statusCode: 409 },
      );
    }

    // 查找源 profile
    const sourceEntry = manifest.profiles.find((e) => e.profileId === sourceProfileId);
    if (!sourceEntry) {
      throw Object.assign(
        new Error(`Source profile '${sourceProfileId}' not found`),
        { statusCode: 404 },
      );
    }

    // 读取源 profile 文件
    const sourceFilePath = join(this.deps.dataDir, sourceEntry.file);
    const sourceContent = readFileSync(sourceFilePath, 'utf-8');
    const sourceFile = JSON.parse(sourceContent) as ProfileFileV2;

    // 构建新 profile 文件
    const newFile: ProfileFileV2 = {
      profile: {
        ...sourceFile.profile,
        profileId: newProfileId,
        ...(overrides ?? {}),
      },
      initialDemoTime: sourceFile.initialDemoTime,
      historyRef: { file: `history/${newProfileId}-daily-records.json` },
      timelineScriptRef: { file: `timeline-scripts/${newProfileId}-day-1.json` },
    };

    // Zod 校验
    const validated = SandboxProfileSchema.parse(newFile.profile);

    // 写 profile 文件
    const newProfileFilePath = `profiles/${newProfileId}.json`;
    writeProfileFile(this.deps.dataDir, newProfileFilePath, {
      ...newFile,
      profile: validated,
    });

    // 生成 history
    const { startDate, endDate } = this.getHistoryDateRange();
    const config = buildProfileConfig(validated);
    const history = generateHistory(config, startDate, endDate);
    writeHistoryFile(this.deps.dataDir, newFile.historyRef.file, history);

    // 生成 timeline script
    const sleepConfig = deriveSleepConfig(validated.baseline.avgSleepMinutes);
    const script = generateTimelineScript(
      newProfileId,
      endDate,
      newFile.initialDemoTime,
      sleepConfig,
    );
    writeTimelineScriptFile(this.deps.dataDir, newFile.timelineScriptRef.file, script);

    // 更新 manifest
    const updatedManifest: Manifest = {
      ...manifest,
      profiles: [
        ...manifest.profiles,
        { profileId: newProfileId, name: validated.name, file: newProfileFilePath },
      ],
    };
    writeManifest(this.deps.dataDir, updatedManifest);

    // 重载内存
    this.deps.reloadProfiles();

    // 保存新 profile 的原始快照（克隆时即为原始状态）
    const savedContent = readFileSync(join(this.deps.dataDir, newProfileFilePath), 'utf-8');
    this.originalSnapshots.set(newProfileId, savedContent);

    return validated;
  }

  /** 删除 profile（至少保留 1 个） */
  deleteProfile(profileId: string): void {
    const manifest = loadManifest(this.deps.dataDir);

    // 至少保留 1 个 profile
    if (manifest.profiles.length <= 1) {
      throw Object.assign(
        new Error('无法删除最后一个 profile'),
        { statusCode: 400 },
      );
    }

    const entry = manifest.profiles.find((e) => e.profileId === profileId);
    if (!entry) {
      throw Object.assign(
        new Error(`Profile '${profileId}' not found`),
        { statusCode: 404 },
      );
    }

    // 读取 profile 文件以获取关联文件路径
    const profilePath = join(this.deps.dataDir, entry.file);
    const profileContent = readFileSync(profilePath, 'utf-8');
    const profileFile = JSON.parse(profileContent) as ProfileFileV2;

    // 删除文件
    if (existsSync(profilePath)) unlinkSync(profilePath);
    const historyPath = join(this.deps.dataDir, profileFile.historyRef.file);
    if (existsSync(historyPath)) unlinkSync(historyPath);
    const scriptPath = join(this.deps.dataDir, profileFile.timelineScriptRef.file);
    if (existsSync(scriptPath)) unlinkSync(scriptPath);

    // 更新 manifest
    const updatedManifest: Manifest = {
      ...manifest,
      profiles: manifest.profiles.filter((e) => e.profileId !== profileId),
    };
    writeManifest(this.deps.dataDir, updatedManifest);

    // 清除快照
    this.originalSnapshots.delete(profileId);

    // 重载内存
    this.deps.reloadProfiles();
  }

  /** 恢复 profile 到启动时的原始模板 */
  resetProfile(profileId: string): { profile: SandboxProfile; regenerated: boolean } {
    const snapshot = this.originalSnapshots.get(profileId);
    if (!snapshot) {
      throw Object.assign(
        new Error(`Profile '${profileId}' 原始快照不存在`),
        { statusCode: 404 },
      );
    }

    const manifest = loadManifest(this.deps.dataDir);
    const entry = manifest.profiles.find((e) => e.profileId === profileId);
    if (!entry) {
      throw Object.assign(
        new Error(`Profile '${profileId}' not found`),
        { statusCode: 404 },
      );
    }

    // 写回原始快照
    const profilePath = join(this.deps.dataDir, entry.file);
    writeFileSync(profilePath, snapshot, 'utf-8');

    // 解析原始 profile 以重生成 history
    const originalFile = JSON.parse(snapshot) as ProfileFileV2;
    const originalProfile = SandboxProfileSchema.parse(originalFile.profile);

    // 重生成 history
    const { startDate, endDate } = this.getHistoryDateRange();
    const config = buildProfileConfig(originalProfile);
    const history = generateHistory(config, startDate, endDate);
    writeHistoryFile(this.deps.dataDir, originalFile.historyRef.file, history);

    // 重生成 timeline script
    const sleepConfig = deriveSleepConfig(originalProfile.baseline.avgSleepMinutes);
    const script = generateTimelineScript(
      profileId,
      endDate,
      originalFile.initialDemoTime,
      sleepConfig,
    );
    writeTimelineScriptFile(this.deps.dataDir, originalFile.timelineScriptRef.file, script);

    // 重载内存
    this.deps.reloadProfiles();

    return { profile: originalProfile, regenerated: true };
  }
}
