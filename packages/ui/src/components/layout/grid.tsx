import { forwardRef, type HTMLAttributes } from 'react';

export interface GridProps extends HTMLAttributes<HTMLDivElement> {
  /** 列数 */
  cols?: number;
}

/** CSS Grid 布局 */
export const Grid = forwardRef<HTMLDivElement, GridProps>(function Grid(
  { className = '', cols = 1, children, style, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={`grid ${className}`}
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, ...style }}
      {...rest}
    >
      {children}
    </div>
  );
});
