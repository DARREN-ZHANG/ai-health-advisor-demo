'use client';

import { Drawer, Button, Section } from '@health-advisor/ui';
import type { TimelineAppendPayload } from '@health-advisor/shared';
import { useGodModeStore } from '@/stores/god-mode.store';
import { useProfileStore } from '@/stores/profile.store';
import { useGodModeActions, useGodModeState } from '@/hooks/use-god-mode-actions';
import { useTranslations } from 'next-intl';

/** 时间轴可追加的活动片段 */
const TIMELINE_SEGMENT_KEYS: { type: TimelineAppendPayload['segmentType']; labelKey: string; icon: string; params?: Record<string, number | string | boolean> }[] = [
  { type: 'meal_intake', labelKey: 'mealIntake', icon: '🍽️', params: { mealContext: 'breakfast' } },
  { type: 'steady_cardio', labelKey: 'steadyCardio', icon: '🏃', params: { durationMinutes: 30 } },
  { type: 'prolonged_sedentary', labelKey: 'prolongedSedentary', icon: '🪑', params: { durationMinutes: 120 } },
  { type: 'intermittent_exercise', labelKey: 'intermittentExercise', icon: '🏋️', params: { rounds: 5 } },
  { type: 'walk', labelKey: 'walk', icon: '🚶', params: undefined },
  { type: 'sleep', labelKey: 'sleep', icon: '😴', params: { durationMinutes: 480 } },
  { type: 'deep_focus', labelKey: 'deepFocus', icon: '🧠', params: { intensity: 'high' } },
  { type: 'anxiety_episode', labelKey: 'anxietyEpisode', icon: '😰', params: { trigger: 'work' } },
  { type: 'breathing_pause', labelKey: 'breathingPause', icon: '🫁', params: { severity: 'moderate' } },
  { type: 'alcohol_intake', labelKey: 'alcoholIntake', icon: '🍺', params: { amount: 'moderate' } },
  { type: 'caffeine_intake', labelKey: 'caffeineIntake', icon: '☕', params: { dose: 'moderate' } },
  { type: 'nightmare', labelKey: 'nightmare', icon: '👻', params: { intensity: 'high' } },
  { type: 'relaxation', labelKey: 'relaxation', icon: '📖', params: { activity: 'reading' } },
];

export function GodModePanel() {
  const { isEnabled } = useGodModeStore();

  if (!isEnabled) {
    return null;
  }

  return <GodModePanelContent />;
}

