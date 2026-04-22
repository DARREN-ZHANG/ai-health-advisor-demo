import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DailyRecordSchema, type DailyRecord } from '@health-advisor/shared';

/** 历史 DailyRecord 存档文件的结构 */
export interface HistoryArchiveFile {
  profileId: string;
  dateRange: {
    start: string;
    end: string;
  };
  records: DailyRecord[];
}

/**
 * 从历史存档文件中加载并校验 DailyRecord[]
 * @param dataDir - data/sandbox 目录的绝对路径
 * @param historyRef - 历史文件引用，如 { file: "history/profile-a-daily-records.json" }
 */
export function loadHistoryArchive(
  dataDir: string,
  historyRef: { file: string },
): DailyRecord[] {
  const filePath = join(dataDir, historyRef.file);
  const raw = readFileSync(filePath, 'utf-8');
  const parsed = JSON.parse(raw) as HistoryArchiveFile;

  // 逐条校验记录结构
  const records = parsed.records.map((record) => DailyRecordSchema.parse(record));

  // 校验日期连续性
  validateHistoryArchive(records);

  return records;
}

/**
 * 校验历史记录的日期连续性和结构
 * - 日期必须连续（无间隔）
 * - 日期格式为 YYYY-MM-DD
 */
export function validateHistoryArchive(records: DailyRecord[]): void {
  if (records.length === 0) {
    throw new Error('历史记录不能为空');
  }

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]!;

    // 校验日期格式
    if (!/^\d{4}-\d{2}-\d{2}$/.test(record.date)) {
      throw new Error(`记录 #${index} 的日期格式无效: ${record.date}`);
    }

    // 校验日期连续性（从第二条记录开始）
    if (index > 0) {
      const prevDate = records[index - 1]!.date;
      const expectedDate = addDay(prevDate);
      if (record.date !== expectedDate) {
        throw new Error(
          `日期不连续: 期望 ${expectedDate}，实际 ${record.date}（记录 #${index}）`,
        );
      }
    }
  }
}

/**
 * 给日期字符串加一天，返回新的日期字符串
 */
function addDay(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}
