'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

/**
 * Profile 摘要。
 *
 * 与后端 `GET /profiles` 返回结构一致（参见
 * `apps/agent-api/src/modules/profiles/routes.ts` 与 sandbox
 * `listProfiles()`）。这里在 web 包内重新声明，避免 web 直接依赖
 * `@health-advisor/sandbox`；shared 包目前未导出此类型。
 */
export interface ProfileSummary {
  profileId: string;
  name: string;
  age: number;
  gender: string;
  recordCount: number;
}

/**
 * 拉取所有 Profile 摘要列表。
 *
 * - 用于 AccountSwitcherSheet（账户切换）与 MyScreen 的当前 Profile 头部。
 * - 复用 `queryKeys.profile.all`，与 `useGodModeActions.switchProfile`
 *   的 `invalidateQueries({ queryKey: profile.all })` 联动 —— 切换后自动重拉。
 * - `apiClient.get` 内部已解包 `ApiResponse.data`，这里直接拿到 `ProfileSummary[]`。
 */
export function useProfilesQuery() {
  return useQuery({
    queryKey: queryKeys.profile.all,
    queryFn: async () => {
      return apiClient.get<ProfileSummary[]>('/profiles');
    },
    staleTime: 5 * 60 * 1000,
  });
}
