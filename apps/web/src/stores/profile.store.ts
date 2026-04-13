import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SandboxProfile } from '@health-advisor/shared';
import { useAIAdvisorStore } from './ai-advisor.store';

function resetProfileScopedUiState() {
  // 只清除 UI 消息，不清除 sessionId（sessionId 由后端管理，可跨 profile 续用）
  useAIAdvisorStore.getState().clearMessages();
}

interface ProfileState {
  currentProfileId: string;
  currentProfile: SandboxProfile | null;
  setProfileId: (id: string) => void;
  setProfile: (profile: SandboxProfile | null) => void;
  resetProfileScopedUiState: () => void;
}

export const useProfileStore = create<ProfileState>()(
  persist(
    (set) => ({
      currentProfileId: 'profile-a', // Default to profile-a
      currentProfile: null,
      setProfileId: (id) =>
        set((state) => {
          if (state.currentProfileId === id) {
            return state;
          }

          resetProfileScopedUiState();
          return {
            currentProfileId: id,
            currentProfile: null,
          };
        }),
      setProfile: (profile) => set({ currentProfile: profile }),
      resetProfileScopedUiState,
    }),
    {
      name: 'profile-storage',
      partialize: (state) => ({ currentProfileId: state.currentProfileId }),
    }
  )
);
