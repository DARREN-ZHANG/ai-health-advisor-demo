import { describe, expect, it } from 'vitest';
import { renderDurableMemoryFacts } from '../../memory/durable-memory-context';
import type { UserMemoryFact } from '../../types/durable-memory';

const fact: UserMemoryFact = {
  id: 'fact-1',
  userScopeId: 'demo',
  profileId: 'profile-a',
  kind: 'allergy',
  canonicalKey: 'allergy:peanut',
  payload: { allergen: 'peanut', severity: 'unknown' },
  status: 'active',
  sensitivity: 'health',
  sourceCandidateId: 'cand-1',
  createdAt: 1760000000000,
  updatedAt: 1760000000000,
};

describe('renderDurableMemoryFacts', () => {
  it('renders confirmed facts as user-confirmed memory', () => {
    const lines = renderDurableMemoryFacts([fact], 'zh');
    expect(lines.join('\n')).toContain('用户已确认记忆');
    expect(lines.join('\n')).toContain('allergy:peanut');
  });

  it('renders empty facts as empty array', () => {
    const lines = renderDurableMemoryFacts([], 'zh');
    expect(lines).toEqual([]);
  });

  it('uses English heading for en locale', () => {
    const lines = renderDurableMemoryFacts([fact], 'en');
    expect(lines.join('\n')).toContain('User-confirmed memory');
  });
});
