import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { ThinkingText } from './ThinkingText';

describe('ThinkingText', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it('初始渲染首词 Thinking', () => {
    render(<ThinkingText />);
    const span = screen.getByText('Thinking');
    expect(span).toBeInTheDocument();
    expect(span).toHaveAttribute('aria-hidden', 'true');
  });

  it('intervalMs 后渐隐，fadeMs 后切到下一个词并渐现', () => {
    render(<ThinkingText intervalMs={1000} fadeMs={200} />);
    // 初始：Thinking，opacity 1
    const initial = screen.getByText('Thinking');
    expect((initial as HTMLElement).style.opacity).toBe('1');

    // 推进 intervalMs：触发渐隐（opacity 0），词未切
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText('Thinking')).toBeInTheDocument();
    expect(
      (screen.getByText('Thinking') as HTMLElement).style.opacity,
    ).toBe('0');

    // 推进 fadeMs：切词 + 渐现（opacity 1）
    act(() => {
      vi.advanceTimersByTime(200);
    });
    const next = screen.getByText('Hatching');
    expect(next).toBeInTheDocument();
    expect((next as HTMLElement).style.opacity).toBe('1');
  });

  it('按给出顺序循环全部词并回到首词', () => {
    const words = [
      'Thinking',
      'Hatching',
      'Pondering',
      'Reasoning',
      'Analyzing',
      'Evaluating',
    ] as const;
    render(<ThinkingText intervalMs={100} fadeMs={10} />);
    expect(screen.getByText('Thinking')).toBeInTheDocument();

    for (let i = 1; i <= words.length; i++) {
      // interval 触发渐隐
      act(() => {
        vi.advanceTimersByTime(100);
      });
      // fadeMs 触发切词 + 渐现
      act(() => {
        vi.advanceTimersByTime(10);
      });
      const expected = words[i % words.length]!;
      expect(screen.getByText(expected)).toBeInTheDocument();
    }
    // 循环一圈后回到首词
    expect(screen.getByText('Thinking')).toBeInTheDocument();
  });

  it('卸载时清理 timer，不抛错', () => {
    const { unmount } = render(
      <ThinkingText intervalMs={1000} fadeMs={200} />,
    );
    // 进入渐隐阶段：interval 已触发，swap timeout 已挂起
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(() => unmount()).not.toThrow();
  });

  it('自定义 intervalMs/fadeMs 生效', () => {
    render(<ThinkingText intervalMs={5000} fadeMs={1000} />);
    // 距 interval 还差 1ms，不应切词
    act(() => {
      vi.advanceTimersByTime(4999);
    });
    expect(screen.getByText('Thinking')).toBeInTheDocument();

    // 到 interval：渐隐
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(
      (screen.getByText('Thinking') as HTMLElement).style.opacity,
    ).toBe('0');

    // fadeMs 后：切到 Hatching 并渐现
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText('Hatching')).toBeInTheDocument();
    expect(
      (screen.getByText('Hatching') as HTMLElement).style.opacity,
    ).toBe('1');
  });

  it('轮播 span 带 aria-hidden 避免 SR 朗读', () => {
    render(<ThinkingText />);
    expect(screen.getByText('Thinking')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
  });
});
