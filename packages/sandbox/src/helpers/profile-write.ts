import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Manifest, ProfileFileV2 } from '../loader';

/** 写回 profile JSON 文件 */
export function writeProfileFile(
  dataDir: string,
  filePath: string,
  data: ProfileFileV2,
): void {
  const absolutePath = join(dataDir, filePath);
  writeFileSync(absolutePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

/** 写回 manifest.json */
export function writeManifest(dataDir: string, manifest: Manifest): void {
  const filePath = join(dataDir, 'manifest.json');
  writeFileSync(filePath, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
}

/** 写回历史记录 JSON 文件 */
export function writeHistoryFile(
  dataDir: string,
  filePath: string,
  data: unknown,
): void {
  const absolutePath = join(dataDir, filePath);
  writeFileSync(absolutePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

/** 写回时间轴脚本 JSON 文件 */
export function writeTimelineScriptFile(
  dataDir: string,
  filePath: string,
  data: unknown,
): void {
  const absolutePath = join(dataDir, filePath);
  writeFileSync(absolutePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}
