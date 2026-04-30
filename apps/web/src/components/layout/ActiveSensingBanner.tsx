'use client';

import { useEffect, useState } from 'react';
import { useActiveSensingStore } from '@/stores/active-sensing.store';
import { m, AnimatePresence } from 'framer-motion';
import { useUIStore } from '@/stores/ui.store';
import { useAIAdvisorStore } from '@/stores/ai-advisor.store';
import type { ActiveSensingBanner as ActiveSensingBannerPayload } from '@/stores/active-sensing.store';
import { XMarkIcon, CpuChipIcon } from '@heroicons/react/24/outline';
import { useTranslations } from 'next-intl';

/** 事件类型到翻译键的映射 */
const EVENT_PROMPT_KEYS: Record<string, string> = {
  sport_detected: 'sportDetected',
  late_night_work: 'lateNightWork',
  high_stress: 'highStress',
  poor_sleep: 'poorSleep',
  sedentary: 'sedentary',
};

export function ActiveSensingBanner() {
  const { activeBanner, isVisible, hideBanner } = useActiveSensingStore();
  const { toggleAdvisorDrawer } = useUIStore();
  const { setPendingPrompt } = useAIAdvisorStore();
  const [renderedBanner, setRenderedBanner] = useState<ActiveSensingBannerPayload | null>(null);
  const t = useTranslations('advisor.activeSensing');
  const tCommon = useTranslations('common');

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
      if (!event) return;
      const promptKey = EVENT_PROMPT_KEYS[event];
      const prompt = promptKey ? t(promptKey) : t('genericPrompt', { title: banner.title });

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
                  {tCommon('viewDetailAndChat')}
                </button>
              </div>
            </div>
          </div>
        </m.div>
      ) : null}
    </AnimatePresence>
  );
}
