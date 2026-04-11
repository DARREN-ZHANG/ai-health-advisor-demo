import { forwardRef, type ButtonHTMLAttributes } from 'react';

const variantStyles = {
  primary: 'bg-blue-600 text-white hover:bg-blue-700 focus-visible:ring-blue-500',
  secondary: 'bg-slate-700 text-slate-200 hover:bg-slate-600 focus-visible:ring-slate-500',
  ghost: 'bg-transparent text-slate-300 hover:bg-slate-700/50 focus-visible:ring-slate-500',
} as const;

export type ButtonVariant = keyof typeof variantStyles;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** 按钮样式变体 */
  variant?: ButtonVariant;
}

/** 通用按钮组件 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', className = '', children, ...rest },
  ref,
) {
  const base =
    'inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 disabled:pointer-events-none disabled:opacity-50';

  return (
    <button ref={ref} className={`${base} ${variantStyles[variant]} ${className}`} {...rest}>
      {children}
    </button>
  );
});
