import { forwardRef, type HTMLAttributes } from 'react';

export type ContainerProps = HTMLAttributes<HTMLDivElement>;

/** 居中容器，max-w-7xl + 水平内边距 */
export const Container = forwardRef<HTMLDivElement, ContainerProps>(function Container(
  { className = '', children, ...rest },
  ref,
) {
  return (
    <div ref={ref} className={`mx-auto max-w-7xl px-4 ${className}`} {...rest}>
      {children}
    </div>
  );
});
