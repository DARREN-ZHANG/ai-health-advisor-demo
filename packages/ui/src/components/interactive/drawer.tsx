import { useEffect, useCallback, type ReactNode, type HTMLAttributes, type CSSProperties } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import { XMarkIcon } from '@heroicons/react/24/outline';

export interface DrawerProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** 是否打开 */
  open: boolean;
  /** 关闭回调 */
  onClose: () => void;
  /** 抽屉标题 */
  title?: ReactNode;
  /** 头部操作区域 */
  headerActions?: ReactNode;
  /** 抽屉方向 */
  side?: 'left' | 'right' | 'bottom';
  /** 抽屉大小 */
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  /** 子元素 */
  children: ReactNode;
}

const sizeStyles = {
  side: {
    sm: { width: 'min(85vw, 16rem)' },
    md: { width: 'min(85vw, 20rem)' },
    lg: { width: 'min(90vw, 450px)' },
    xl: { width: 'min(95vw, 650px)' },
    full: { width: '100vw' },
  },
  bottom: {
    sm: { height: '40dvh', maxHeight: '50vh' },
    md: { height: '60dvh', maxHeight: '70vh' },
    lg: { height: '80dvh', maxHeight: '90vh' },
    xl: { height: '90dvh', maxHeight: '95vh' },
    full: { height: '98dvh', maxHeight: '100vh' },
  },
};

/** 侧边/底部抽屉组件 */
export function Drawer({
  open,
  onClose,
  title,
  headerActions,
  side = 'bottom',
  size = 'md',
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
    if (open) {
      document.body.style.overflow = 'hidden';
      document.addEventListener('keydown', handleKeyDown);
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, handleKeyDown]);

  const isBottom = side === 'bottom';
  const isRight = side === 'right';
  const panelSizeStyle = (isBottom ? sizeStyles.bottom[size] : sizeStyles.side[size]) as CSSProperties;
  const panelStyle: CSSProperties = {
    ...panelSizeStyle,
    boxShadow: '0 -20px 60px -15px rgba(0, 0, 0, 0.6)',
    ...(isBottom
      ? {
          borderTopLeftRadius: '2.5rem',
          borderTopRightRadius: '2.5rem',
        }
      : {}),
  };

  const positionClass = isBottom 
    ? 'bottom-0 left-0 right-0 border-t'
    : `top-0 bottom-0 ${isRight ? 'right-0 border-l' : 'left-0 border-r'}`;

  const variants = {
    hidden: {
      x: isBottom ? 0 : (isRight ? '100%' : '-100%'),
      y: isBottom ? '100%' : 0,
    },
    visible: {
      x: 0,
      y: 0,
      transition: {
        type: 'spring',
        damping: 30,
        stiffness: 300,
      }
    },
    exit: {
      x: isBottom ? 0 : (isRight ? '100%' : '-100%'),
      y: isBottom ? '100%' : 0,
      transition: {
        ease: 'easeInOut',
        duration: 0.4,
      }
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 overflow-hidden" role="dialog" aria-modal="true" {...rest}>
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-slate-950/70 backdrop-blur-md"
            onClick={onClose}
            aria-hidden="true"
          />
          
          <m.div
            variants={variants}
            initial="hidden"
            animate="visible"
            exit="exit"
            style={panelStyle}
            className={`absolute ${positionClass} bg-slate-900 border-slate-800 flex flex-col overflow-hidden ${className}`}
          >
            {isBottom && (
              <div className="w-full flex justify-center pt-5 pb-1 shrink-0">
                <div className="w-14 h-1.5 bg-slate-700 rounded-full opacity-40" />
              </div>
            )}

            {title && (
              <div className="flex items-center justify-between px-5 py-2.5 border-b border-slate-800 shrink-0">
                <h2 className="text-lg font-black text-slate-100 tracking-tighter flex-1 truncate">{title}</h2>
                <div className="flex items-center gap-1 shrink-0">
                  {headerActions}
                  <button
                    onClick={onClose}
                    className="text-slate-500 hover:text-slate-100 p-2 hover:bg-slate-800 rounded-2xl transition-all duration-200 active:scale-90"
                    aria-label="关闭"
                  >
                    <XMarkIcon className="w-6 h-6" strokeWidth={2.5} />
                  </button>
                </div>
              </div>
            )}
            
            <div className="min-h-0 flex-1 overflow-y-auto scrollbar-hide selection:bg-blue-500/30">
              <div className="px-5 py-4">
                {children}
              </div>
            </div>
          </m.div>
        </div>
      )}
    </AnimatePresence>
  );
}
