/**
 * 确定性 Timeline Script 生成器核心逻辑
 * 为每个 profile 生成当前活动日的 baseline 片段
 */

interface TimelineSegment {
  segmentId: string;
  type: string;
  start: string;
  end: string;
  params: Record<string, unknown>;
  source: string;
}

export interface TimelineScript {
  profileId: string;
  scriptId: string;
  initialDemoTime: string;
  segments: TimelineSegment[];
}

interface SleepConfig {
  bedHour: number;
  bedMin: number;
  wakeHour: number;
  wakeMin: number;
}

const SLEEP_CONFIGS: Record<string, SleepConfig> = {
  'profile-a': { bedHour: 22, bedMin: 45, wakeHour: 6, wakeMin: 30 },
  'profile-b': { bedHour: 0, bedMin: 30, wakeHour: 6, wakeMin: 0 },
  'profile-c': { bedHour: 2, bedMin: 30, wakeHour: 6, wakeMin: 0 },
};

function formatTimestamp(date: string, hour: number, minute: number): string {
  return `${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/**
 * 生成指定 profile 和演示日的 timeline script
 * @param profileId - profile 标识
 * @param demoDate - 演示日日期（YYYY-MM-DD）
 * @param initialDemoTime - 完整的 initialDemoTime（YYYY-MM-DDTHH:mm）
 */
export function generateTimelineScript(
  profileId: string,
  demoDate: string,
  initialDemoTime: string,
  sleepConfigOverride?: SleepConfig,
): TimelineScript {
  const sleepConfig = sleepConfigOverride ?? SLEEP_CONFIGS[profileId];
  if (!sleepConfig) {
    throw new Error(`未找到 profile ${profileId} 的睡眠配置`);
  }

  const sleepEnd = formatTimestamp(demoDate, sleepConfig.wakeHour, sleepConfig.wakeMin);

  let sleepStartDate: string;
  if (sleepConfig.bedHour >= 12) {
    const prevDate = new Date(demoDate + 'T00:00:00');
    prevDate.setDate(prevDate.getDate() - 1);
    sleepStartDate = prevDate.toISOString().slice(0, 10);
  } else {
    sleepStartDate = demoDate;
  }
  const sleepStart = formatTimestamp(sleepStartDate, sleepConfig.bedHour, sleepConfig.bedMin);

  const startMs = new Date(sleepStart).getTime();
  const endMs = new Date(sleepEnd).getTime();
  const durationMinutes = Math.round((endMs - startMs) / 60000);

  const segments: TimelineSegment[] = [
    {
      segmentId: `seg-baseline-sleep-${profileId.split('-')[1]}`,
      type: 'sleep',
      start: sleepStart,
      end: sleepEnd,
      params: { durationMinutes },
      source: 'baseline_script',
    },
  ];

  return {
    profileId,
    scriptId: `${profileId}-day-1`,
    initialDemoTime,
    segments,
  };
}

/** 根据日均睡眠分钟数推导睡眠时间配置 */
export function deriveSleepConfig(avgSleepMinutes: number): SleepConfig {
  if (avgSleepMinutes >= 420) {
    return { bedHour: 22, bedMin: 30, wakeHour: 6, wakeMin: 0 };
  } else if (avgSleepMinutes >= 300) {
    return { bedHour: 0, bedMin: 0, wakeHour: 6, wakeMin: 0 };
  } else {
    return { bedHour: 1, bedMin: 30, wakeHour: 6, wakeMin: 0 };
  }
}
