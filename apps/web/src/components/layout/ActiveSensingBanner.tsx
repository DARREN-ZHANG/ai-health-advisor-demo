'use client';

import { useEffect, useState } from 'react';
import { useActiveSensingStore } from '@/stores/active-sensing.store';
import { m, AnimatePresence } from 'framer-motion';
import { useUIStore } from '@/stores/ui.store';
import type { ActiveSensingBanner as ActiveSensingBannerPayload } from '@/stores/active-sensing.store';
import { XMarkIcon, CpuChipIcon } from '@heroicons/react/24/outline';

export function ActiveSensingBanner() {
  const { activeBanner, isVisible, hideBanner } = useActiveSensingStore();
  const { toggleAdvisorDrawer } = useUIStore();
  const [renderedBanner, setRenderedBanner] = useState<ActiveSensingBannerPayload | null>(null);

  useEffect(() => {
    if (activeBanner) {
      setRenderedBanner(activeBanner);
    }
  }, [activeBanner]);

  const banner = activeBanner ?? renderedBanner;

  if (!banner && !isVisible) return null;

  const handleAction = () => {
    toggleAdvisorDrawer(true);
    hideBanner();
  };

  return (
    <AnimatePresence onExitComplete={() => setRenderedBanner(null)}>
      {isVisible && banner ? (
        <m.div
          initial={{ opacity: 0, y: -24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -24 }}
          className="fixed top-14 left-0 right-0 z-40 px-4 md:px-6"
        >
          <div className="mx-auto max-w-4xl bg-blue-600 rounded-b-2xl shadow-2xl overflow-hidden border border-blue-400/30">
            <div className="p-4 flex flex-col gap-2">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <CpuChipIcon className="w-5 h-5 text-blue-100" />
                  <span className="text-xs font-bold text-blue-100 uppercase tracking-widest">AI Proactive Insight</span>
                </div>
                <button onClick={hideBanner} className="text-blue-200 hover:text-white">
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>
              
              <div>
                <h4 className="text-sm font-bold text-white">{banner.title}</h4>
                <p className="text-xs text-blue-100 mt-1 leading-relaxed">
                  {banner.content}
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
        </m.div>
      ) : null}
    </AnimatePresence>
  );
}
