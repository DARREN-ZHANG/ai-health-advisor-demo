/** 状态颜色 */
export const statusColors = {
  good: '#22c55e',
  warning: '#eab308',
  alert: '#ef4444',
  neutral: '#94a3b8',
} as const;

/** 表面颜色 */
export const surfaceColors = {
  primary: '#0f172a',
  secondary: '#1e293b',
  tertiary: '#334155',
  elevated: '#1e293b',
} as const;

/** 文本颜色 */
export const textColors = {
  primary: '#f8fafc',
  secondary: '#94a3b8',
  muted: '#64748b',
  inverse: '#0f172a',
} as const;

/** 品牌颜色 */
export const brandColors = {
  primary: '#3b82f6',
  secondary: '#8b5cf6',
  accent: '#06b6d4',
} as const;

export type StatusColor = keyof typeof statusColors;
export type SurfaceColor = keyof typeof surfaceColors;
export type TextColor = keyof typeof textColors;
export type BrandColor = keyof typeof brandColors;
