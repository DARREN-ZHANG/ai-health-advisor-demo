import { useEffect, useCallback, useState, type ReactNode, type HTMLAttributes } from 'react';

export interface DrawerProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** 是否打开 */
  open: boolean;
  /** 关闭回调 */
  onClose: () => void;
  /** 抽屉标题 */
  title?: ReactNode;
  /** 抽屉方向 */
  side?: 'left' | 'right';
  /** 抽屉大小 */
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  /** 子元素 */
  children: ReactNode;
}

const sizeClasses = {
  sm: 'sm:w-64 w-[85vw]',
  md: 'sm:w-80 w-[85vw]',
  lg: 'sm:w-[450px] w-[90vw]',
  xl: 'sm:w-[650px] w-[95vw]',
  full: 'w-screen',
};

/** 侧边抽屉组件 */
export function Drawer({
  open,
  onClose,
  title,
  side = 'right',
  size = 'md',
  className = '',
  children,
  ...rest
}: DrawerProps) {
  const [mounted, setMounted] = useState(open);
  const [active, setActive] = useState(open);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (open) {
      setMounted(true);
      // 小延迟触发动画进入
      const timer = setTimeout(() => {
        setActive(true);
        document.body.style.overflow = 'hidden';
      }, 10);
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        clearTimeout(timer);
        document.removeEventListener('keydown', handleKeyDown);
      };
    } else {
      setActive(false);
      document.body.style.overflow = '';
      // 等待动画结束后卸载组件（500ms 对应 duration-500）
      const timer = setTimeout(() => setMounted(false), 500);
      return () => clearTimeout(timer);
    }
  }, [open, handleKeyDown]);

  if (!mounted) return null;

  const widthClass = sizeClasses[size];
  const isRight = side === 'right';

  return (
    <div className="fixed inset-0 z-50 overflow-hidden" role="dialog" aria-modal="true" {...rest}>
      {/* 遮罩 */}
      <div
        className={`absolute inset-0 bg-slate-950/40 backdrop-blur-md transition-opacity duration-500 ease-out ${
          active ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />
      {/* 面板 */}
      <div
        className={`absolute top-0 bottom-0 ${isRight ? 'right-0 border-l' : 'left-0 border-r'} 
          ${widthClass} bg-slate-900 border-slate-800 shadow-[0_0_50px_-12px_rgba(0,0,0,0.5)] 
          flex flex-col transform transition-transform duration-500 cubic-bezier(0.16, 1, 0.3, 1) ${
          active 
            ? 'translate-x-0' 
            : isRight ? 'translate-x-full' : '-translate-x-full'
        } ${className}`}
      >
        {title && (
          <div className="flex items-center justify-between px-6 py-5 border-b border-slate-800/50">
            <h2 className="text-lg font-bold text-slate-100 tracking-tight">{title}</h2>
            <button
              onClick={onClose}
              className="text-slate-500 hover:text-slate-100 p-2 hover:bg-slate-800 rounded-xl transition-all duration-200 active:scale-95"
              aria-label="关闭"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path
                  d="M18 6L6 18M6 6l12 12"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-6 py-6 scrollbar-hide selection:bg-blue-500/30">
          {children}
        </div>
      </div>
    </div>
  );
}
