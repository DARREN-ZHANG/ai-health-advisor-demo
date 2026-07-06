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
 *
 * ## 关于 `as` 多态的已知限制（Important）
 *
 * 出于在 Next.js 15 + React 19 + Tailwind v4 代码库内维护最小成本的考量，
 * 本组件采用 MUI/Base 风格的“弱多态”实现：`as` 仅作为运行时渲染开关，
 * **不做编译期类型检查**。换言之：
 *
 * - `<ValoCard as="a" href="/foo">` 会在运行期正确渲染为 `<a>`，
 *   但 TypeScript 不会校验 `href`，IDE 也不会给出元素特定属性的补全。
 * - `<ValoCard as="button" onClick={...}>` 同理。
 *
 * 如果调用方确实需要元素特定属性的编译期保证，请直接使用原生元素，
 * 再把 `valo-*` token 引到 className；本原语不为这种场景买单。
 *
 * `ref` 类型固定为 `HTMLElement`（而非按 `as` 收窄），也是同一决策的后果：
 * 若需精确的 `HTMLAnchorElement` / `HTMLButtonElement`，请在调用点断言。
 */
export type ValoCardVariant = 'default' | 'glass';

export interface ValoCardProps extends HTMLAttributes<HTMLElement> {
  /**
   * 语义元素；默认 `div`，可换 `section` / `article` / `aside` 等。
   *
   * 注意：本 prop 仅作运行时渲染开关，不会对元素特定属性做编译期校验。
   * 详见组件顶层 jsdoc 的“关于 `as` 多态的已知限制”。
   */
  as?: ElementType;
  /** 视觉变体；default=纯表面，glass=毛玻璃悬浮层 */
  variant?: ValoCardVariant;
  /**
   * 卡片内容。当 `children` 为 `undefined` 时，仍会渲染一个空的
   * 带 padding 的表面容器（空状态由调用方负责）。
   */
  children?: React.ReactNode;
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
