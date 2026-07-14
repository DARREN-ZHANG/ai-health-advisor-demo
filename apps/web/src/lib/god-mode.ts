import type { ActiveSensingState } from '@health-advisor/shared';
import type { ActiveSensingBanner } from '@/stores/active-sensing.store';

/** banner 翻译函数：来自 next-intl 的 useTranslations('advisor.activeSensing.banner') */
export type BannerTranslator = (
  key: string,
  values?: Record<string, string | number | Date>,
) => string;

/** 已知的 active sensing 事件类型（messages 中有对应翻译键） */
const KNOWN_EVENTS = new Set([
  'sport_detected',
  'late_night_work',
  'high_stress',
  'poor_sleep',
  'sedentary',
  'possible_alcohol_intake',
  'possible_caffeine_intake',
]);

/** 需要用户确认的概率事件 */
const PROBABILISTIC_EVENTS = new Set(['possible_alcohol_intake', 'possible_caffeine_intake']);

function humanizeEventType(eventType: string, t: BannerTranslator): string {
  if (KNOWN_EVENTS.has(eventType)) {
    return t(`events.${eventType}`);
  }
  // 未知事件：回退为 Title Case，避免 next-intl 抛出 MISSING_MESSAGE
  return eventType
    .split('_')
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ');
}

function formatSensingDate(dateStr: string, locale: string): string {
  try {
    const date = new Date(dateStr);
    return new Intl.DateTimeFormat(locale, {
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

function getBannerTitle(events: string[], t: BannerTranslator): string {
  if (events.some((e) => PROBABILISTIC_EVENTS.has(e))) {
    return t('titleConfirm');
  }
  return t('titleTriggered');
}

function getBannerContent(
  activeSensing: ActiveSensingState,
  t: BannerTranslator,
  locale: string,
): string {
  const formattedDate = formatSensingDate(activeSensing.date, locale);
  const hasProbabilistic = activeSensing.events.some((e) => PROBABILISTIC_EVENTS.has(e));

  if (hasProbabilistic) {
    const isAlcohol = activeSensing.events.includes('possible_alcohol_intake');
    const isCaffeine = activeSensing.events.includes('possible_caffeine_intake');

    if (isAlcohol && isCaffeine) {
      return t('contentBoth', { date: formattedDate });
    }
    if (isAlcohol) {
      return t('contentAlcohol', { date: formattedDate });
    }
    return t('contentCaffeine', { date: formattedDate });
  }

  const eventSummary = activeSensing.events.length > 0
    ? activeSensing.events.map((e) => humanizeEventType(e, t)).join(t('eventJoiner'))
    : t('unknownEvent');

  return t('contentGeneric', { date: formattedDate, summary: eventSummary });
}

export function mapActiveSensingToBanner(
  activeSensing: ActiveSensingState,
  t: BannerTranslator,
  locale: string,
): ActiveSensingBanner {
  return {
    id: `active-sensing:${activeSensing.date}:${activeSensing.events.join('|')}`,
    type: activeSensing.priority === 'high' ? 'alert' : 'event',
    title: getBannerTitle(activeSensing.events, t),
    content: getBannerContent(activeSensing, t, locale),
    priority: activeSensing.priority === 'high' ? 100 : 50,
    events: activeSensing.events,
  };
}
