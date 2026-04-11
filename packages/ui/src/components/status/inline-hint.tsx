import type { HTMLAttributes } from 'react';

export type InlineHintProps = HTMLAttributes<HTMLSpanElement>;

/** 行内提示文本 */
export function InlineHint({ className = '', children, ...rest }: InlineHintProps) {
  return (
    <span className={`text-sm text-slate-400 ${className}`} {...rest}>
      {children}
    </span>
  );
}
