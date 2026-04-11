/** 会话记忆最大轮次（1 轮 = user + assistant） */
export const MAX_TURNS = 6;

/** 会话 TTL（毫秒），默认 30 分钟 */
export const SESSION_TTL_MS = 30 * 60 * 1000;

/** Agent 执行总 SLA 超时（毫秒） */
export const AGENT_SLA_TIMEOUT_MS = 6000;

/** 单次响应最大 chart token 数 */
export const MAX_CHART_TOKENS = 2;

/** 单次响应最大 micro tips 数 */
export const MAX_MICRO_TIPS = 3;

/** 低数据阈值：窗口内记录少于该数量视为低数据 */
export const LOW_DATA_THRESHOLD = 3;
