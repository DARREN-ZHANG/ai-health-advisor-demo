'use client';

import { Drawer, Button, Section } from '@health-advisor/ui';
import type { TimelineAppendPayload } from '@health-advisor/shared';
import { useGodModeStore } from '@/stores/god-mode.store';
import { useProfileStore } from '@/stores/profile.store';
import { useGodModeActions, useGodModeState } from '@/hooks/use-god-mode-actions';


/** 时间轴可追加的活动片段 */
const TIMELINE_SEGMENTS: { type: TimelineAppendPayload['segmentType']; label: string; icon: string; params?: Record<string, number | string | boolean> }[] = [
  { type: 'meal_intake', label: '进餐', icon: '🍽️', params: { mealContext: 'breakfast' } },
  { type: 'steady_cardio', label: '有氧', icon: '🏃', params: { durationMinutes: 30 } },
  { type: 'prolonged_sedentary', label: '久坐', icon: '🪑', params: { durationMinutes: 120 } },
  { type: 'intermittent_exercise', label: '间歇运动', icon: '🏋️', params: { rounds: 5 } },
  { type: 'walk', label: '散步', icon: '🚶', params: undefined },
  { type: 'sleep', label: '睡眠', icon: '😴', params: { durationMinutes: 480 } },
  { type: 'deep_focus', label: '专注', icon: '🧠', params: { intensity: 'high' } },
  { type: 'anxiety_episode', label: '焦虑', icon: '😰', params: { trigger: 'work' } },
  { type: 'breathing_pause', label: '呼吸暂停', icon: '🫁', params: { severity: 'moderate' } },
  { type: 'alcohol_intake', label: '饮酒', icon: '🍺', params: { amount: 'moderate' } },
  { type: 'nightmare', label: '噩梦', icon: '👻', params: { intensity: 'high' } },
  { type: 'relaxation', label: '放松', icon: '📖', params: { activity: 'reading' } },
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

  const handleClose = () => toggleOpen(false);

  const isTimelineBusy = isAppendingTimeline || isTriggeringSync || isAdvancingClock || isResettingTimeline || isInjectingEvent;

  const SPORT_SEGMENT_TYPES = new Set(['steady_cardio', 'intermittent_exercise', 'walk']);

  const handleAppendTimeline = async (segment: typeof TIMELINE_SEGMENTS[number]) => {
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
      `将以 ${today} 为演示日，重新生成 ${start} ~ ${today} 的演示数据。\n\n此操作会覆盖所有历史记录和时间轴脚本，是否继续？`
    );
    if (!confirmed) return;

    try {
      await recalibrate();
    } catch (error) {
      console.error('Failed to recalibrate:', error);
    }
  };

  return (
    <Drawer
      open={isOpen}
      onClose={handleClose}
      side="bottom"
      size="lg"
      title={<span className="font-bold flex items-center gap-2 text-yellow-500 uppercase tracking-tighter">God Mode <span className="text-[10px] bg-yellow-500 text-slate-950 px-1.5 py-0.5 rounded font-black">ADMIN</span></span>}
    >
      <div className="flex h-full min-h-0 flex-col -mx-5 -my-4 bg-slate-950/20">
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 space-y-8 pb-12">
          {/* 时间轴控制 */}
          <Section title="Timeline Control" className="space-y-4">
            {/* 状态显示 */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-900 rounded-xl p-3 text-center border border-slate-800">
                <div className="text-[10px] text-slate-500 uppercase tracking-wide">当前时间</div>
                <div className="text-sm font-mono text-cyan-400 mt-1">
                  {godModeState?.currentDemoTime?.slice(11) ?? '--:--'}
                </div>
              </div>
              <div className="bg-slate-900 rounded-xl p-3 text-center border border-slate-800">
                <div className="text-[10px] text-slate-500 uppercase tracking-wide">Pending</div>
                <div className="text-sm font-mono text-yellow-400 mt-1">
                  {godModeState?.pendingEventCount ?? 0}
                </div>
              </div>
              <div className="bg-slate-900 rounded-xl p-3 text-center border border-slate-800">
                <div className="text-[10px] text-slate-500 uppercase tracking-wide">上次同步</div>
                <div className="text-sm font-mono text-green-400 mt-1">
                  {godModeState?.lastSyncTime?.slice(11) ?? '未同步'}
                </div>
              </div>
            </div>

            {/* 时间轴操作 - 活动片段追加 */}
            <div className="grid grid-cols-2 gap-3">
              {TIMELINE_SEGMENTS.map(seg => (
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
                🔄 同步
              </Button>
              <Button variant="secondary" onClick={handleResetTimeline} disabled={isTimelineBusy}
                className="bg-slate-900 border-2 border-red-900/50 rounded-xl text-xs text-red-400">
                🗑️ 重置
              </Button>
            </div>
          </Section>

          {/* 运行时操作 */}
          <Section title="Quick Actions" className="space-y-4">
            <div className="grid grid-cols-1 gap-3">
              <Button
                variant="secondary"
                disabled={isRecalibrating}
                onClick={handleRecalibrate}
                className="w-full justify-start gap-3 text-sm py-4 bg-slate-900 border-2 border-amber-700/50 hover:border-amber-600 rounded-2xl text-amber-400"
              >
                {isRecalibrating ? '校准中...' : '📅 校准演示数据'}
              </Button>
            </div>
          </Section>

          <div className="pt-4">
            <div className="p-4 rounded-2xl bg-yellow-500/5 border-2 border-yellow-500/10 text-xs text-yellow-500/60 leading-relaxed italic text-center">
              提示：God Mode 操作会实时触发全链路数据重验证。
            </div>
          </div>
        </div>
      </div>
    </Drawer>
  );
}
