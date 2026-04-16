'use client';

import { m } from 'framer-motion';
import { useUIStore } from '@/stores/ui.store';
import { ChatBubbleOvalLeftEllipsisIcon } from '@heroicons/react/24/outline';

export function AIAdvisorTrigger() {
  const { toggleAdvisorDrawer, isAdvisorDrawerOpen } = useUIStore();

  if (isAdvisorDrawerOpen) return null;

  return (
    <div className="fixed bottom-24 right-6 z-40 md:bottom-8">
      <m.button
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => toggleAdvisorDrawer(true)}
        className="w-14 h-14 rounded-full bg-blue-600 text-white shadow-lg shadow-blue-500/40 flex items-center justify-center text-2xl border-2 border-blue-400/30 hover:bg-blue-500 transition-colors"
        aria-label="打开 AI 顾问"
      >
        <ChatBubbleOvalLeftEllipsisIcon className="w-7 h-7" />
        <m.div
          className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-slate-950"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 1, type: 'spring' }}
        />
      </m.button>
    </div>
  );
}
