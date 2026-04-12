'use client';

import { Drawer, Button, Section } from '@health-advisor/ui';
import { useGodModeStore } from '@/stores/god-mode.store';
import { useProfileStore } from '@/stores/profile.store';

export function GodModePanel() {
  const { isEnabled, isOpen, toggleOpen, activeScenarioId, setScenarioId } = useGodModeStore();
  const { currentProfileId, setProfileId } = useProfileStore();

  if (!isEnabled) return null;

  const handleClose = () => toggleOpen(false);

  // TODO: Wave 6.2 联通后端 GET /god-mode/state 或 scenario manifests 获取真实 scenario 列表
  const scenarios = [
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
      <div className="flex flex-col h-full gap-6">
        {/* 身份切换 */}
        <Section title="Profile Switch" className="space-y-3">
          <div className="grid grid-cols-1 gap-2">
            {['profile-a', 'profile-b', 'profile-c'].map((id) => (
              <button
                key={id}
                onClick={() => setProfileId(id)}
                className={`px-4 py-2 rounded-lg text-sm text-left transition-all border ${
                  currentProfileId === id
                    ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-500/20'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500'
                }`}
              >
                {id === 'profile-a' ? '👨‍💻 用户 A (平衡型)' : id === 'profile-b' ? '🏃 用户 B (运动型)' : '🧘 用户 C (静息型)'}
              </button>
            ))}
          </div>
        </Section>

        {/* 场景模拟 */}
        <Section title="Scenario Scents" className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {scenarios.map((s) => (
              <button
                key={s.id}
                onClick={() => setScenarioId(s.id)}
                className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition-all ${
                  activeScenarioId === s.id
                    ? 'bg-yellow-500/10 border-yellow-500 text-yellow-500 shadow-lg shadow-yellow-500/10'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600'
                }`}
              >
                <span className="text-xl">{s.icon}</span>
                <span className="text-[10px] font-bold">{s.label}</span>
              </button>
            ))}
          </div>
        </Section>

        {/* 运行时操作 */}
        {/* TODO: Wave 6.2 联通后端 God-Mode API，绑定真实 handler */}
        <Section title="Runtime Actions" className="space-y-3">
          <div className="space-y-2">
            <Button
              variant="secondary"
              disabled
              className="w-full justify-start gap-2 text-xs py-2 bg-slate-800 border-slate-700"
            >
              ⚡ 注入即时运动事件
            </Button>
            <Button
              variant="secondary"
              disabled
              className="w-full justify-start gap-2 text-xs py-2 bg-slate-800 border-slate-700"
            >
              🔴 模拟睡眠缺失
            </Button>
            <Button
              variant="secondary"
              disabled
              className="w-full justify-start gap-2 text-xs py-2 bg-slate-800 border-slate-700"
            >
              🧪 重置所有 Overrides
            </Button>
          </div>
          <p className="text-[10px] text-slate-500 leading-relaxed">
            Wave 6.2 才会接入正式 God-Mode API；当前阶段仅提供面板壳与状态展示，不暴露可点击的空动作。
          </p>
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
