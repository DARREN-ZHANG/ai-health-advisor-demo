import { forwardRef, type HTMLAttributes } from 'react';

export interface SectionProps extends HTMLAttributes<HTMLElement> {
  /** 可选的区块标题 */
  title?: string;
}

/** 语义化 section 区块 */
export const Section = forwardRef<HTMLElement, SectionProps>(function Section(
  { className = '', title, children, ...rest },
  ref,
) {
  return (
    <section ref={ref} className={className} {...rest}>
      {title && <h2 className="text-xl font-semibold text-slate-100">{title}</h2>}
      {children}
    </section>
  );
});
