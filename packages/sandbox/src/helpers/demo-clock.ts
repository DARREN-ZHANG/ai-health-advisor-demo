import type { DemoClock } from '@health-advisor/shared';

/**
 * 从 profile 配置创建初始 DemoClock
 * @param profileId - profile 标识
 * @param initialDemoTime - 初始演示时间，格式 YYYY-MM-DDTHH:mm
 * @param timezone - 时区，默认 "Asia/Shanghai"
 */
export function createDemoClock(
  profileId: string,
  initialDemoTime: string,
  timezone = 'Asia/Shanghai',
): DemoClock {
  return {
    profileId,
    timezone,
    currentTime: initialDemoTime,
  };
}

/**
 * 推进 demo 时钟 N 分钟，返回新的 clock 对象
 * @param clock - 当前的 DemoClock
 * @param minutes - 要前进的分钟数（必须为正整数）
 */
export function advanceDemoClock(clock: DemoClock, minutes: number): DemoClock {
  if (minutes < 0) {
    throw new Error(`前进分钟数不能为负数: ${minutes}`);
  }
  if (!Number.isInteger(minutes)) {
    throw new Error(`前进分钟数必须为整数: ${minutes}`);
  }

  const newTime = addMinutesToTimestamp(clock.currentTime, minutes);

  return {
    ...clock,
    currentTime: newTime,
  };
}

/**
 * 检查一个时间戳是否落在指定范围内
 * @param time - 要检查的时间，格式 YYYY-MM-DDTHH:mm
 * @param start - 范围起始时间（包含）
 * @param end - 范围结束时间（包含）
 */
export function isTimeInRange(
  time: string,
  start: string,
  end: string,
): boolean {
  return time >= start && time <= end;
}

/**
 * 给 YYYY-MM-DDTHH:mm 格式的时间戳加 N 分钟
 */
function addMinutesToTimestamp(timestamp: string, minutes: number): string {
  const date = new Date(`${timestamp.replace('T', 'T')}:00`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`无效的时间戳格式: ${timestamp}`);
  }

  date.setUTCMinutes(date.getUTCMinutes() + minutes);

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const mins = String(date.getUTCMinutes()).padStart(2, '0');

  return `${year}-${month}-${day}T${hours}:${mins}`;
}
