'use client';

import { Section, Button } from '@health-advisor/ui';
import type { TimelineAppendPayload } from '@health-advisor/shared';
import { useGodModeStore } from '@/stores/god-mode.store';
import { useProfileStore } from '@/stores/profile.store';
import { useActiveSensingStore } from '@/stores/active-sensing.store';
import { useGodModeActions, useGodModeState } from '@/hooks/use-god-mode-actions';
import { ProfileEditor } from '@/components/god-mode/ProfileEditor';
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
  { type: 'caffeine_intake', labelKey: 'caffeineIntake', icon: '☕', params: { dose: 'moderate', context: 'unknown' } },
  { type: 'nightmare', labelKey: 'nightmare', icon: '👻', params: { intensity: 'high' } },
  { type: 'relaxation', labelKey: 'relaxation', icon: '📖', params: { activity: 'reading' } },
];

const PROBABILISTIC_SEGMENT_TYPES = new Set(['alcohol_intake', 'caffeine_intake']);

const EVENT_TYPE_MAP: Record<string, string> = {
  alcohol_intake: 'possible_alcohol_intake',
  caffeine_intake: 'possible_caffeine_intake',
};

/** 从 segment params 中提取并格式化用时指标 */
function formatDuration(params?: Record<string, number | string | boolean>): string | null {
  if (!params) return null;
  if (typeof params.durationMinutes === 'number') {
    const mins = params.durationMinutes;
    if (mins >= 60 && mins % 60 === 0) {
      return `(+${mins / 60}h)`;
    }
    return `(+${mins}min)`;
  }
  if (typeof params.rounds === 'number') {
    return `(+${params.rounds} rounds)`;
  }
  return null;
}

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
    triggerSync, isTriggeringSync,
    advanceClock, isAdvancingClock,
    resetTimeline, isResettingTimeline,
  } = useGodModeActions();

  const { data: godModeState } = useGodModeState();
  const t = useTranslations('godMode');
  const tSeg = useTranslations('godMode.segments');

  const isTimelineBusy = isAppendingTimeline || isInjectingEvent || isTriggeringSync || isAdvancingClock || isResettingTimeline;
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

  const timelineSegments = TIMELINE_SEGMENT_KEYS.map((seg) => ({
    ...seg,
    label: tSeg(seg.labelKey),
    durationLabel: formatDuration(seg.params),
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
              disabled={isConfigDisabled}
              onClick={() => handleAppendTimeline(seg)}
              className="flex items-center justify-between p-3 rounded-xl bg-slate-900 border-2 border-slate-800 hover:border-slate-700 text-xs text-slate-400 transition-all disabled:opacity-50"
            >
              <span>{seg.icon} {seg.label}</span>
              {seg.durationLabel && (
                <span className="text-[10px] text-slate-600">{seg.durationLabel}</span>
              )}
            </button>
          ))}
        </div>

        {/* 时钟控制 */}
        <div className="grid grid-cols-3 gap-3">
          <Button variant="secondary" onClick={() => handleAdvanceClock(60)} disabled={isConfigDisabled}
            className="bg-slate-900 border-2 border-slate-800 rounded-xl text-xs">
            ⏰ +1h
          </Button>
          <Button variant="secondary" onClick={handleTriggerSync} disabled={isConfigDisabled}
            className="bg-slate-900 border-2 border-slate-800 rounded-xl text-xs">
            🔄 {t('sync')}
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
