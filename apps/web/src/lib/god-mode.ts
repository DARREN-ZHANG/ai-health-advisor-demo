import type { ActiveSensingState, ScenarioType } from '@health-advisor/shared';
import type { ActiveSensingBanner } from '@/stores/active-sensing.store';

const SCENARIO_ICONS: Record<ScenarioType, string> = {
  profile_switch: '👤',
  event_inject: '⚡',
  metric_override: '📉',
  reset: '🧪',
  demo_script: '🎬',
};

function humanizeEventType(eventType: string): string {
  return eventType
    .split('_')
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ');
}

export function getScenarioIcon(type: ScenarioType): string {
  return SCENARIO_ICONS[type];
}

export function mapActiveSensingToBanner(activeSensing: ActiveSensingState): ActiveSensingBanner {
  const eventSummary = activeSensing.events.length > 0
    ? activeSensing.events.map(humanizeEventType).join(' / ')
    : 'Unknown Event';

  return {
    id: `active-sensing:${activeSensing.date}:${activeSensing.events.join('|')}`,
    type: activeSensing.priority === 'high' ? 'alert' : 'event',
    title: 'Active Sensing 已触发',
    content: `${activeSensing.date} 检测到 ${eventSummary}，请查看详情并继续对话。`,
    priority: activeSensing.priority === 'high' ? 100 : 50,
  };
}
