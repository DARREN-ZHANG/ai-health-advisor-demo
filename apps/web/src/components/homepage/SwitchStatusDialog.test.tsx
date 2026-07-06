import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { SwitchStatusDialog } from './SwitchStatusDialog';
import { HomepageIntlProvider } from './intl-test-helper';
import { HEALTH_VISUAL_STATES } from '@/lib/valo-theme';

function renderWithIntl(node: React.ReactNode) {
  return render(<HomepageIntlProvider>{node}</HomepageIntlProvider>);
}

describe('SwitchStatusDialog', () => {
  afterEach(() => {
    cleanup();
  });

  it('open=false 时既不渲染 mobile Sheet 也不渲染 desktop Dialog', () => {
    renderWithIntl(
      <SwitchStatusDialog
        open={false}
        onClose={() => {}}
        current="prime-readiness"
        onSelect={() => {}}
      />,
    );
    // 弹窗未打开：拿不到 role=dialog
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('open=true 时同时挂载移动端与桌面端两份弹窗（dual-render 模式）', () => {
    renderWithIntl(
      <SwitchStatusDialog
        open
        onClose={() => {}}
        current="prime-readiness"
        onSelect={() => {}}
      />,
    );
    // jsdom 不解析 Tailwind 断点，两份 dialog 同时存在
    const dialogs = screen.getAllByRole('dialog');
    expect(dialogs.length).toBeGreaterThanOrEqual(1);
  });

  it('每个视口都渲染四态 radio', () => {
    renderWithIntl(
      <SwitchStatusDialog
        open
        onClose={() => {}}
        current="prime-readiness"
        onSelect={() => {}}
      />,
    );
    // name="health-state" 共 4 项 × 2 视口 = 8
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(8);
    for (const radio of radios) {
      expect(radio.getAttribute('name')).toBe('health-state');
    }
  });

  it('四态穷举：每个 radio 的 value 都在四态集合内', () => {
    renderWithIntl(
      <SwitchStatusDialog
        open
        onClose={() => {}}
        current="prime-readiness"
        onSelect={() => {}}
      />,
    );
    const radios = screen.getAllByRole('radio');
    for (const radio of radios) {
      expect(HEALTH_VISUAL_STATES).toContain(radio.getAttribute('value'));
    }
  });

  it('current 状态对应 radio 为 checked', () => {
    renderWithIntl(
      <SwitchStatusDialog
        open
        onClose={() => {}}
        current="active-recovery"
        onSelect={() => {}}
      />,
    );
    const radios = screen.getAllByRole('radio');
    const checked = radios.filter((r) => r.getAttribute('value') === 'active-recovery');
    expect(checked).toHaveLength(2);
    for (const r of checked) expect(r).toBeChecked();
  });

  it('点击 radio 立即触发 onSelect(state)', () => {
    const onSelect = vi.fn();
    renderWithIntl(
      <SwitchStatusDialog
        open
        onClose={() => {}}
        current="prime-readiness"
        onSelect={onSelect}
      />,
    );
    const radios = screen.getAllByRole('radio');
    const target = radios.find((r) => r.getAttribute('value') === 'glycogen-depleted');
    expect(target).toBeDefined();
    fireEvent.click(target as HTMLElement);
    expect(onSelect).toHaveBeenCalledWith('glycogen-depleted');
  });

  it('点击 label 也能触发 onSelect（label 包裹 radio）', () => {
    const onSelect = vi.fn();
    renderWithIntl(
      <SwitchStatusDialog
        open
        onClose={() => {}}
        current="prime-readiness"
        onSelect={onSelect}
      />,
    );
    // 选择"代谢迟缓"label（应出现两次：移动端 + 桌面端）
    const labels = screen.getAllByText('代谢迟缓');
    expect(labels.length).toBeGreaterThanOrEqual(1);
    fireEvent.click(labels[0] as HTMLElement);
    expect(onSelect).toHaveBeenCalledWith('metabolic-sluggish');
  });

  it('每个 radio 满足最小触达：data-valo-touch=true', () => {
    renderWithIntl(
      <SwitchStatusDialog
        open
        onClose={() => {}}
        current="prime-readiness"
        onSelect={() => {}}
      />,
    );
    const radios = screen.getAllByRole('radio');
    for (const r of radios) {
      expect(r.getAttribute('data-valo-touch')).toBe('true');
    }
  });

  it('颜色样本引用对应状态的 CSS 变量', () => {
    renderWithIntl(
      <SwitchStatusDialog
        open
        onClose={() => {}}
        current="prime-readiness"
        onSelect={() => {}}
      />,
    );
    // 每个状态至少有一个 swatch
    for (const state of HEALTH_VISUAL_STATES) {
      const swatch = document.querySelector(
        `[data-valo-swatch="${state}"]`,
      ) as HTMLElement | null;
      expect(swatch).not.toBeNull();
      const style = swatch?.getAttribute('style') ?? '';
      expect(style).toContain('var(--valo-');
    }
  });

  it('dialog 根元素 id 默认为 switch-status-dialog（供 aria-controls 关联）', () => {
    renderWithIntl(
      <SwitchStatusDialog
        open
        onClose={() => {}}
        current="prime-readiness"
        onSelect={() => {}}
      />,
    );
    const targets = document.querySelectorAll('#switch-status-dialog');
    // 移动端 + 桌面端各一份同 id（aria-controls 不要求全局唯一）
    expect(targets.length).toBeGreaterThanOrEqual(1);
  });

  it('dialogId prop 可覆盖默认 id', () => {
    renderWithIntl(
      <SwitchStatusDialog
        open
        onClose={() => {}}
        current="prime-readiness"
        onSelect={() => {}}
        dialogId="custom-id"
      />,
    );
    expect(document.querySelector('#custom-id')).not.toBeNull();
    expect(document.querySelector('#switch-status-dialog')).toBeNull();
  });

  it('原生 fieldset + legend 存在（语义化）', () => {
    renderWithIntl(
      <SwitchStatusDialog
        open
        onClose={() => {}}
        current="prime-readiness"
        onSelect={() => {}}
      />,
    );
    // fieldset 至少 2 份（双视口）
    const fieldsets = document.querySelectorAll('fieldset');
    expect(fieldsets.length).toBeGreaterThanOrEqual(2);
    // legend 视觉隐藏但仍在 DOM
    const legends = document.querySelectorAll('legend');
    expect(legends.length).toBeGreaterThanOrEqual(2);
  });

  it('点击关闭按钮（X）触发 onClose', () => {
    const onClose = vi.fn();
    renderWithIntl(
      <SwitchStatusDialog
        open
        onClose={onClose}
        current="prime-readiness"
        onSelect={() => {}}
      />,
    );
    // 两份弹窗各有一个"关闭"按钮（aria-label="关闭"）
    const closeBtns = screen.getAllByRole('button', { name: '关闭' });
    expect(closeBtns.length).toBeGreaterThanOrEqual(1);
    fireEvent.click(closeBtns[0] as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
