export interface StressTimelinePoint {
  date: string;
  stressLoadScore: number;
  contributors: { hrv: number; sleep: number; activity: number };
}

export type StressTrend = 'improving' | 'stable' | 'declining';

export interface StressSummaryStats {
  average: number;
  max: number;
  min: number;
  trend: StressTrend;
}

export interface StressTimelineResponse {
  points: StressTimelinePoint[];
  summary: StressSummaryStats;
}
