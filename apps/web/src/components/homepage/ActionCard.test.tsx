import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ActionCard } from './ActionCard';
import { HomepageIntlProvider } from './intl-test-helper';
import type { ActionOption } from '@health-advisor/shared';

function renderWithIntl(node: React.ReactNode) {
  return render(<HomepageIntlProvider>{node}</HomepageIntlProvider>);
}

function makeAction(overrides: Partial<ActionOption> = {}): ActionOption {
  return {
    id: 'a1',
    emoji: '💧',
    title: '喝水',
    description: '建议立即补充水分',
    aiPromise: '你会感到更清醒',
    ...overrides,
  };
}

describe('ActionCard', () => {
  afterEach(() => cleanup());

  it('渲染标题与描述', () => {
    renderWithIntl(
      <ActionCard
        action={makeAction()}
        onYes={() => {}}
        onNotNow={() => {}}
      />,
    );
    expect(screen.getByText('喝水')).toBeInTheDocument();
    expect(screen.getByText('建议立即补充水分')).toBeInTheDocument();
  });

  it('渲染 Yes 与 Not Now 按钮', () => {
    renderWithIntl(
      <ActionCard
        action={makeAction()}
        onYes={() => {}}
        onNotNow={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: '确认' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '稍后' })).toBeInTheDocument();
  });

  it('点击 Yes 触发 onYes', () => {
    const onYes = vi.fn();
    renderWithIntl(
      <ActionCard action={makeAction()} onYes={onYes} onNotNow={() => {}} />,
    );
    fireEvent.click(screen.getByRole('button', { name: '确认' }));
    expect(onYes).toHaveBeenCalledTimes(1);
  });

  it('点击 Not Now 触发 onNotNow', () => {
    const onNotNow = vi.fn();
    renderWithIntl(
      <ActionCard
        action={makeAction()}
        onYes={() => {}}
        onNotNow={onNotNow}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '稍后' }));
    expect(onNotNow).toHaveBeenCalledTimes(1);
  });

  it('点击 Yes 后卡片收起，显示 已记录', () => {
    renderWithIntl(
      <ActionCard action={makeAction()} onYes={() => {}} onNotNow={() => {}} />,
    );
    fireEvent.click(screen.getByRole('button', { name: '确认' }));
    // 文本被拆到多个 span，用 function matcher
    expect(
      screen.getAllByText((_, node) =>
        !!node?.textContent?.includes('已记录'),
      ).length,
    ).toBeGreaterThan(0);
    // 按钮消失
    expect(screen.queryByRole('button', { name: '确认' })).not.toBeInTheDocument();
  });

  it('点击 Not Now 后卡片收起，显示 已忽略', () => {
    renderWithIntl(
      <ActionCard action={makeAction()} onYes={() => {}} onNotNow={() => {}} />,
    );
    fireEvent.click(screen.getByRole('button', { name: '稍后' }));
    expect(
      screen.getAllByText((_, node) =>
        !!node?.textContent?.includes('已忽略'),
      ).length,
    ).toBeGreaterThan(0);
  });

  it('collapseOnInteract=false 时不收起', () => {
    renderWithIntl(
      <ActionCard
        action={makeAction()}
        onYes={() => {}}
        onNotNow={() => {}}
        collapseOnInteract={false}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '确认' }));
    expect(
      screen.getByRole('button', { name: '确认' }),
    ).toBeInTheDocument();
  });

  it('pending=true 禁用按钮', () => {
    renderWithIntl(
      <ActionCard
        action={makeAction()}
        onYes={() => {}}
        onNotNow={() => {}}
        pending
      />,
    );
    expect(screen.getByRole('button', { name: '确认' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '稍后' })).toBeDisabled();
  });

  it('pending=true 时 Yes 按钮 aria-busy=true', () => {
    renderWithIntl(
      <ActionCard
        action={makeAction()}
        onYes={() => {}}
        onNotNow={() => {}}
        pending
      />,
    );
    expect(screen.getByRole('button', { name: '确认' }).getAttribute('aria-busy')).toBe('true');
  });

  it('非 pending 时确认按钮包含 check icon', () => {
    renderWithIntl(
      <ActionCard action={makeAction()} onYes={() => {}} onNotNow={() => {}} />,
    );
    const button = screen.getByRole('button', { name: '确认' });
    expect(button.querySelector('svg')).not.toBeNull();
  });

  it('移动端行动卡片按约 1.8 张可见设置宽度', () => {
    renderWithIntl(
      <ActionCard action={makeAction()} onYes={() => {}} onNotNow={() => {}} />,
    );
    const card = document.querySelector('[data-valo-action-tip-card]');
    expect(card).not.toBeNull();
    expect((card as HTMLElement).style.flexBasis).toBe(
      'calc(0.5555555555555556 * (100% - 12px))',
    );
  });

  it('pending 状态下点击 Yes 不触发回调', () => {
    const onYes = vi.fn();
    renderWithIntl(
      <ActionCard
        action={makeAction()}
        onYes={onYes}
        onNotNow={() => {}}
        pending
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '确认' }));
    expect(onYes).not.toHaveBeenCalled();
  });

  it('确认按钮使用设计稿尺寸与文字大小', () => {
    renderWithIntl(
      <ActionCard action={makeAction()} onYes={() => {}} onNotNow={() => {}} />,
    );
    const button = screen.getByRole('button', { name: '确认' });
    expect(button.className).toContain('h-8');
    expect(button.className).toContain('text-xs');
    expect(button.className).toContain('leading-4');
  });

  it('无 description 时不渲染描述', () => {
    renderWithIntl(
      <ActionCard
        action={makeAction({ description: '' })}
        onYes={() => {}}
        onNotNow={() => {}}
      />,
    );
    expect(screen.queryByText('建议立即补充水分')).not.toBeInTheDocument();
  });
});
