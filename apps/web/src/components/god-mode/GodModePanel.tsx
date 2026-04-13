'use client';

import { Drawer, Button, Section, Skeleton } from '@health-advisor/ui';
import { useGodModeStore } from '@/stores/god-mode.store';
import { useProfileStore } from '@/stores/profile.store';
import { useGodModeActions, useGodModeState } from '@/hooks/use-god-mode-actions';

export function GodModePanel() {
  const { isEnabled, isOpen, toggleOpen, activeScenarioId, setScenarioId } = useGodModeStore();
  const { currentProfileId } = useProfileStore();
  const { 
    switchProfile, isSwitchingProfile, 
    injectEvent, isInjectingEvent, 
    overrideMetric, isOverridingMetric,
    reset, isResetting,
    runDemoScript, isRunningDemoScript
  } = useGodModeActions();

  const { data: godModeState, isLoading: isLoadingState } = useGodModeState();

  if (!isEnabled) return null;

  const handleClose = () => toggleOpen(false);

  const handleProfileSwitch = async (id: string) => {
    if (id === currentProfileId) return;
    try {
      await switchProfile(id);
    } catch (error) {
      console.error('Failed to switch profile:', error);
    }
  };

  const handleScenarioRun = async (id: string) => {
    setScenarioId(id);
    try {
      await runDemoScript(id);
    } catch (error) {
      console.error('Failed to run scenario:', error);
    }
  };

  const handleInjectSportEvent = async () => {
    try {
      await injectEvent({
        eventType: 'sport_detected',
        data: {
          type: 'Running',
          durationMinutes: 45,
          intensity: 'high',
          calories: 450,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Failed to inject event:', error);
    }
  };

  const handleSimulateLowHRV = async () => {
    try {
      await overrideMetric({
        metric: 'hrv',
        value: 20, // 非常低的 HRV
        dateRange: {
          start: new Date().toISOString().slice(0, 10),
          end: new Date().toISOString().slice(0, 10),
        },
      });
    } catch (error) {
      console.error('Failed to override metric:', error);
    }
  };

  const handleSimulateInsomnia = async () => {
    try {
      await injectEvent({
        eventType: 'insomnia_detected',
        data: {
          durationMinutes: 120,
          latencyMinutes: 60,
          quality: 2,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Failed to simulate insomnia:', error);
    }
  };

  const handleReset = async () => {
    try {
      await reset({ scope: 'all' });
      setScenarioId(null);
    } catch (error) {
      console.error('Failed to reset:', error);
    }
  };

  const scenarios = godModeState?.availableScenarios || [
    { id: 'normal', label: '常规健康态', icon: '✅' },
    { id: 'stress', label: '高压打工人', icon: '😫' },
    { id: 'recovery', label: '运动康复期', icon: '🏃' },
    { id: 'insomnia', label: '深夜失眠党', icon: '🦉' },
  ];

  return (
    <Drawer
      open={isOpen}
      onClose={handleClose}
      side="left"
      title={<span className="font-bold flex items-center gap-2 text-yellow-500">GOD MODE <span className="text-[10px] bg-yellow-500 text-slate-900 px-1.5 py-0.5 rounded uppercase">ADMIN</span></span>}
      className="w-[320px]"
    >
      <div className="flex flex-col h-full gap-6 overflow-y-auto no-scrollbar pb-6">
        {/* 身份切换 */}
        <Section title="Profile Switch" className="space-y-3">
          <div className="grid grid-cols-1 gap-2">
            {['profile-a', 'profile-b', 'profile-c'].map((id) => (
              <button
                key={id}
                disabled={isSwitchingProfile || isRunningDemoScript}
                onClick={() => handleProfileSwitch(id)}
                className={`px-4 py-2 rounded-lg text-sm text-left transition-all border ${
                  currentProfileId === id
                    ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-500/20'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500 hover:bg-slate-700/50'
                } ${isSwitchingProfile || isRunningDemoScript ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {id === 'profile-a' ? '👨‍💻 用户 A (平衡型)' : id === 'profile-b' ? '🏃 用户 B (运动型)' : '🧘 用户 C (静息型)'}
                {isSwitchingProfile && currentProfileId !== id && ' ...'}
              </button>
            ))}
          </div>
        </Section>

        {/* 场景模拟 */}
        <Section title="Scenario Scents" className="space-y-3">
          {isLoadingState ? (
            <div className="grid grid-cols-2 gap-2">
              {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-16 rounded-xl bg-slate-800" />)}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {scenarios.map((s) => (
                <button
                  key={s.id}
                  disabled={isRunningDemoScript}
                  onClick={() => handleScenarioRun(s.id)}
                  className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition-all ${
                    activeScenarioId === s.id
                      ? 'bg-yellow-500/10 border-yellow-500 text-yellow-500 shadow-lg shadow-yellow-500/10'
                      : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600 hover:bg-slate-700/50'
                  } ${isRunningDemoScript ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <span className="text-xl">{s.icon || '🎭'}</span>
                  <span className="text-[10px] font-bold text-center leading-tight">{s.label}</span>
                  {isRunningDemoScript && activeScenarioId === s.id && <span className="text-[8px] animate-pulse">Running...</span>}
                </button>
              ))}
            </div>
          )}
        </Section>

        {/* 运行时操作 */}
        <Section title="Runtime Actions" className="space-y-3">
          <div className="space-y-2">
            <Button
              variant="secondary"
              loading={isInjectingEvent}
              disabled={isRunningDemoScript}
              onClick={handleInjectSportEvent}
              className="w-full justify-start gap-2 text-xs py-2 bg-slate-800 border-slate-700 hover:bg-slate-700"
            >
              ⚡ 注入即时运动事件
            </Button>
            <Button
              variant="secondary"
              loading={isOverridingMetric}
              disabled={isRunningDemoScript}
              onClick={handleSimulateLowHRV}
              className="w-full justify-start gap-2 text-xs py-2 bg-slate-800 border-slate-700 hover:bg-slate-700"
            >
              📉 模拟极低 HRV 状态
            </Button>
            <Button
              variant="secondary"
              loading={isInjectingEvent}
              disabled={isRunningDemoScript}
              onClick={handleSimulateInsomnia}
              className="w-full justify-start gap-2 text-xs py-2 bg-slate-800 border-slate-700 hover:bg-slate-700"
            >
              🔴 模拟睡眠缺失
            </Button>
            <Button
              variant="secondary"
              loading={isResetting}
              disabled={isRunningDemoScript}
              onClick={handleReset}
              className="w-full justify-start gap-2 text-xs py-2 bg-slate-800 border-slate-700 hover:bg-slate-700"
            >
              🧪 重置所有 Overrides
            </Button>
          </div>
        </Section>

        <div className="mt-auto pt-6 border-t border-slate-800">
          <div className="p-3 rounded-lg bg-yellow-500/5 border border-yellow-500/10 text-[10px] text-yellow-500/60 leading-relaxed italic">
            提示：God-Mode 操作会实时触发全链路 Data Re-validation，不推荐在正式生产环境下开启。
          </div>
        </div>
      </div>
    </Drawer>
  );
}
