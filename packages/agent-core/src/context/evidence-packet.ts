import type { EvidenceFact, EvidenceSource } from './context-packet';

export interface EvidenceCollector {
  items: EvidenceFact[];
  add(fact: EvidenceFact): void;
  addMetric(
    id: string,
    source: EvidenceSource,
    metric: string,
    value: number | string | boolean | undefined,
    unit: string,
    dateRange: { start: string; end: string },
    derivation: string,
  ): void;
  addMissing(
    id: string,
    metric: string,
    scope: string,
    dateRange: { start: string; end: string },
    derivation: string,
  ): void;
  has(id: string): boolean;
}

export function createEvidenceCollector(): EvidenceCollector {
  const items: EvidenceFact[] = [];

  return {
    items,
    add(fact: EvidenceFact): void {
      if (!items.some((i) => i.id === fact.id)) {
        items.push(fact);
      }
    },
    addMetric(
      id: string,
      source: EvidenceSource,
      metric: string,
      value: number | string | boolean | undefined,
      unit: string,
      dateRange: { start: string; end: string },
      derivation: string,
    ): void {
      if (value === undefined) return;
      this.add({
        id,
        source,
        metric,
        value,
        unit,
        dateRange,
        derivation,
      });
    },
    addMissing(
      id: string,
      metric: string,
      scope: string,
      dateRange: { start: string; end: string },
      derivation: string,
    ): void {
      this.add({
        id,
        source: 'daily_records',
        metric,
        value: `missing (${scope})`,
        dateRange,
        derivation,
      });
    },
    has(id: string): boolean {
      return items.some((i) => i.id === id);
    },
  };
}
