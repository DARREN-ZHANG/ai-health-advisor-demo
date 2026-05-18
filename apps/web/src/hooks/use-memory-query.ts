'use client';

import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export function useConfirmMemoryCandidate(profileId: string | undefined) {
  return useMutation({
    mutationFn: async (candidateId: string) => {
      if (!profileId) throw new Error('profileId is required');
      return apiClient.post(`/memory/candidates/${candidateId}/confirm`, { profileId });
    },
  });
}

export function useRejectMemoryCandidate(profileId: string | undefined) {
  return useMutation({
    mutationFn: async (candidateId: string) => {
      if (!profileId) throw new Error('profileId is required');
      return apiClient.post(`/memory/candidates/${candidateId}/reject`, { profileId });
    },
  });
}
