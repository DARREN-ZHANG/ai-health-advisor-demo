import { useEffect, useCallback, type ReactNode, type HTMLAttributes } from 'react';

export interface DrawerProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** 是否打开 */
  open: boolean;
  /** 关闭回调 */
  onClose: () => void;
  /** 抽屉标题 */
  title?: ReactNode;
  /** 抽屉方向 */
  side?: 'left' | 'right';
  /** 子元素 */
  children: ReactNode;
}

/** 侧边抽屉组件 */
export function Drawer({
  open,
  onClose,
  title,
  side = 'right',
  className = '',
  children,
  ...rest
}: DrawerProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, handleKeyDown]);

  if (!open) return null;

  const slideFrom = side === 'left' ? 'left-0' : 'right-0';

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" {...rest}>
      {/* 遮罩 */}
      <div
        className="absolute inset-0 bg-black/50 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* 面板 */}
      <div
        className={`absolute top-0 bottom-0 ${slideFrom} w-80 max-w-[85vw] bg-slate-900 border-l border-slate-700 shadow-xl flex flex-col animate-in slide-in-from-right duration-200 ${className}`}
      >
        {title && (
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
            <h2 className="text-sm font-medium text-slate-100">{title}</h2>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-200 p-1"
              aria-label="关闭"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M4 4l8 8M12 4l-8 8"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}
