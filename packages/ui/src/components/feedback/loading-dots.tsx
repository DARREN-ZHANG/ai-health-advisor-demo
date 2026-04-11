import type { HTMLAttributes } from 'react';

export type LoadingDotsProps = HTMLAttributes<HTMLDivElement>;

/** 三个弹跳圆点加载动画 */
export function LoadingDots({ className = '', ...rest }: LoadingDotsProps) {
  return (
    <div
      className={`flex items-center gap-1 ${className}`}
      role="status"
      aria-label="加载中"
      {...rest}
    >
      <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:0ms]" />
      <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:150ms]" />
      <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:300ms]" />
    </div>
  );
}
