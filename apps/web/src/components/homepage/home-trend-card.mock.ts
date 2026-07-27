/**
 * Home Trend Card typed mock 数据。
 *
 * 设计意图：
 * - 第一版只交付固定数值的 Trends Brief，不接真实 Trends API，不裁剪静态 PNG。
 * - 判别联合通过 `display` 字段确保调用方按 Sleep/Activity 分别处理。
 * - 7 日 trend 数组长度固定为 7，归一化逻辑由展示组件统一处理。
 * - 不引入动态日期或随机数，保证端到端测试稳定。
 */
export type HomeTrendCardMock =
  | {
      display: 'sleep';
      primaryValue: '7h 42m';
      score: 82;
      deepSleep: '1h 35m';
      efficiency: '92%';
      trend: readonly [7.1, 7.4, 6.9, 7.6, 7.8, 7.3, 7.7];
    }
  | {
      display: 'activity';
      primaryValue: '8,426';
      distance: '5.8 km';
      calories: '420 kcal';
      activeMinutes: '52 min';
      trend: readonly [6200, 7800, 5100, 9300, 8600, 7400, 8426];
    };

export const HOME_TREND_CARD_MOCK_SLEEP = {
  display: 'sleep',
  primaryValue: '7h 42m',
  score: 82,
  deepSleep: '1h 35m',
  efficiency: '92%',
  trend: [7.1, 7.4, 6.9, 7.6, 7.8, 7.3, 7.7],
} as const satisfies HomeTrendCardMock;

export const HOME_TREND_CARD_MOCK_ACTIVITY = {
  display: 'activity',
  primaryValue: '8,426',
  distance: '5.8 km',
  calories: '420 kcal',
  activeMinutes: '52 min',
  trend: [6200, 7800, 5100, 9300, 8600, 7400, 8426],
} as const satisfies HomeTrendCardMock;

/**
 * 按 display 取对应的 typed mock；非法 display 返回 undefined。
 * 调用方使用 `display === 'sleep' | 'activity'` 后取值，避免运行时分支漂移。
 */
export function getHomeTrendCardMock(
  display: 'sleep' | 'activity',
): HomeTrendCardMock {
  return display === 'sleep'
    ? HOME_TREND_CARD_MOCK_SLEEP
    : HOME_TREND_CARD_MOCK_ACTIVITY;
}
