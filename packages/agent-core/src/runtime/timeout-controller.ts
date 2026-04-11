import { AGENT_SLA_TIMEOUT_MS } from '../constants/limits';

export class TimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`操作超时（${timeoutMs}ms）`);
    this.name = 'TimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

export interface TimeoutController {
  signal: AbortSignal;
  abort: () => void;
}

/**
 * 为异步操作添加超时控制。
 * 接受一个 factory 函数，将 AbortSignal 传入，使底层操作可被真正取消。
 *
 * 用法：
 * ```ts
 * const result = await withTimeout(
 *   (signal) => agent.invoke({ ..., signal }),
 *   6000,
 * );
 * ```
 *
 * 超时时：
 * 1. 调用 controller.abort() → signal.aborted 变为 true → 底层 LLM 请求被取消
 * 2. 抛出 TimeoutError
 */
export async function withTimeout<T>(
  factory: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number = AGENT_SLA_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new TimeoutError(timeoutMs));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([
      factory(controller.signal),
      timeoutPromise,
    ]);
    return result;
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

withTimeout.createController = function (_timeoutMs: number): TimeoutController {
  const abortController = new AbortController();
  return {
    signal: abortController.signal,
    abort: () => abortController.abort(),
  };
};
