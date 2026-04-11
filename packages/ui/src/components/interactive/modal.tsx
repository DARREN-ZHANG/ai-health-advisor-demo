import { useEffect, useCallback, type ReactNode, type HTMLAttributes } from 'react';

export interface ModalProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** 是否打开 */
  open: boolean;
  /** 关闭回调 */
  onClose: () => void;
  /** 弹窗标题 */
  title?: ReactNode;
  /** 子元素 */
  children: ReactNode;
}

/** 模态弹窗组件 */
export function Modal({
  open,
  onClose,
  title,
  className = '',
  children,
  ...rest
}: ModalProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [open, handleKeyDown]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true" {...rest}>
      {/* 遮罩 */}
      <div
        className="absolute inset-0 bg-black/60 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* 内容面板 */}
      <div
        className={`relative bg-slate-900 border border-slate-700 rounded-xl shadow-xl w-full max-w-md mx-4 animate-in fade-in zoom-in-95 duration-150 ${className}`}
      >
        {title && (
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
            <h2 className="text-base font-medium text-slate-100">{title}</h2>
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
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
