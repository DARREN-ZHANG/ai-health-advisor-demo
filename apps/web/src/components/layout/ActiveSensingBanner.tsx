'use client';

import { useEffect, useState } from 'react';
import { useActiveSensingStore } from '@/stores/active-sensing.store';
import { m, AnimatePresence } from 'framer-motion';
import { useUIStore } from '@/stores/ui.store';
import { useAIAdvisorStore } from '@/stores/ai-advisor.store';
import { useGodModeActions } from '@/hooks/use-god-mode-actions';
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
  possible_alcohol_intake: 'possibleAlcoholIntake',
  possible_caffeine_intake: 'possibleCaffeineIntake',
};

/** 需要用户确认的概率事件 */
const PROBABILISTIC_EVENTS = new Set(['possible_alcohol_intake', 'possible_caffeine_intake']);

function isProbabilisticBanner(banner: ActiveSensingBannerPayload | null): boolean {
  return banner?.events?.some((e) => PROBABILISTIC_EVENTS.has(e)) ?? false;
}

export function ActiveSensingBanner() {
  const { activeBanner, isVisible, hideBanner, pendingProbabilisticAction, setPendingProbabilisticAction } =
    useActiveSensingStore();
  const { toggleAdvisorDrawer } = useUIStore();
  const { setPendingPrompt } = useAIAdvisorStore();
  const { appendTimeline, injectEvent } = useGodModeActions();
  const [renderedBanner, setRenderedBanner] = useState<ActiveSensingBannerPayload | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const t = useTranslations('advisor.activeSensing');
  const tCommon = useTranslations('common');

  useEffect(() => {
    if (activeBanner) {
      setRenderedBanner(activeBanner);
    }
  }, [activeBanner]);

  const banner = activeBanner ?? renderedBanner;
  const isProbabilistic = isProbabilisticBanner(banner);

  if (!banner && !isVisible) return null;

  const openAdvisor = () => {
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

  const handleConfirm = () => {
    openAdvisor();
  };

  const handleConfirmYes = async () => {
    if (isConfirming) return;
    setIsConfirming(true);
    try {
      // 用户确认后，才真正追加 timeline segment（生成 mock 数据 + 触发 LLM）
      if (pendingProbabilisticAction) {
        await appendTimeline({
          segmentType: pendingProbabilisticAction.segmentType,
          params: pendingProbabilisticAction.params,
        });
        setPendingProbabilisticAction(null);
      }
      hideBanner();
    } catch (error) {
      console.error('Failed to confirm probabilistic event:', error);
    } finally {
      setIsConfirming(false);
    }
  };

  const handleGoToChat = () => {
    openAdvisor();
  };

  const handleConfirmNo = async () => {
    if (isConfirming) return;
    setIsConfirming(true);
    try {
      // 注入 dismiss 事件覆盖掉 possible_*，防止后续操作再次触发 Banner
      await injectEvent({
        eventType: 'probabilistic_dismissed',
        data: { reason: 'user_denied', originalEvents: banner?.events ?? [] },
      });
      setPendingProbabilisticAction(null);
      hideBanner();
    } catch (error) {
      console.error('Failed to dismiss probabilistic event:', error);
    } finally {
      setIsConfirming(false);
    }
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
                {isProbabilistic ? (
                  <>
                    <button
                      onClick={handleConfirmNo}
                      disabled={isConfirming}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-500/30 text-white hover:bg-blue-500/50 transition-colors disabled:opacity-50"
                    >
                      {tCommon('no')}
                    </button>
                    <button
                      onClick={handleConfirmYes}
                      disabled={isConfirming}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white text-blue-600 hover:bg-blue-50 transition-colors shadow-sm disabled:opacity-50"
                    >
                      {isConfirming ? tCommon('processing') : tCommon('yes')}
                    </button>
                    <button
                      onClick={handleGoToChat}
                      disabled={isConfirming}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-500/30 text-white hover:bg-blue-500/50 transition-colors disabled:opacity-50"
                    >
                      {tCommon('goToChat')}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={handleConfirm}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white text-blue-600 hover:bg-blue-50 transition-colors shadow-sm"
                  >
                    {tCommon('viewDetailAndChat')}
                  </button>
                )}
              </div>
            </div>
          </div>
        </m.div>
      ) : null}
    </AnimatePresence>
  );
}
