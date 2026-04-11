import { forwardRef, type HTMLAttributes } from 'react';

export type CardProps = HTMLAttributes<HTMLDivElement>;

/** 卡片容器，深色主题样式 */
export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { className = '', children, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={`rounded-lg border border-slate-700 bg-slate-800 p-4 ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
});
