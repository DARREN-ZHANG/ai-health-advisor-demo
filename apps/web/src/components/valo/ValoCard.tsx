import { forwardRef, type ElementType, type HTMLAttributes } from 'react';

/**
 * ValoCard —— Valo 设计系统的通用表面容器。
 *
 * 设计要点（来自 design-manifest.md）：
 * - 大圆角、弱边框、深色层级
 * - 仅引用 CSS 变量，不出现散落的硬编码颜色字面量
 * - 默认 variant=default；glass 增加毛玻璃与高阴影，用于在页面上分层悬浮
 *
 * 仅承载视觉容器职责，不假设具体内容结构。
 */

export type ValoCardVariant = 'default' | 'glass';

export interface ValoCardProps extends HTMLAttributes<HTMLElement> {
  /** 语义元素；默认 div，可换 section / article / aside 等 */
  as?: ElementType;
  /** 视觉变体；default=纯表面，glass=毛玻璃悬浮层 */
  variant?: ValoCardVariant;
}

const BASE_CLASS =
  'rounded-2xl border border-[var(--valo-border)] bg-[var(--valo-surface)] ' +
  'text-[var(--valo-text-primary)] p-4 shadow-[var(--valo-shadow-card)] ' +
  'transition-shadow';

const VARIANT_CLASS: Readonly<Record<ValoCardVariant, string>> = {
  default: '',
  glass:
    'backdrop-blur-md bg-[var(--valo-glass)] shadow-[var(--valo-shadow-elevated)]',
};

export const ValoCard = forwardRef<HTMLElement, ValoCardProps>(function ValoCard(
  { as, variant = 'default', className = '', children, ...rest },
  ref,
) {
  const Component = as ?? 'div';
  const combined = `${BASE_CLASS} ${VARIANT_CLASS[variant]} ${className}`.trim();

  return (
    <Component ref={ref} className={combined} {...rest}>
      {children}
    </Component>
  );
});
