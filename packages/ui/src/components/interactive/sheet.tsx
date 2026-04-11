import { useEffect, useCallback, type ReactNode, type HTMLAttributes } from 'react';

export interface SheetProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** 是否打开 */
  open: boolean;
  /** 关闭回调 */
  onClose: () => void;
  /** 面板标题 */
  title?: ReactNode;
  /** 子元素 */
  children: ReactNode;
}

/** 底部弹出面板（Bottom Sheet）组件 */
export function Sheet({
  open,
  onClose,
  title,
  className = '',
  children,
  ...rest
}: SheetProps) {
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
        className={`absolute bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-700 rounded-t-xl shadow-xl max-h-[80vh] flex flex-col animate-in slide-in-from-bottom duration-200 ${className}`}
      >
        {/* 拖拽指示条 */}
        <div className="flex justify-center pt-2 pb-0">
          <div className="w-8 h-1 rounded-full bg-slate-600" />
        </div>
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
