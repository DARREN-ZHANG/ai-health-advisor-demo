import { describe, expect, it } from 'vitest';
import { createMemoryServices } from '../../runtime/memory-services';

describe('createMemoryServices', () => {
  it('creates in-memory services by default', () => {
    const services = createMemoryServices({
      MEMORY_BACKEND: 'memory',
      MEMORY_CANDIDATE_TTL_HOURS: 24,
      DEMO_USER_SCOPE_ID: 'demo',
    });

    expect(services.userScopeId).toBe('demo');
    expect(services.candidates).toBeDefined();
    expect(services.durable).toBeDefined();
  });
});
