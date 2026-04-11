import type { HTMLAttributes } from 'react';

export interface InlineErrorProps extends HTMLAttributes<HTMLDivElement> {
  /** 错误消息 */
  message: string;
}

/** 行内错误消息 */
export function InlineError({ message, className = '', ...rest }: InlineErrorProps) {
  return (
    <div
      className={`rounded border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm text-red-300 ${className}`}
      role="alert"
      {...rest}
    >
      {message}
    </div>
  );
}
