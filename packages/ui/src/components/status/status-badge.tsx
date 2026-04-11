import type { HTMLAttributes } from 'react';
import { statusColors, type StatusColor } from '../../tokens';

export interface StatusBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  /** 状态类型 */
  status: StatusColor;
  /** 显示文本 */
  label: string;
}

/** 状态徽章：彩色圆点 + 文本，胶囊样式 */
export function StatusBadge({ status, label, className = '', ...rest }: StatusBadgeProps) {
  const dotColor = statusColors[status];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full bg-slate-700/50 px-3 py-1 text-sm ${className}`}
      {...rest}
    >
      <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: dotColor }} />
      <span className="text-slate-200">{label}</span>
    </span>
  );
}
