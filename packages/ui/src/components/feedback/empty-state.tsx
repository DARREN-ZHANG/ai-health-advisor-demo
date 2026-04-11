import type { HTMLAttributes } from 'react';

export interface EmptyStateProps extends HTMLAttributes<HTMLDivElement> {
  /** 提示消息 */
  message: string;
}

/** 空状态居中提示 */
export function EmptyState({ message, className = '', ...rest }: EmptyStateProps) {
  return (
    <div className={`flex items-center justify-center py-12 text-slate-400 ${className}`} {...rest}>
      <p>{message}</p>
    </div>
  );
}
