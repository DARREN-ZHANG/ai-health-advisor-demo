import { describe, it, expect } from 'vitest';
import { withTimeout, TimeoutError, type TimeoutController } from '../../runtime/timeout-controller';
import { AGENT_SLA_TIMEOUT_MS } from '../../constants/limits';

describe('withTimeout', () => {
  it('正常完成的 promise 返回结果', async () => {
    const result = await withTimeout(
      () => Promise.resolve('ok'),
      1000,
    );
    expect(result).toBe('ok');
  });

  it('超时抛出 TimeoutError', async () => {
    await expect(
      withTimeout(() => new Promise<string>(() => {}), 50),
    ).rejects.toThrow(TimeoutError);
  });

  it('TimeoutError 包含超时时间信息', async () => {
    try {
      await withTimeout(() => new Promise<string>(() => {}), 50);
    } catch (e) {
      expect(e).toBeInstanceOf(TimeoutError);
      expect((e as TimeoutError).timeoutMs).toBe(50);
      return;
    }
    expect.unreachable('应该抛出 TimeoutError');
  });

  it('使用默认超时值（6 秒）', async () => {
    const fastFail = () => Promise.reject(new Error('provider error'));
    await expect(
      withTimeout(fastFail, AGENT_SLA_TIMEOUT_MS),
    ).rejects.toThrow('provider error');
  });

  it('promise reject 时透传原始错误', async () => {
    await expect(
      withTimeout(() => Promise.reject(new Error('API 连接失败')), 1000),
    ).rejects.toThrow('API 连接失败');
  });

  it('创建 AbortSignal 可被外部取消', () => {
    const controller: TimeoutController = withTimeout.createController(5000);
    expect(controller.signal.aborted).toBe(false);
    controller.abort();
    expect(controller.signal.aborted).toBe(true);
  });

  it('超时时 abort signal 传递给底层操作', async () => {
    let receivedSignal: AbortSignal | undefined;

    await expect(
      withTimeout(async (signal) => {
        receivedSignal = signal;
        // 模拟永不返回的 LLM 调用
        return new Promise<string>((_resolve, _reject) => {
          signal.addEventListener('abort', () => {
            _reject(new Error('aborted'));
          });
        });
      }, 50),
    ).rejects.toThrow(TimeoutError);

    // 验证 signal 被传入且在超时后被 abort
    expect(receivedSignal).toBeDefined();
    expect(receivedSignal!.aborted).toBe(true);
  });
});
