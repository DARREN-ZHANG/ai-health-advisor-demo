import type { Locale } from '@health-advisor/shared';
import type { UserMemoryFact } from '../types/durable-memory';

export function renderDurableMemoryFacts(facts: UserMemoryFact[] | undefined, locale: Locale): string[] {
  if (!facts || facts.length === 0) return [];
  const heading = locale === 'zh' ? '用户已确认记忆' : 'User-confirmed memory';
  return [
    `## ${heading}`,
    ...facts.map((fact) => {
      const payload = JSON.stringify(fact.payload);
      return `- ${fact.kind}:${fact.canonicalKey} ${payload}`;
    }),
  ];
}
