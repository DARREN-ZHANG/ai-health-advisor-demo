'use client';

import { useEffect, useState } from 'react';
import { useActiveSensingStore } from '@/stores/active-sensing.store';
import { m, AnimatePresence } from 'framer-motion';
import { useUIStore } from '@/stores/ui.store';
import { useAIAdvisorStore } from '@/stores/ai-advisor.store';
import { useGodModeActions } from '@/hooks/use-god-mode-actions';
import type { ActiveSensingBanner as ActiveSensingBannerPayload } from '@/stores/active-sensing.store';
import { CheckIcon, XMarkIcon } from '@heroicons/react/24/outline';
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
          <div className="rounded-full bg-[linear-gradient(135deg,var(--valo-accent-warm),var(--valo-prime))] p-2 shadow-[0_12px_28px_color-mix(in_srgb,var(--valo-prime)_34%,transparent)]">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[color-mix(in_srgb,var(--valo-canvas)_78%,transparent)] text-xl">
                🏃
              </div>

              <button
                type="button"
                onClick={isProbabilistic ? handleGoToChat : handleConfirm}
                className="min-w-0 flex-1 text-left focus-visible:outline-none"
              >
                <h4 className="truncate text-sm font-semibold text-white">{banner.title}</h4>
                <p className="truncate text-xs text-white/85">
                  {banner.content}
                </p>
              </button>

              <div className="flex shrink-0 items-center gap-2">
                {isProbabilistic ? (
                  <>
                    <button
                      type="button"
                      onClick={handleConfirmNo}
                      disabled={isConfirming}
                      aria-label={tCommon('no')}
                      className="grid h-8 w-8 place-items-center rounded-full border border-white/75 text-white transition-colors hover:bg-white/15 disabled:opacity-50"
                    >
                      <XMarkIcon className="h-5 w-5" />
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmYes}
                      disabled={isConfirming}
                      aria-label={tCommon('yes')}
                      className="grid h-8 w-8 place-items-center rounded-full bg-white text-[var(--valo-prime)] transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                      {isConfirming ? (
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      ) : (
                        <CheckIcon className="h-5 w-5" />
                      )}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={handleConfirm}
                    className="grid h-8 w-8 place-items-center rounded-full bg-white text-[var(--valo-prime)] transition-opacity hover:opacity-90"
                    aria-label={tCommon('viewDetailAndChat')}
                  >
                    <CheckIcon className="h-5 w-5" />
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
