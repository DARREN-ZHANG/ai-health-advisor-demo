import { forwardRef, type HTMLAttributes } from 'react';

export type SkeletonProps = HTMLAttributes<HTMLDivElement>;

/** 骨架屏加载占位符 */
export const Skeleton = forwardRef<HTMLDivElement, SkeletonProps>(function Skeleton(
  { className = '', ...rest },
  ref,
) {
  return (
    <div ref={ref} className={`animate-pulse rounded-md bg-slate-700 ${className}`} {...rest} />
  );
});
