import type { OverrideEntry, DatedEvent } from '@health-advisor/sandbox';

export interface OverrideStoreService {
  getCurrentProfileId(): string;
  switchProfile(profileId: string): void;
  addOverride(profileId: string, entry: OverrideEntry): void;
  getActiveOverrides(profileId: string): OverrideEntry[];
  injectEvent(profileId: string, event: DatedEvent): void;
  getInjectedEvents(profileId: string): DatedEvent[];
  reset(scope: 'profile' | 'events' | 'overrides' | 'all'): void;
}

export function createOverrideStore(defaultProfileId: string): OverrideStoreService {
  let currentProfileId = defaultProfileId;
  const overridesByProfile = new Map<string, OverrideEntry[]>();
  const eventsByProfile = new Map<string, DatedEvent[]>();

  return {
    getCurrentProfileId() {
      return currentProfileId;
    },
    switchProfile(profileId: string) {
      currentProfileId = profileId;
    },
    addOverride(profileId: string, entry: OverrideEntry) {
      const existing = overridesByProfile.get(profileId) ?? [];
      overridesByProfile.set(profileId, [...existing, entry]);
    },
    getActiveOverrides(profileId: string): OverrideEntry[] {
      return [...(overridesByProfile.get(profileId) ?? [])];
    },
    injectEvent(profileId: string, event: DatedEvent) {
      const existing = eventsByProfile.get(profileId) ?? [];
      eventsByProfile.set(profileId, [...existing, event]);
    },
    getInjectedEvents(profileId: string): DatedEvent[] {
      return [...(eventsByProfile.get(profileId) ?? [])];
    },
    reset(scope) {
      switch (scope) {
        case 'profile':
          currentProfileId = defaultProfileId;
          break;
        case 'events':
          eventsByProfile.clear();
          break;
        case 'overrides':
          overridesByProfile.clear();
          break;
        case 'all':
          currentProfileId = defaultProfileId;
          overridesByProfile.clear();
          eventsByProfile.clear();
          break;
      }
    },
  };
}
