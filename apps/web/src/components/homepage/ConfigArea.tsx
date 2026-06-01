'use client';

import { Section, Button } from '@health-advisor/ui';
import type { TimelineAppendPayload } from '@health-advisor/shared';
import { QuestionMarkCircleIcon } from '@heroicons/react/24/outline';
import { useGodModeStore } from '@/stores/god-mode.store';
import { useProfileStore } from '@/stores/profile.store';
import { useActiveSensingStore } from '@/stores/active-sensing.store';
import { useGodModeActions, useGodModeState } from '@/hooks/use-god-mode-actions';
import { ProfileEditor } from '@/components/god-mode/ProfileEditor';
import { useTranslations } from 'next-intl';

/** 时间轴可追加的活动片段 */
const TIMELINE_SEGMENT_KEYS: { type: TimelineAppendPayload['segmentType']; labelKey: string; helpKey: string; icon: string; params?: Record<string, number | string | boolean> }[] = [
  { type: 'meal_intake', labelKey: 'mealIntake', helpKey: 'mealIntake', icon: '🍽️', params: { mealContext: 'breakfast' } },
  { type: 'steady_cardio', labelKey: 'steadyCardio', helpKey: 'steadyCardio', icon: '🏃', params: { durationMinutes: 30 } },
  { type: 'prolonged_sedentary', labelKey: 'prolongedSedentary', helpKey: 'prolongedSedentary', icon: '🪑', params: { durationMinutes: 120 } },
  { type: 'intermittent_exercise', labelKey: 'intermittentExercise', helpKey: 'intermittentExercise', icon: '🏋️', params: { rounds: 5 } },
  { type: 'walk', labelKey: 'walk', helpKey: 'walk', icon: '🚶', params: undefined },
  { type: 'sleep', labelKey: 'sleep', helpKey: 'sleep', icon: '😴', params: { durationMinutes: 480 } },
  { type: 'nap', labelKey: 'nap', helpKey: 'nap', icon: '💤', params: { durationMinutes: 60 } },
  { type: 'deep_focus', labelKey: 'deepFocus', helpKey: 'deepFocus', icon: '🧠', params: { intensity: 'high' } },
  { type: 'anxiety_episode', labelKey: 'anxietyEpisode', helpKey: 'anxietyEpisode', icon: '😰', params: { trigger: 'work' } },
  { type: 'alcohol_intake', labelKey: 'alcoholIntake', helpKey: 'alcoholIntake', icon: '🍺', params: { amount: 'moderate' } },
  { type: 'caffeine_intake', labelKey: 'caffeineIntake', helpKey: 'caffeineIntake', icon: '☕', params: { dose: 'moderate', context: 'unknown' } },
  { type: 'relaxation', labelKey: 'relaxation', helpKey: 'relaxation', icon: '📖', params: { activity: 'reading' } },
  { type: 'strength_training', labelKey: 'strengthTraining', helpKey: 'strengthTraining', icon: '💪', params: { setMinutes: 1, restMinutes: 2 } },
];

/** 事件类型到图标和翻译键的映射，用于 hover tooltip 展示 */
const EVENT_TYPE_DISPLAY: Record<string, { icon: string; labelKey: string }> = {
  meal_intake: { icon: '🍽️', labelKey: 'mealIntake' },
  steady_cardio: { icon: '🏃', labelKey: 'steadyCardio' },
  prolonged_sedentary: { icon: '🪑', labelKey: 'prolongedSedentary' },
  intermittent_exercise: { icon: '🏋️', labelKey: 'intermittentExercise' },
  walk: { icon: '🚶', labelKey: 'walk' },
  sleep: { icon: '😴', labelKey: 'sleep' },
  nap: { icon: '💤', labelKey: 'nap' },
  deep_focus: { icon: '🧠', labelKey: 'deepFocus' },
  anxiety_episode: { icon: '😰', labelKey: 'anxietyEpisode' },
  alcohol_intake: { icon: '🍺', labelKey: 'alcoholIntake' },
  caffeine_intake: { icon: '☕', labelKey: 'caffeineIntake' },
  relaxation: { icon: '📖', labelKey: 'relaxation' },
  strength_training: { icon: '💪', labelKey: 'strengthTraining' },
  possible_alcohol_intake: { icon: '🍺', labelKey: 'alcoholIntake' },
  possible_caffeine_intake: { icon: '☕', labelKey: 'caffeineIntake' },
  // Micro events
  micro_deep_breathing: { icon: '🫁', labelKey: 'microDeepBreathing' },
  micro_short_walk: { icon: '🚶', labelKey: 'microShortWalk' },
  micro_post_meal_walk: { icon: '🍽️', labelKey: 'microPostMealWalk' },
  micro_post_workout_slow_walk: { icon: '🏃', labelKey: 'microPostWorkoutSlowWalk' },
  micro_standing_stretch: { icon: '🧘', labelKey: 'microStandingStretch' },
  micro_desk_mobility: { icon: '🪑', labelKey: 'microDeskMobility' },
  micro_offscreen_eye_rest: { icon: '👁️', labelKey: 'microOffscreenEyeRest' },
  micro_window_gaze_walk: { icon: '🪟', labelKey: 'microWindowGazeWalk' },
  micro_pre_workout_snack: { icon: '🍌', labelKey: 'microPreWorkoutSnack' },
  micro_post_workout_snack: { icon: '🥜', labelKey: 'microPostWorkoutSnack' },
  micro_easy_cardio: { icon: '❤️', labelKey: 'microEasyCardio' },
  micro_restorative_stretch: { icon: '🧘', labelKey: 'microRestorativeStretch' },
  micro_low_stimulus_work: { icon: '🧠', labelKey: 'microLowStimulusWork' },
  micro_sleep_wind_down: { icon: '😴', labelKey: 'microSleepWindDown' },
};

