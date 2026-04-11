import type { DailyRecord } from '@health-advisor/shared';
import type { AgentContext } from '../types/agent-context';

export function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function getRecords(ctx: AgentContext): DailyRecord[] {
  return ctx.dataWindow.records as DailyRecord[];
}

export function computeHrv(record: DailyRecord): number {
  if (!record.hr || record.hr.length < 2) return NaN;
  const values = record.hr;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export function computeTrend(values: number[]): number {
  if (values.length < 2) return 0;
  const n = values.length;
  const firstHalf = average(values.slice(0, Math.floor(n / 2)));
  const secondHalf = average(values.slice(Math.floor(n / 2)));
  if (firstHalf === 0) return 0;
  return (secondHalf - firstHalf) / firstHalf;
}
