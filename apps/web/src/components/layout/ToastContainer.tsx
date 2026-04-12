'use client';

import { useUIStore } from '@/stores/ui.store';
import { motion, AnimatePresence } from 'framer-motion';

const typeColors = {
  info: 'bg-blue-600 border-blue-400',
  success: 'bg-green-600 border-green-400',
  warning: 'bg-yellow-600 border-yellow-400',
  error: 'bg-red-600 border-red-400',
};

export function ToastContainer() {
  const { toasts, removeToast } = useUIStore();

  return (
    <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-3 w-full max-w-sm px-4">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            onClick={() => removeToast(toast.id)}
            className={`cursor-pointer flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg text-white text-sm font-medium ${typeColors[toast.type]} transition-transform hover:scale-[1.02]`}
          >
            <span className="flex-1">{toast.message}</span>
            <button className="opacity-60 hover:opacity-100">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
