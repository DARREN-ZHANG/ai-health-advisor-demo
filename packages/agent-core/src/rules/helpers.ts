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
  if (record.hrv == null) return NaN;
  return record.hrv;
}

export function computeTrend(values: number[]): number {
  if (values.length < 2) return 0;
  const n = values.length;
  const firstHalf = average(values.slice(0, Math.floor(n / 2)));
  const secondHalf = average(values.slice(Math.floor(n / 2)));
  if (firstHalf === 0) return 0;
  return (secondHalf - firstHalf) / firstHalf;
}
