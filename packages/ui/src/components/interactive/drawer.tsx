import { useEffect, useCallback, type ReactNode, type HTMLAttributes } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import { XMarkIcon } from '@heroicons/react/24/outline';

export interface DrawerProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** 是否打开 */
  open: boolean;
  /** 关闭回调 */
  onClose: () => void;
  /** 抽屉标题 */
  title?: ReactNode;
  /** 抽屉方向 */
  side?: 'left' | 'right' | 'bottom';
  /** 抽屉大小 */
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  /** 子元素 */
  children: ReactNode;
}

const sizeClasses = {
  side: {
    sm: 'sm:w-64 w-[85vw]',
    md: 'sm:w-80 w-[85vw]',
    lg: 'sm:w-[450px] w-[90vw]',
    xl: 'sm:w-[650px] w-[95vw]',
    full: 'w-screen',
  },
  bottom: {
    sm: 'h-[40vh]',
    md: 'h-[60vh]',
    lg: 'h-[80vh]',
    xl: 'h-[90vh]',
    full: 'h-[98vh]',
  }
};

/** 侧边/底部抽屉组件 */
export function Drawer({
  open,
  onClose,
  title,
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
  const sizeClass = isBottom ? sizeClasses.bottom[size] : sizeClasses.side[size];

  const positionClass = isBottom 
    ? 'bottom-0 left-0 right-0 border-t rounded-t-[2.5rem]' 
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
            className={`absolute ${positionClass} ${sizeClass} bg-slate-900 border-slate-800 shadow-[0_-20px_60px_-15px_rgba(0,0,0,0.6)] 
              flex flex-col ${className}`}
          >
            {isBottom && (
              <div className="w-full flex justify-center pt-5 pb-1 shrink-0">
                <div className="w-14 h-1.5 bg-slate-700 rounded-full opacity-40" />
              </div>
            )}

            {title && (
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800/30 shrink-0">
                <h2 className="text-xl font-black text-slate-100 tracking-tighter">{title}</h2>
                <button
                  onClick={onClose}
                  className="text-slate-500 hover:text-slate-100 p-2.5 hover:bg-slate-800 rounded-2xl transition-all duration-200 active:scale-90"
                  aria-label="关闭"
                >
                  <XMarkIcon className="w-6 h-6 stroke-[2.5]" />
                </button>
              </div>
            )}
            <div className="flex-1 overflow-y-auto px-5 py-4 scrollbar-hide selection:bg-blue-500/30">
              {children}
            </div>
          </m.div>
        </div>
      )}
    </AnimatePresence>
  );
}
