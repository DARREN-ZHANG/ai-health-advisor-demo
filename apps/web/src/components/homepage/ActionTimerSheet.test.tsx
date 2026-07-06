import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { ActionTimerSheet } from './ActionTimerSheet';
import { HomepageIntlProvider } from './intl-test-helper';

function renderWithIntl(node: React.ReactNode) {
  return render(<HomepageIntlProvider>{node}</HomepageIntlProvider>);
}

// 工具：推进 vitest fake timers
function advanceTimersByMs(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe('ActionTimerSheet', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it('open=true 渲染标题与立即完成按钮', () => {
    renderWithIntl(
      <ActionTimerSheet
        open
        durationSeconds={60}
        title="深呼吸"
        onComplete={() => {}}
        onStop={() => {}}
      />,
    );
    expect(screen.getAllByText('深呼吸').length).toBeGreaterThan(0);
    expect(
      screen.getAllByRole('button', { name: '立即完成' }).length,
    ).toBeGreaterThan(0);
  });

  it('倒计时显示初始 mm:ss', () => {
    renderWithIntl(
      <ActionTimerSheet
        open
        durationSeconds={90}
        title="t"
        onComplete={() => {}}
        onStop={() => {}}
      />,
    );
    // 双渲染（移动端 + 桌面端）会出现多个匹配
    expect(screen.getAllByText('01:30').length).toBeGreaterThan(0);
  });

  it('点击立即完成触发 onComplete 一次', () => {
    const onComplete = vi.fn();
    renderWithIntl(
      <ActionTimerSheet
        open
        durationSeconds={60}
        title="t"
        onComplete={onComplete}
        onStop={() => {}}
      />,
    );
    fireEvent.click(
      screen.getAllByRole('button', { name: '立即完成' })[0]!,
    );
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('重复点击立即完成只触发 onComplete 一次（单次提交保证）', () => {
    const onComplete = vi.fn();
    renderWithIntl(
      <ActionTimerSheet
        open
        durationSeconds={60}
        title="t"
        onComplete={onComplete}
        onStop={() => {}}
      />,
    );
    const btn = screen.getAllByRole('button', { name: '立即完成' })[0]!;
    fireEvent.click(btn);
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('点击 Stop 触发 onStop 但不触发 onComplete', () => {
    const onComplete = vi.fn();
    const onStop = vi.fn();
    renderWithIntl(
      <ActionTimerSheet
        open
        durationSeconds={60}
        title="t"
        onComplete={onComplete}
        onStop={onStop}
      />,
    );
    fireEvent.click(screen.getAllByRole('button', { name: '取消' })[0]!);
    expect(onStop).toHaveBeenCalledTimes(1);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('Pause/Resume 切换按钮文案', () => {
    renderWithIntl(
      <ActionTimerSheet
        open
        durationSeconds={60}
        title="t"
        onComplete={() => {}}
        onStop={() => {}}
      />,
    );
    // 桌面端 + 移动端各有一个 pause 按钮，取第一个
    const pauseBtns = screen.getAllByRole('button', { name: '暂停' });
    fireEvent.click(pauseBtns[0]!);
    expect(screen.getAllByRole('button', { name: '继续' }).length).toBeGreaterThan(0);
  });

  it('Pause 后倒计时停止', () => {
    renderWithIntl(
      <ActionTimerSheet
        open
        durationSeconds={60}
        title="t"
        onComplete={() => {}}
        onStop={() => {}}
      />,
    );
    fireEvent.click(screen.getAllByRole('button', { name: '暂停' })[0]!);
    const before = screen.getAllByText('01:00')[0]!.textContent;
    advanceTimersByMs(5000);
    expect(screen.getAllByText('01:00')[0]!.textContent).toBe(before);
  });

  it('Resume 后倒计时继续', () => {
    renderWithIntl(
      <ActionTimerSheet
        open
        durationSeconds={60}
        title="t"
        onComplete={() => {}}
        onStop={() => {}}
      />,
    );
    fireEvent.click(screen.getAllByRole('button', { name: '暂停' })[0]!);
    fireEvent.click(screen.getAllByRole('button', { name: '继续' })[0]!);
    advanceTimersByMs(3000);
    expect(screen.getAllByText('00:57').length).toBeGreaterThan(0);
  });

  it('自然完成（倒计时到 0）触发 onComplete 一次', () => {
    const onComplete = vi.fn();
    renderWithIntl(
      <ActionTimerSheet
        open
        durationSeconds={2}
        title="t"
        onComplete={onComplete}
        onStop={() => {}}
      />,
    );
    advanceTimersByMs(1000);
    advanceTimersByMs(1000);
    advanceTimersByMs(500); // 让 effect 触发
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('自然完成后再点立即完成不重复触发', () => {
    const onComplete = vi.fn();
    renderWithIntl(
      <ActionTimerSheet
        open
        durationSeconds={1}
        title="t"
        onComplete={onComplete}
        onStop={() => {}}
      />,
    );
    advanceTimersByMs(1000);
    advanceTimersByMs(500);
    // 自然完成后按钮可能已 disabled，但若仍可点击应不重复
    const btns = screen.queryAllByRole('button', { name: '立即完成' });
    btns.forEach((b) => fireEvent.click(b));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('open=false 不渲染', () => {
    renderWithIntl(
      <ActionTimerSheet
        open={false}
        durationSeconds={60}
        title="t"
        onComplete={() => {}}
        onStop={() => {}}
      />,
    );
    expect(screen.queryAllByText('01:00')).toHaveLength(0);
  });

  it('进度条 role="progressbar" 存在', () => {
    renderWithIntl(
      <ActionTimerSheet
        open
        durationSeconds={60}
        title="t"
        onComplete={() => {}}
        onStop={() => {}}
      />,
    );
    expect(screen.getAllByRole('progressbar').length).toBeGreaterThan(0);
  });
});
