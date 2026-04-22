import type { ActiveSensingState, ScenarioType } from '@health-advisor/shared';
import type { ActiveSensingBanner } from '@/stores/active-sensing.store';

const SCENARIO_ICONS: Record<ScenarioType, string> = {
  profile_switch: '👤',
  event_inject: '⚡',
  metric_override: '📉',
  reset: '🧪',
  demo_script: '🎬',
  timeline_append: '➕',
  sync_trigger: '🔄',
  advance_clock: '⏰',
  reset_profile_timeline: '🗑️',
};

const EVENT_TRANSLATIONS: Record<string, string> = {
  sport_detected: '您可能在运动',
  late_night_work: '您可能在熬夜工作',
  high_stress: '您当前的压力水平较高',
  poor_sleep: '您昨晚的睡眠质量欠佳',
  sedentary: '您已经久坐不动较长时间了',
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

export function getScenarioIcon(type: ScenarioType): string {
  return SCENARIO_ICONS[type];
}

export function mapActiveSensingToBanner(activeSensing: ActiveSensingState): ActiveSensingBanner {
  const eventSummary = activeSensing.events.length > 0
    ? activeSensing.events.map(humanizeEventType).join(' 且 ')
    : '未知事件';

  const formattedDate = formatSensingDate(activeSensing.date);

  return {
    id: `active-sensing:${activeSensing.date}:${activeSensing.events.join('|')}`,
    type: activeSensing.priority === 'high' ? 'alert' : 'event',
    title: 'Active Sensing 已触发',
    content: `${formattedDate} 检测到 ${eventSummary}，需要我为您提供一些建议吗？`,
    priority: activeSensing.priority === 'high' ? 100 : 50,
    events: activeSensing.events,
  };
}
