import type { ActiveSensingState } from '@health-advisor/shared';
import type { ActiveSensingBanner } from '@/stores/active-sensing.store';

const EVENT_TRANSLATIONS: Record<string, string> = {
  sport_detected: '检测到运动',
  late_night_work: '您可能在熬夜工作',
  high_stress: '您当前的压力水平较高',
  poor_sleep: '您昨晚的睡眠质量欠佳',
  sedentary: '您已经久坐不动较长时间了',
  possible_alcohol_intake: '可能的饮酒摄入',
  possible_caffeine_intake: '可能的咖啡因摄入',
};

function humanizeEventType(eventType: string): string {
  if (EVENT_TRANSLATIONS[eventType]) {
    return EVENT_TRANSLATIONS[eventType];
  }

  return eventType
    .split('_')
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ');
}

function formatSensingDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(date);
  } catch {
    return dateStr;
  }
}

/** 需要用户确认的概率事件 */
const PROBABILISTIC_EVENTS = new Set(['possible_alcohol_intake', 'possible_caffeine_intake']);

function getBannerTitle(events: string[]): string {
  if (events.some((e) => PROBABILISTIC_EVENTS.has(e))) {
    return '需要确认一下';
  }
  return 'Active Sensing 已触发';
}

function getBannerContent(activeSensing: ActiveSensingState): string {
  const eventSummary = activeSensing.events.length > 0
    ? activeSensing.events.map(humanizeEventType).join(' 且 ')
    : '未知事件';
  const formattedDate = formatSensingDate(activeSensing.date);

  const hasProbabilistic = activeSensing.events.some((e) => PROBABILISTIC_EVENTS.has(e));

  if (hasProbabilistic) {
    const isAlcohol = activeSensing.events.includes('possible_alcohol_intake');
    const isCaffeine = activeSensing.events.includes('possible_caffeine_intake');

    if (isAlcohol && isCaffeine) {
      return `${formattedDate}，检测到您的心率和 HRV 出现了一些变化，这和饮酒后或摄入咖啡因后的生理反应有些相似。想确认一下，您最近有喝酒或摄入咖啡因吗？`;
    }
    if (isAlcohol) {
      return `${formattedDate}，检测到您的心率和 HRV 出现了一些变化，这和饮酒后常见的生理反应有些相似。想确认一下，您最近有摄入酒精吗？`;
    }
    return `${formattedDate}，注意到您的生理指标有些波动，模式上和我们观察到的咖啡因摄入后有点像。请问您最近有喝咖啡或其他含咖啡因的饮料吗？`;
  }

  // 运动类事件：将 "间歇运动" 展示为 "HIIT 运动"
  const displaySummary = eventSummary.replace('检测到运动', '检测到 HIIT 运动');
  return `${formattedDate} ${displaySummary}，需要我为您提供一些建议吗？`;
}

export function mapActiveSensingToBanner(activeSensing: ActiveSensingState): ActiveSensingBanner {
  return {
    id: `active-sensing:${activeSensing.date}:${activeSensing.events.join('|')}`,
    type: activeSensing.priority === 'high' ? 'alert' : 'event',
    title: getBannerTitle(activeSensing.events),
    content: getBannerContent(activeSensing),
    priority: activeSensing.priority === 'high' ? 100 : 50,
    events: activeSensing.events,
  };
}
