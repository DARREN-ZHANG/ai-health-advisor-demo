import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SandboxProfile } from '@health-advisor/shared';

interface ProfileState {
  currentProfileId: string;
  currentProfile: SandboxProfile | null;
  setProfileId: (id: string) => void;
  setProfile: (profile: SandboxProfile | null) => void;
}

export const useProfileStore = create<ProfileState>()(
  persist(
    (set) => ({
      currentProfileId: 'profile-a', // Default to profile-a
      currentProfile: null,
      setProfileId: (id) => set({ currentProfileId: id }),
      setProfile: (profile) => set({ currentProfile: profile }),
    }),
    {
      name: 'profile-storage',
      partialize: (state) => ({ currentProfileId: state.currentProfileId }),
    }
  )
);
