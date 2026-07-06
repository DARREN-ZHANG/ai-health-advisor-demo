import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { SmartPrompts, type SmartPromptOption } from './SmartPrompts';
import { AdvisorIntlProvider } from './intl-test-helper';

function renderWithIntl(node: React.ReactNode) {
  return render(<AdvisorIntlProvider>{node}</AdvisorIntlProvider>);
}

describe('SmartPrompts', () => {
  afterEach(() => cleanup());

  it('渲染 3 条推荐问题', () => {
    renderWithIntl(<SmartPrompts onSelect={vi.fn()} />);
    const container = document.querySelector(
      '[data-valo-smart-prompts="true"]',
    );
    expect(container).not.toBeNull();
    const buttons = container?.querySelectorAll('button');
    expect(buttons?.length).toBe(3);
  });

  it('每条 chip 是 <button>，并提供 aria-label 描述', () => {
    renderWithIntl(<SmartPrompts onSelect={vi.fn()} />);
    const labels = [
      '分析我昨晚的睡眠质量',
      '我最近的 HRV 趋势如何？',
      '给我的运动计划提点建议',
    ];
    labels.forEach((label) => {
      expect(
        screen.getByRole('button', { name: label }),
      ).toBeInTheDocument();
    });
  });

  it('chip 形态为胶囊（rounded-full）', () => {
    renderWithIntl(<SmartPrompts onSelect={vi.fn()} />);
    const chip = screen.getByRole('button', {
      name: '分析我昨晚的睡眠质量',
    });
    expect(chip.className).toContain('rounded-full');
  });

  it('点击触发 onSelect，传入对应 SmartPromptOption', () => {
    const onSelect = vi.fn();
    renderWithIntl(<SmartPrompts onSelect={onSelect} />);
    fireEvent.click(
      screen.getByRole('button', { name: '分析我昨晚的睡眠质量' }),
    );
    expect(onSelect).toHaveBeenCalledTimes(1);
    const arg = onSelect.mock.calls[0]?.[0] as SmartPromptOption;
    expect(arg.id).toBe('sleep-analysis');
    expect(arg.text).toBe('分析我昨晚的睡眠质量');
  });

  it('chip 仅引用 Valo token（surface + border + text-secondary）', () => {
    renderWithIntl(<SmartPrompts onSelect={vi.fn()} />);
    const chip = screen.getByRole('button', {
      name: '分析我昨晚的睡眠质量',
    });
    expect(chip.className).toContain('bg-[var(--valo-surface)]');
    expect(chip.className).toContain('border-[var(--valo-border)]');
    expect(chip.className).toContain('text-[var(--valo-text-secondary)]');
    // 旧 slate-/blue- 类不应出现。
    expect(chip.className).not.toContain('bg-slate');
    expect(chip.className).not.toContain('text-blue');
    expect(chip.className).not.toContain('hover:border-blue');
  });

  it('hover/focus 边框切换到 --valo-prime，文字切换到 --valo-text-primary', () => {
    renderWithIntl(<SmartPrompts onSelect={vi.fn()} />);
    const chip = screen.getByRole('button', {
      name: '分析我昨晚的睡眠质量',
    });
    expect(chip.className).toContain('hover:border-[var(--valo-prime)]');
    expect(chip.className).toContain('hover:text-[var(--valo-text-primary)]');
  });

  it('每条 chip 携带 data-valo-touch="true"', () => {
    renderWithIntl(<SmartPrompts onSelect={vi.fn()} />);
    const container = document.querySelector(
      '[data-valo-smart-prompts="true"]',
    );
    const buttons = container?.querySelectorAll('button');
    buttons?.forEach((btn) => {
      expect(btn.getAttribute('data-valo-touch')).toBe('true');
    });
  });
});