const PROBABILISTIC_SEGMENT_TYPES = new Set(['alcohol_intake', 'caffeine_intake']);

const EVENT_TYPE_MAP: Record<string, string> = {
  alcohol_intake: 'possible_alcohol_intake',
  caffeine_intake: 'possible_caffeine_intake',
};

interface ConfigAreaProps {
  className?: string;
  disabled?: boolean;
}

export function ConfigArea({ className, disabled = false }: ConfigAreaProps) {
  const { isEnabled } = useGodModeStore();

  if (!isEnabled) {
    return null;
  }

  return <ConfigAreaContent className={className} disabled={disabled} />;
}

function ConfigAreaContent({ className, disabled }: ConfigAreaProps) {
  const { currentProfileId } = useProfileStore();
  const { setPendingProbabilisticAction } = useActiveSensingStore();
  const {
    appendTimeline, isAppendingTimeline,
    injectEvent, isInjectingEvent,
    advanceClock, isAdvancingClock,
    resetTimeline, isResettingTimeline,
  } = useGodModeActions();

  const { data: godModeState } = useGodModeState();
  const t = useTranslations('godMode');
  const tSeg = useTranslations('godMode.segments');
  const tHelp = useTranslations('godMode.segmentsHelp');

  const isTimelineBusy = isAppendingTimeline || isInjectingEvent || isAdvancingClock || isResettingTimeline;
  const isConfigDisabled = isTimelineBusy || disabled;

  const handleAppendTimeline = async (segment: typeof TIMELINE_SEGMENT_KEYS[number]) => {
    try {
      if (PROBABILISTIC_SEGMENT_TYPES.has(segment.type)) {
        const eventType = EVENT_TYPE_MAP[segment.type];
        if (eventType) {
          await injectEvent({
            eventType,
            data: { source: segment.type, confidence: 0.75 },
          });
          setPendingProbabilisticAction({
            segmentType: segment.type as 'alcohol_intake' | 'caffeine_intake',
            params: segment.params ?? {},
          });
        }
      } else {
        await appendTimeline({ segmentType: segment.type, params: segment.params });
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

  const handleResetTimeline = async () => {
    try {
      await resetTimeline({ profileId: currentProfileId });
    } catch (error) {
      console.error('Failed to reset timeline:', error);
    }
  };

  const timelineSegments = TIMELINE_SEGMENT_KEYS.map((seg) => ({
    ...seg,
    label: tSeg(seg.labelKey),
    helpText: tHelp(seg.helpKey),
  }));

  return (
    <div className={`space-y-8 ${className ?? ''}`}>
      {/* Profile Switch */}
      <ProfileSwitchSection disabled={disabled} />

      {/* Profile Management */}
      <Section title="Profile Management" className="space-y-4">
        <ProfileEditor disabled={disabled} />
      </Section>

      {/* Timeline Control */}
      <Section title={t('timelineControl')} className="space-y-4">
        {/* 状态显示 */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-900 rounded-xl p-3 text-center border border-slate-800">
            <div className="text-[10px] text-slate-500 uppercase tracking-wide">{t('currentTime')}</div>
            <div className="text-sm font-mono text-cyan-400 mt-1">
              {godModeState?.currentDemoTime?.slice(11) ?? '--:--'}
            </div>
          </div>
          <div className="bg-slate-900 rounded-xl p-3 text-center border border-slate-800 group/events relative cursor-default">
            <div className="text-[10px] text-slate-500 uppercase tracking-wide">{t('eventCount')}</div>
            <div className="text-sm font-mono text-emerald-400 mt-1">
              {godModeState?.recentRecognizedEvents?.length ?? 0}
            </div>
            {/* hover 展示事件详情列表 */}
            {(godModeState?.recentRecognizedEvents?.length ?? 0) > 0 && (
              <span
                role="tooltip"
                className="absolute bottom-full right-0 mb-2 w-64 max-h-60 overflow-y-auto rounded-lg bg-slate-800 px-3 py-2 text-[11px] leading-relaxed text-slate-300 opacity-0 invisible group-hover/events:visible group-hover/events:opacity-100 transition-opacity z-50 border border-slate-700 shadow-xl text-left scrollbar-thin"
              >
                {[...(godModeState?.recentRecognizedEvents ?? [])]
                    .sort((a, b) => a.start.localeCompare(b.start))
                    .map((event) => {
                  const display = EVENT_TYPE_DISPLAY[event.type];
                  const label = display ? tSeg(display.labelKey) : event.type;
                  const icon = display?.icon ?? '📋';
                  const startTime = event.start.slice(11);
                  const endTime = event.end.slice(11);
                  return (
                    <div key={event.recognizedEventId} className="flex items-center gap-2 py-0.5">
                      <span className="shrink-0">{icon}</span>
                      <span className="flex-1 truncate">{label}</span>
                      <span className="text-slate-500 font-mono shrink-0 text-[10px]">{startTime}–{endTime}</span>
                    </div>
                  );
                })}
                <span className="absolute top-full right-4 -mt-px border-4 border-transparent border-t-slate-700" />
              </span>
            )}
          </div>
        </div>

        {/* 时间轴操作 - 活动片段追加 */}
        <div className="grid grid-cols-2 gap-3">
          {timelineSegments.map(seg => (
            <button
              key={seg.type}
              disabled={isConfigDisabled}
              onClick={() => handleAppendTimeline(seg)}
              className="flex items-center justify-between p-3 rounded-xl bg-slate-900 border-2 border-slate-800 hover:border-slate-700 text-xs text-slate-400 transition-all disabled:opacity-50"
            >
              <span className="relative flex items-center min-w-0 group/tip" onClick={e => e.stopPropagation()}>
                {seg.icon} {seg.label}
                <QuestionMarkCircleIcon className="h-3.5 w-3.5 ml-1 shrink-0 text-slate-600 group-hover/tip:text-slate-400 transition-colors" />
                <span
                  role="tooltip"
                  className="pointer-events-none absolute bottom-full -left-2 mb-2 w-56 rounded-lg bg-slate-800 px-3 py-2 text-[11px] leading-relaxed text-slate-300 opacity-0 invisible group-hover/tip:visible group-hover/tip:opacity-100 transition-opacity z-50 border border-slate-700 shadow-xl text-left"
                >
                  {seg.helpText}
                  {/* 小三角箭头 */}
                  <span className="absolute top-full left-8 -mt-px border-4 border-transparent border-t-slate-700" />
                </span>
              </span>
            </button>
          ))}
        </div>

        {/* 时钟控制 */}
        <div className="grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={() => handleAdvanceClock(60)} disabled={isConfigDisabled}
            className="bg-slate-900 border-2 border-slate-800 rounded-xl text-xs">
            ⏰ +1h
          </Button>
          <Button variant="secondary" onClick={handleResetTimeline} disabled={isConfigDisabled}
            className="bg-slate-900 border-2 border-red-900/50 rounded-xl text-xs text-red-400">
            🗑️ {t('reset')}
          </Button>
        </div>
      </Section>
    </div>
  );
}

function ProfileSwitchSection({ disabled = false }: { disabled?: boolean }) {
  const { currentProfileId } = useProfileStore();
  const { data: godModeState } = useGodModeState();
  const { switchProfile, isSwitchingProfile } = useGodModeActions();

  const handleProfileSwitch = async (id: string) => {
    if (id === currentProfileId) return;
    try {
      await switchProfile(id);
    } catch (error) {
      console.error('Failed to switch profile:', error);
    }
  };

  return (
    <Section title="Profile Switch" className="space-y-4">
      <div className="grid grid-cols-1 gap-2.5">
        {(godModeState?.availableProfiles ?? []).map((p) => (
          <button
            key={p.profileId}
            disabled={isSwitchingProfile || disabled}
            onClick={() => handleProfileSwitch(p.profileId)}
            className={`px-5 py-3 rounded-2xl text-sm font-medium text-left transition-all border-2 ${
              currentProfileId === p.profileId
                ? 'bg-blue-600 border-blue-500 text-white shadow-xl shadow-blue-500/20'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700 hover:bg-slate-800/80'
            } ${isSwitchingProfile || disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {p.name}
            {isSwitchingProfile && currentProfileId !== p.profileId && ' ...'}
          </button>
        ))}
      </div>
    </Section>
  );
}
