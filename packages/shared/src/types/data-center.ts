import type { DataTab, Timeframe } from './agent';
import type { DateRange } from '../utils/date-range';

export interface DataCenterTimelinePoint {
  date: string;
  values: Record<string, number | null>;
}

export interface DataCenterResponse {
  profileId: string;
  tab: DataTab;
  timeframe: Timeframe;
  range: DateRange;
  timeline: DataCenterTimelinePoint[];
  metadata: {
    recordCount: number;
    metrics: string[];
  };
}
