'use client';

import { Section } from '@health-advisor/ui';
import { useProfileStore } from '@/stores/profile.store';
import { useGodModeStore } from '@/stores/god-mode.store';
import { useGodModeActions, useGodModeState } from '@/hooks/use-god-mode-actions';
import { ProfileEditor } from '@/components/god-mode/ProfileEditor';

export function ProfileAdminSection() {
  const { isEnabled } = useGodModeStore();
  const { currentProfileId } = useProfileStore();
  const { data: godModeState } = useGodModeState();
  const { switchProfile, isSwitchingProfile } = useGodModeActions();

  if (!isEnabled) return null;

  const handleProfileSwitch = async (id: string) => {
    if (id === currentProfileId) return;
    try {
      await switchProfile(id);
    } catch (error) {
      console.error('Failed to switch profile:', error);
    }
  };

  return (
    <div className="space-y-8">
      {/* 身份切换 */}
      <Section title="Profile Switch" className="space-y-4">
        <div className="grid grid-cols-1 gap-2.5">
          {(godModeState?.availableProfiles ?? []).map((p) => (
            <button
              key={p.profileId}
              disabled={isSwitchingProfile}
              onClick={() => handleProfileSwitch(p.profileId)}
              className={`px-5 py-3 rounded-2xl text-sm font-medium text-left transition-all border-2 ${
                currentProfileId === p.profileId
                  ? 'bg-blue-600 border-blue-500 text-white shadow-xl shadow-blue-500/20'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700 hover:bg-slate-800/80'
              } ${isSwitchingProfile ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {p.name}
              {isSwitchingProfile && currentProfileId !== p.profileId && ' ...'}
            </button>
          ))}
        </div>
      </Section>

      {/* Profile 编辑器 */}
      <Section title="Profile Management" className="space-y-4">
        <ProfileEditor />
      </Section>
    </div>
  );
}
