import { listProfiles as sandboxListProfiles } from '@health-advisor/sandbox';
import type { ProfileSummary } from '@health-advisor/sandbox';
import type { ProfileData } from '@health-advisor/shared';
import type { RuntimeRegistry } from '../../runtime/registry.js';

export class ProfileService {
  constructor(private registry: RuntimeRegistry) {}

  listProfiles(): ProfileSummary[] {
    return sandboxListProfiles(this.registry.profiles);
  }

  getProfile(profileId: string): ProfileData {
    return this.registry.getProfile(profileId);
  }
}
