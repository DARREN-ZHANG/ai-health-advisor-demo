import type { HTMLAttributes } from 'react';

export type PillProps = HTMLAttributes<HTMLSpanElement>;

/** 圆角胶囊标签 */
export function Pill({ className = '', children, ...rest }: PillProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full bg-slate-700 px-3 py-0.5 text-sm text-slate-300 ${className}`}
      {...rest}
    >
      {children}
    </span>
  );
}
