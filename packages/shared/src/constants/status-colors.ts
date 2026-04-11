export type StatusLevel = 'good' | 'warning' | 'alert' | 'neutral';

export const STATUS_COLORS: Record<StatusLevel, string> = {
  good: '#22c55e',
  warning: '#f59e0b',
  alert: '#ef4444',
  neutral: '#6b7280',
} as const;

export function getStatusColor(value: number, thresholds: { good: number; warning: number }): StatusLevel {
  if (value >= thresholds.good) return 'good';
  if (value >= thresholds.warning) return 'warning';
  return 'alert';
}
