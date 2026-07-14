import type { ProfileSummary } from '@health-advisor/sandbox';
import type { ProfileData } from '@health-advisor/shared';
import type { RuntimeRegistry } from '../../runtime/registry.js';

export class ProfileService {
  constructor(private registry: RuntimeRegistry) {}

  listProfiles(sessionId: string): ProfileSummary[] {
    return sandboxListProfiles(this.registry.getSessionSandbox(sessionId).profiles);
  }

  getProfile(profileId: string, sessionId: string): ProfileData {
    return this.registry.getProfile(profileId, sessionId);
  }
}
import { listProfiles as sandboxListProfiles } from '@health-advisor/sandbox';
