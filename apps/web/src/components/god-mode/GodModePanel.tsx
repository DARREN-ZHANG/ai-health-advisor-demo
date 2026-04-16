'use client';

import { Drawer, Button, Section, Skeleton } from '@health-advisor/ui';
import type { ScenarioEntry } from '@health-advisor/shared';
import { getScenarioIcon } from '@/lib/god-mode';
import { useGodModeStore } from '@/stores/god-mode.store';
import { useProfileStore } from '@/stores/profile.store';
import { useGodModeActions, useGodModeState } from '@/hooks/use-god-mode-actions';

export function GodModePanel() {
  const { isEnabled } = useGodModeStore();

  if (!isEnabled) {
    return null;
  }

  return <GodModePanelContent />;
}

function GodModePanelContent() {
  const { isOpen, toggleOpen, activeScenarioId, setScenarioId } = useGodModeStore();
  const { currentProfileId } = useProfileStore();
  const { 
    switchProfile, isSwitchingProfile, 
    injectEvent, isInjectingEvent, 
    overrideMetric, isOverridingMetric,
    reset, isResetting,
    applyScenario, isApplyingScenario,
    runDemoScript, isRunningDemoScript
  } = useGodModeActions();

  const { data: godModeState, isLoading: isLoadingState } = useGodModeState();

  const handleClose = () => toggleOpen(false);

  const handleProfileSwitch = async (id: string) => {
    if (id === currentProfileId) return;
    try {
      await switchProfile(id);
    } catch (error) {
      console.error('Failed to switch profile:', error);
    }
  };

  const isRunningScenario = isApplyingScenario || isRunningDemoScript;

  const handleScenarioRun = async (scenario: ScenarioEntry) => {
    setScenarioId(scenario.scenarioId);
    try {
      if (scenario.type === 'demo_script') {
        await runDemoScript(scenario.scenarioId);
        return;
      }

      await applyScenario(scenario.scenarioId);
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

  const scenarios = godModeState?.availableScenarios ?? [];

  return (
    <Drawer
      open={isOpen}
      onClose={handleClose}
      side="bottom"
      size="lg"
      title={<span className="font-bold flex items-center gap-2 text-yellow-500 uppercase tracking-tighter">God Mode <span className="text-[10px] bg-yellow-500 text-slate-950 px-1.5 py-0.5 rounded font-black">ADMIN</span></span>}
    >
      <div className="flex flex-col h-full -mx-5 -my-4 bg-slate-950/20">
        <div className="flex-1 overflow-y-auto no-scrollbar px-5 py-6 space-y-8 pb-12">
          {/* 身份切换 */}
          <Section title="Profile Switch" className="space-y-4">
            <div className="grid grid-cols-1 gap-2.5">
              {['profile-a', 'profile-b', 'profile-c'].map((id) => (
                <button
                  key={id}
                  disabled={isSwitchingProfile || isRunningScenario}
                  onClick={() => handleProfileSwitch(id)}
                  className={`px-5 py-3 rounded-2xl text-sm font-medium text-left transition-all border-2 ${
                    currentProfileId === id
                      ? 'bg-blue-600 border-blue-500 text-white shadow-xl shadow-blue-500/20'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700 hover:bg-slate-800/80'
                  } ${isSwitchingProfile || isRunningScenario ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {id === 'profile-a' ? '👨‍💻 用户 A (平衡型)' : id === 'profile-b' ? '🏃 用户 B (运动型)' : '🧘 用户 C (静息型)'}
                  {isSwitchingProfile && currentProfileId !== id && ' ...'}
                </button>
              ))}
            </div>
          </Section>

          {/* 场景模拟 */}
          <Section title="Scenario Simulation" className="space-y-4">
            {isLoadingState ? (
              <div className="grid grid-cols-2 gap-3">
                {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-20 rounded-2xl bg-slate-900" />)}
              </div>
            ) : scenarios.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-slate-800 px-4 py-8 text-center text-xs text-slate-500">
                当前没有可用的预置场景。
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {scenarios.map((s) => (
                  <button
                    key={s.scenarioId}
                    disabled={isRunningScenario}
                    onClick={() => handleScenarioRun(s)}
                    className={`p-4 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all ${
                      activeScenarioId === s.scenarioId
                        ? 'bg-yellow-500/10 border-yellow-500 text-yellow-500 shadow-xl shadow-yellow-500/10'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700 hover:bg-slate-800/80'
                    } ${isRunningScenario ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <span className="text-2xl">{getScenarioIcon(s.type)}</span>
                    <span className="text-[11px] font-bold text-center leading-tight uppercase tracking-wide">{s.label}</span>
                    {isRunningScenario && activeScenarioId === s.scenarioId && <span className="text-[8px] animate-pulse font-black">RUNNING</span>}
                  </button>
                ))}
              </div>
            )}
          </Section>

          {/* 运行时操作 */}
          <Section title="Quick Actions" className="space-y-4">
            <div className="grid grid-cols-1 gap-3">
              <Button
                variant="secondary"
                disabled={isRunningScenario}
                onClick={handleInjectSportEvent}
                className="w-full justify-start gap-3 text-sm py-4 bg-slate-900 border-2 border-slate-800 hover:border-slate-700 rounded-2xl"
              >
                {isInjectingEvent ? '处理中...' : '⚡ 注入即时运动事件'}
              </Button>
              <Button
                variant="secondary"
                disabled={isRunningScenario}
                onClick={handleSimulateLowHRV}
                className="w-full justify-start gap-3 text-sm py-4 bg-slate-900 border-2 border-slate-800 hover:border-slate-700 rounded-2xl"
              >
                {isOverridingMetric ? '处理中...' : '📉 模拟极低 HRV 状态'}
              </Button>
              <Button
                variant="secondary"
                disabled={isRunningScenario}
                onClick={handleSimulateInsomnia}
                className="w-full justify-start gap-3 text-sm py-4 bg-slate-900 border-2 border-slate-800 hover:border-slate-700 rounded-2xl"
              >
                {isInjectingEvent ? '处理中...' : '🔴 模拟睡眠缺失'}
              </Button>
              <Button
                variant="secondary"
                disabled={isRunningScenario}
                onClick={handleReset}
                className="w-full justify-start gap-3 text-sm py-4 bg-slate-900 border-2 border-slate-800 hover:border-slate-700 rounded-2xl"
              >
                {isResetting ? '处理中...' : '🧪 重置所有 Overrides'}
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
