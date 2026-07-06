/**
 * Demo Control 时间格式化工具。
 *
 * 这些函数刻意不依赖 Intl/DateTimeFormat：
 * - 演示时间在 God Mode 下是“逻辑时间”，格式固定为 `YYYY-MM-DDTHH:mm`，
 *   不需要 locale 感知。
 * - 直接 slice 字符串最快且与 i18n 无关，便于 jsdom 测试断言。
 *
 * 仅 demo-control 内部使用；其它模块请使用 shared 或 i18n 提供的格式化器。
 */

/** 将 YYYY-MM-DDTHH:mm（或带秒的 ISO）转换为 HH:MM；无值时返回占位 `--:--`。 */
export function formatClock(isoDateTime: string | null | undefined): string {
  if (!isoDateTime) return '--:--';
  const timePart = isoDateTime.includes('T') ? isoDateTime.split('T')[1] : isoDateTime;
  return (timePart ?? '').slice(0, 5) || '--:--';
}

/**
 * 将两个 ISO 字符串拼成时间区间字符串 `HH:MM–HH:MM`（使用 en-dash `–`）。
 *
 * 与现有 UI 文案保持一致；如果某一段缺省，会回退到 `--:--`。
 */
export function formatTimeRange(
  startIso: string | null | undefined,
  endIso: string | null | undefined,
): string {
  return `${formatClock(startIso)}–${formatClock(endIso)}`;
}
