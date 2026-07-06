/**
 * 快照日期格式化（数据中心 Tab 详情卡通用）。
 *
 * 设计要点：
 * - 详情卡显示的是「当前 timeframe 的最后一日采样点」，对 day/week/month
 *   并不总是「今天」。在 header 加一个明确的日期副标题，避免误导用户。
 * - 使用 Intl.DateTimeFormat，按 locale 输出「月 日」短格式
 *   （zh: "7月5日"，en: "Jul 5"）。
 * - 不依赖任何具体时间库，仅用标准 API。
 * - 输入只接受 ISO 字符串；非法或缺失时返回 null（调用方按需隐藏）。
 */

/**
 * 将 ISO datetime/date 字符串格式化为快照日期文本。
 *
 * @param isoDate timeline 点的 date 字段（如 "2026-07-05" 或 "2026-07-05T08:00:00"）
 * @param locale  BCP-47 locale，如 "zh"、"en"
 * @returns 格式化后的短日期文本；输入为空/非法时返回 null
 */
export function formatSnapshotDate(
  isoDate: string | null | undefined,
  locale: string,
): string | null {
  if (!isoDate) return null;
  // Date 构造器对 "YYYY-MM-DD" 当作 UTC 解析；为避免时区偏移，缺 T 时补上本地午夜
  const iso = isoDate.includes('T') ? isoDate : `${isoDate}T00:00:00`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;

  const localeTag = locale === 'zh' ? 'zh-CN' : 'en-US';
  return new Intl.DateTimeFormat(localeTag, {
    month: locale === 'zh' ? 'long' : 'short',
    day: 'numeric',
  }).format(d);
}
