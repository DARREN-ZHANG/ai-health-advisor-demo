'use client';

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ProfileData } from '@health-advisor/shared';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useProfileStore } from '@/stores/profile.store';

export function ProfileBootstrap() {
  const currentProfileId = useProfileStore((state) => state.currentProfileId);
  const setProfile = useProfileStore((state) => state.setProfile);

  const profileQuery = useQuery({
    queryKey: queryKeys.profile.detail(currentProfileId),
    queryFn: async () => {
      const profileData = await apiClient.get<ProfileData>(`/profiles/${currentProfileId}`);
      return profileData.profile;
    },
    enabled: currentProfileId.length > 0,
  });

  useEffect(() => {
    if (profileQuery.data) {
      setProfile(profileQuery.data);
    }
  }, [profileQuery.data, setProfile]);

  useEffect(() => {
    if (profileQuery.isError) {
      setProfile(null);
    }
  }, [profileQuery.isError, setProfile]);

  return null;
}
