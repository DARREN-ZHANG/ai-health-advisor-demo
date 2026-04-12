'use client';

import { useActiveSensingStore } from '@/stores/active-sensing.store';
import { motion, AnimatePresence } from 'framer-motion';
import { useUIStore } from '@/stores/ui.store';

export function ActiveSensingBanner() {
  const { activeBanner, isVisible, hideBanner } = useActiveSensingStore();
  const { toggleAdvisorDrawer } = useUIStore();

  if (!activeBanner) return null;

  const handleAction = () => {
    toggleAdvisorDrawer(true);
    hideBanner();
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 50 }}
          className="fixed bottom-24 left-4 right-4 md:left-auto md:right-24 md:w-96 z-40"
        >
          <div className="bg-blue-600 rounded-xl shadow-2xl overflow-hidden border border-blue-400/30">
            <div className="p-4 flex flex-col gap-2">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xl">🤖</span>
                  <span className="text-xs font-bold text-blue-100 uppercase tracking-widest">AI Proactive Insight</span>
                </div>
                <button onClick={hideBanner} className="text-blue-200 hover:text-white">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
              
              <div>
                <h4 className="text-sm font-bold text-white">{activeBanner.title}</h4>
                <p className="text-xs text-blue-100 mt-1 leading-relaxed">
                  {activeBanner.content}
                </p>
              </div>

              <div className="flex justify-end gap-2 mt-2">
                <button 
                  onClick={hideBanner}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-blue-100 hover:bg-white/10"
                >
                  忽略
                </button>
                <button 
                  onClick={handleAction}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white text-blue-600 hover:bg-blue-50"
                >
                  查看详情并对话
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
