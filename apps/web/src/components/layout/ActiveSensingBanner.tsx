'use client';

import { useEffect, useState } from 'react';
import { useActiveSensingStore } from '@/stores/active-sensing.store';
import { m, AnimatePresence } from 'framer-motion';
import { useUIStore } from '@/stores/ui.store';
import { useAIAdvisorStore } from '@/stores/ai-advisor.store';
import type { ActiveSensingBanner as ActiveSensingBannerPayload } from '@/stores/active-sensing.store';
import { XMarkIcon, CpuChipIcon } from '@heroicons/react/24/outline';

const EVENT_PROMPTS: Record<string, string> = {
  sport_detected: '我现在在运动，有什么注意事项和运动建议？',
  late_night_work: '我现在还在熬夜加班，能给我一些保持状态或者健康方面的建议吗？',
  high_stress: '我感觉现在的压力有点大，该怎么调节一下？',
  poor_sleep: '我昨晚没睡好，今天该注意些什么？',
  sedentary: '我已经坐了很久了，现在该做些什么运动或者拉伸？',
};

export function ActiveSensingBanner() {
  const { activeBanner, isVisible, hideBanner } = useActiveSensingStore();
  const { toggleAdvisorDrawer } = useUIStore();
  const { setPendingPrompt } = useAIAdvisorStore();
  const [renderedBanner, setRenderedBanner] = useState<ActiveSensingBannerPayload | null>(null);

  useEffect(() => {
    if (activeBanner) {
      setRenderedBanner(activeBanner);
    }
  }, [activeBanner]);

  const banner = activeBanner ?? renderedBanner;

  if (!banner && !isVisible) return null;

  const handleAction = () => {
    if (banner?.events && banner.events.length > 0) {
      const event = banner.events[0];
      const prompt = EVENT_PROMPTS[event] || `关于“${banner.title}”，我需要一些建议。`;
      
      setPendingPrompt(prompt);
    }

    toggleAdvisorDrawer(true);
    hideBanner();
  };

  return (
    <AnimatePresence onExitComplete={() => setRenderedBanner(null)}>
      {isVisible && banner ? (
        <m.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="overflow-hidden"
        >
          <div className="bg-blue-600 rounded-2xl shadow-xl overflow-hidden border border-blue-400/30">
            <div className="p-4 flex flex-col gap-2">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <CpuChipIcon className="w-5 h-5 text-blue-100" />
                  <span className="text-xs font-bold text-blue-100 uppercase tracking-widest">AI Proactive Insight</span>
                </div>
                <button onClick={hideBanner} className="text-blue-200 hover:text-white transition-colors p-1">
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
                  onClick={handleAction}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white text-blue-600 hover:bg-blue-50 transition-colors shadow-sm"
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
