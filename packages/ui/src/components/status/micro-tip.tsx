import type { HTMLAttributes } from 'react';

export type MicroTipProps = HTMLAttributes<HTMLDivElement>;

/** 带边框的提示框，蓝色主题 */
export function MicroTip({ className = '', children, ...rest }: MicroTipProps) {
  return (
    <div
      className={`rounded border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-sm text-blue-200 ${className}`}
      {...rest}
    >
      <span className="mr-1.5">💡</span>
      {children}
    </div>
  );
}
