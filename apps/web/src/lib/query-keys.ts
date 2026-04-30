export const queryKeys = {
  profile: {
    all: ['profile'] as const,
    list: () => [...queryKeys.profile.all, 'list'] as const,
    detail: (id: string) => [...queryKeys.profile.all, 'detail', id] as const,
  },
  homepage: {
    all: ['homepage'] as const,
    brief: (profileId: string) =>
      [...queryKeys.homepage.all, 'brief', profileId] as const,
  },
  dataCenter: {
    all: ['dataCenter'] as const,
    timeline: (profileId: string, tab: string, timeframe: string) =>
      [...queryKeys.dataCenter.all, 'timeline', profileId, tab, timeframe] as const,
    stress: (profileId: string, timeframe: string) =>
      [...queryKeys.dataCenter.all, 'stress', profileId, timeframe] as const,
    chartData: (profileId: string, tokens: string, timeframe: string) =>
      [...queryKeys.dataCenter.all, 'chart-data', profileId, tokens, timeframe] as const,
    chartDataByToken: (profileId: string, tokens: string, timeframe: string) =>
      [...queryKeys.dataCenter.all, 'chart-data-by-token', profileId, tokens, timeframe] as const,
    viewSummary: (profileId: string, tab: string, timeframe: string) =>
      [...queryKeys.dataCenter.all, 'viewSummary', profileId, tab, timeframe] as const,
    deviceSync: (profileId: string) =>
      [...queryKeys.dataCenter.all, 'device-sync', profileId] as const,
  },
  advisor: {
    all: ['advisor'] as const,
    chat: (sessionId: string) =>
      [...queryKeys.advisor.all, 'chat', sessionId] as const,
  },
  godMode: {
    all: ['godMode'] as const,
    state: () => [...queryKeys.godMode.all, 'state'] as const,

  },
} as const;