function GodModePanelContent() {
  const { isOpen, toggleOpen } = useGodModeStore();
  const { currentProfileId } = useProfileStore();
  const {
    injectEvent, isInjectingEvent,
    appendTimeline, isAppendingTimeline,
    triggerSync, isTriggeringSync,
    advanceClock, isAdvancingClock,
    resetTimeline, isResettingTimeline,
    recalibrate, isRecalibrating,
  } = useGodModeActions();

  const { data: godModeState } = useGodModeState();
  const t = useTranslations('godMode');
  const tSeg = useTranslations('godMode.segments');

  const handleClose = () => toggleOpen(false);

  const isTimelineBusy = isAppendingTimeline || isTriggeringSync || isAdvancingClock || isResettingTimeline || isInjectingEvent;

  const SPORT_SEGMENT_TYPES = new Set(['steady_cardio', 'intermittent_exercise', 'walk']);

  const handleAppendTimeline = async (segment: typeof TIMELINE_SEGMENT_KEYS[number]) => {
    try {
      await appendTimeline({ segmentType: segment.type, params: segment.params });

      // 运动类片段追加后，同时注入即时运动事件以触发 Active Sensing Banner
      if (SPORT_SEGMENT_TYPES.has(segment.type)) {
        const sportTypeMap: Record<string, string> = {
          steady_cardio: 'Running',
          intermittent_exercise: 'IntervalTraining',
          walk: 'Walking',
        };
        await injectEvent({
          eventType: 'sport_detected',
          data: {
            type: sportTypeMap[segment.type],
            durationMinutes: segment.params?.durationMinutes ?? 30,
            intensity: 'medium',
            calories: 300,
          },
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error('Failed to append timeline segment:', error);
    }
  };

  const handleAdvanceClock = async (minutes: number) => {
    try {
      await advanceClock(minutes);
    } catch (error) {
      console.error('Failed to advance clock:', error);
    }
  };

  const handleTriggerSync = async () => {
    try {
      await triggerSync('manual_refresh');
    } catch (error) {
      console.error('Failed to trigger sync:', error);
    }
  };

  const handleResetTimeline = async () => {
    try {
      await resetTimeline({ profileId: currentProfileId });
    } catch (error) {
      console.error('Failed to reset timeline:', error);
    }
  };

  const handleRecalibrate = async () => {
    const today = new Date().toISOString().slice(0, 10);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    const start = startDate.toISOString().slice(0, 10);
    const confirmed = window.confirm(
      t('calibrateConfirm', { today, start })
    );
    if (!confirmed) return;

    try {
      await recalibrate();
    } catch (error) {
      console.error('Failed to recalibrate:', error);
    }
  };

  const timelineSegments = TIMELINE_SEGMENT_KEYS.map((seg) => ({
    ...seg,
    label: tSeg(seg.labelKey),
  }));

  return (
    <Drawer
      open={isOpen}
      onClose={handleClose}
      side="bottom"
      size="lg"
      title={<span className="font-bold flex items-center gap-2 text-yellow-500 uppercase tracking-tighter">{t('title')} <span className="text-[10px] bg-yellow-500 text-slate-950 px-1.5 py-0.5 rounded font-black">{t('admin')}</span></span>}
    >
      <div className="flex h-full min-h-0 flex-col -mx-5 -my-4 bg-slate-950/20">
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 space-y-8 pb-12">
          {/* 时间轴控制 */}
          <Section title={t('timelineControl')} className="space-y-4">
            {/* 状态显示 */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-900 rounded-xl p-3 text-center border border-slate-800">
                <div className="text-[10px] text-slate-500 uppercase tracking-wide">{t('currentTime')}</div>
                <div className="text-sm font-mono text-cyan-400 mt-1">
                  {godModeState?.currentDemoTime?.slice(11) ?? '--:--'}
                </div>
              </div>
              <div className="bg-slate-900 rounded-xl p-3 text-center border border-slate-800">
                <div className="text-[10px] text-slate-500 uppercase tracking-wide">{t('pending')}</div>
                <div className="text-sm font-mono text-yellow-400 mt-1">
                  {godModeState?.pendingEventCount ?? 0}
                </div>
              </div>
              <div className="bg-slate-900 rounded-xl p-3 text-center border border-slate-800">
                <div className="text-[10px] text-slate-500 uppercase tracking-wide">{t('lastSync')}</div>
                <div className="text-sm font-mono text-green-400 mt-1">
                  {godModeState?.lastSyncTime?.slice(11) ?? t('neverSynced')}
                </div>
              </div>
            </div>

            {/* 时间轴操作 - 活动片段追加 */}
            <div className="grid grid-cols-2 gap-3">
              {timelineSegments.map(seg => (
                <button
                  key={seg.type}
                  disabled={isTimelineBusy}
                  onClick={() => handleAppendTimeline(seg)}
                  className="p-3 rounded-xl bg-slate-900 border-2 border-slate-800 hover:border-slate-700 text-xs text-slate-400 transition-all disabled:opacity-50"
                >
                  {seg.icon} {seg.label}
                </button>
              ))}
            </div>

            {/* 时钟控制 */}
            <div className="grid grid-cols-3 gap-3">
              <Button variant="secondary" onClick={() => handleAdvanceClock(60)} disabled={isTimelineBusy}
                className="bg-slate-900 border-2 border-slate-800 rounded-xl text-xs">
                ⏰ +1h
              </Button>
              <Button variant="secondary" onClick={handleTriggerSync} disabled={isTimelineBusy}
                className="bg-slate-900 border-2 border-slate-800 rounded-xl text-xs">
                🔄 {t('sync')}
              </Button>
              <Button variant="secondary" onClick={handleResetTimeline} disabled={isTimelineBusy}
                className="bg-slate-900 border-2 border-red-900/50 rounded-xl text-xs text-red-400">
                🗑️ {t('reset')}
              </Button>
            </div>
          </Section>

          {/* 运行时操作 */}
          <Section title={t('quickActions')} className="space-y-4">
            <div className="grid grid-cols-1 gap-3">
              <Button
                variant="secondary"
                disabled={isRecalibrating}
                onClick={handleRecalibrate}
                className="w-full justify-start gap-3 text-sm py-4 bg-slate-900 border-2 border-amber-700/50 hover:border-amber-600 rounded-2xl text-amber-400"
              >
                {isRecalibrating ? t('calibrating') : `📅 ${t('calibrateData')}`}
              </Button>
            </div>
          </Section>

          <div className="pt-4">
            <div className="p-4 rounded-2xl bg-yellow-500/5 border-2 border-yellow-500/10 text-xs text-yellow-500/60 leading-relaxed italic text-center">
              {t('hint')}
            </div>
          </div>
        </div>
      </div>
    </Drawer>
  );
}
