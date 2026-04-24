/**
 * 启动时资产校验
 * 确保关键 sandbox 数据完整，防止运行时因缺失资产而出错
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadManifest, loadAllProfiles } from '@health-advisor/sandbox';
import { isValidChartTokenId } from '@health-advisor/shared';

export interface ValidationResult {
  /** 阻止启动的致命错误 */
  fatal: string[];
  /** 警告（不阻止启动） */
  warnings: string[];
}

/**
 * 校验 dataDir 下所有必需资产
 * - profiles + fallbacks：致命，缺失阻止启动
 * - prompts：警告，缺失不阻止启动
 */
export function validateStartupAssets(dataDir: string): ValidationResult {
  const fatal: string[] = [];
  const warnings: string[] = [];

  // 1. manifest 和 profiles 校验
  validateProfiles(dataDir, fatal);

  // 2. fallbacks 校验
  validateFallbacks(dataDir, fatal);

  // 3. prompts 校验（非致命）
  validatePrompts(dataDir, warnings);

  return { fatal, warnings };
}

function validateProfiles(dataDir: string, fatal: string[]): void {
  const manifestPath = join(dataDir, 'manifest.json');
  if (!existsSync(manifestPath)) {
    fatal.push('manifest.json not found');
    return;
  }

  try {
    const manifest = loadManifest(dataDir);
    if (manifest.profiles.length === 0) {
      fatal.push('manifest has no profiles');
      return;
    }

    const profiles = loadAllProfiles(dataDir);
    for (const entry of manifest.profiles) {
      if (!profiles.has(entry.profileId)) {
        fatal.push(`profile "${entry.profileId}" declared in manifest but failed to load`);
      }
    }
  } catch (err) {
    fatal.push(`profile validation failed: ${(err as Error).message}`);
  }
}

function validateFallbacks(dataDir: string, fatal: string[]): void {
  const fallbackDir = join(dataDir, 'fallbacks');
  const expectedFiles = ['homepage.json', 'view-summary.json', 'advisor-chat.json'];

  for (const file of expectedFiles) {
    const filePath = join(fallbackDir, file);
    if (!existsSync(filePath)) {
      fatal.push(`fallback file missing: fallbacks/${file}`);
      continue;
    }

    try {
      const content = JSON.parse(readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
      for (const [key, value] of Object.entries(content)) {
        const entry = value as Record<string, unknown>;
        if (typeof entry.summary !== 'string' || entry.summary.length === 0) {
          fatal.push(`fallbacks/${file} → "${key}": missing or empty "summary"`);
        }
        if (!Array.isArray(entry.chartTokens)) {
          fatal.push(`fallbacks/${file} → "${key}": "chartTokens" is not an array`);
        } else {
          for (const token of entry.chartTokens as string[]) {
            if (!isValidChartTokenId(token)) {
              fatal.push(`fallbacks/${file} → "${key}": invalid chartToken "${token}"`);
            }
          }
        }
      }
    } catch (err) {
      fatal.push(`fallbacks/${file} parse error: ${(err as Error).message}`);
    }
  }
}

function validatePrompts(dataDir: string, warnings: string[]): void {
  const promptsDir = join(dataDir, 'prompts');
  const expectedFiles = ['system.md', 'homepage.md', 'view-summary.md', 'advisor-chat.md'];

  for (const file of expectedFiles) {
    const filePath = join(promptsDir, file);
    if (!existsSync(filePath)) {
      warnings.push(`prompt file missing: prompts/${file}`);
      continue;
    }
    const content = readFileSync(filePath, 'utf-8').trim();
    if (content.length === 0) {
      warnings.push(`prompt file empty: prompts/${file}`);
    }
  }
}


