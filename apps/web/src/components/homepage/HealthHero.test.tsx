import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { HealthHero } from './HealthHero';
import { HomepageIntlProvider } from './intl-test-helper';
import { HEALTH_STATE_METADATA, HEALTH_VISUAL_STATES } from '@/lib/valo-theme';
import type { HealthVisualState } from '@/lib/valo-theme';

function renderWithIntl(node: React.ReactNode) {
  return render(<HomepageIntlProvider>{node}</HomepageIntlProvider>);
}

describe('HealthHero', () => {
  beforeEach(() => {
    // 确保 jsdom 有 getComputedStyle 兜底（避免 transition 报错）
  });

  afterEach(() => {
    cleanup();
  });

  it('圆环是 <button type="button">', () => {
    renderWithIntl(
      <HealthHero state="prime-readiness" onOpenSwitchStatus={() => {}} />,
    );
    const ring = screen.getByRole('button');
    expect(ring.tagName).toBe('BUTTON');
    expect(ring.getAttribute('type')).toBe('button');
  });

  it('点击圆环触发 onOpenSwitchStatus', () => {
    const onOpen = vi.fn();
    renderWithIntl(
      <HealthHero state="active-recovery" onOpenSwitchStatus={onOpen} />,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('圆环带 aria-haspopup=dialog', () => {
    renderWithIntl(
      <HealthHero state="prime-readiness" onOpenSwitchStatus={() => {}} />,
    );
    expect(
      screen.getByRole('button').getAttribute('aria-haspopup'),
    ).toBe('dialog');
  });

  it('isSwitchStatusOpen=true 时 aria-expanded=true', () => {
    renderWithIntl(
      <HealthHero
        state="prime-readiness"
        onOpenSwitchStatus={() => {}}
        isSwitchStatusOpen
      />,
    );
    expect(
      screen.getByRole('button').getAttribute('aria-expanded'),
    ).toBe('true');
  });

  it('默认 aria-expanded=false', () => {
    renderWithIntl(
      <HealthHero state="prime-readiness" onOpenSwitchStatus={() => {}} />,
    );
    expect(
      screen.getByRole('button').getAttribute('aria-expanded'),
    ).toBe('false');
  });

  it('传 switchStatusDialogId 时设置 aria-controls', () => {
    renderWithIntl(
      <HealthHero
        state="prime-readiness"
        onOpenSwitchStatus={() => {}}
        switchStatusDialogId="my-dialog"
      />,
    );
    expect(
      screen.getByRole('button').getAttribute('aria-controls'),
    ).toBe('my-dialog');
  });

  it('未传 switchStatusDialogId 时不渲染 aria-controls', () => {
    renderWithIntl(
      <HealthHero state="prime-readiness" onOpenSwitchStatus={() => {}} />,
    );
    expect(
      screen.getByRole('button').getAttribute('aria-controls'),
    ).toBeNull();
  });

  it('aria-label 来自 i18n（切换健康状态）', () => {
    renderWithIntl(
      <HealthHero state="prime-readiness" onOpenSwitchStatus={() => {}} />,
    );
    expect(
      screen.getByRole('button').getAttribute('aria-label'),
    ).toBe('切换健康状态');
  });

  it('data-valo-touch=true 满足最小触达', () => {
    renderWithIntl(
      <HealthHero state="prime-readiness" onOpenSwitchStatus={() => {}} />,
    );
    expect(
      screen.getByRole('button').getAttribute('data-valo-touch'),
    ).toBe('true');
  });

  it('圆环内渲染当前状态的翻译名', () => {
    renderWithIntl(
      <HealthHero state="active-recovery" onOpenSwitchStatus={() => {}} />,
    );
    expect(screen.getByText('积极恢复')).toBeInTheDocument();
  });

  it('LLM loading 时使用最佳准备视觉并显示思考文案', () => {
    renderWithIntl(
      <HealthHero
        state="glycogen-depleted"
        isLoading
        onOpenSwitchStatus={() => {}}
      />,
    );

    const hero = document.querySelector('[data-valo-hero="true"]');
    expect(hero).toHaveAttribute('data-valo-state', 'prime-readiness');
    expect(hero).toHaveAttribute('data-valo-loading', 'true');
    expect(screen.getByText('Thinking')).toBeInTheDocument();
    expect(screen.queryByText('糖原耗尽')).not.toBeInTheDocument();
  });

  it('fallback 模式在圆心显示 Offline', () => {
    renderWithIntl(
      <HealthHero
        state="active-recovery"
        isOffline
        onOpenSwitchStatus={() => {}}
      />,
    );

    expect(screen.getByText('Offline')).toBeInTheDocument();
    expect(screen.queryByText('积极恢复')).not.toBeInTheDocument();
  });

  it('LLM loading 时标记圆环和 Canvas 的忙碌及动画状态', () => {
    renderWithIntl(
      <HealthHero
        state="active-recovery"
        isLoading
        onOpenSwitchStatus={() => {}}
      />,
    );

    expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true');
    expect(
      document.querySelector(
        '[data-valo-hero-canvas="prime-readiness"][data-valo-loading="true"]',
      ),
    ).not.toBeNull();
  });

  it('圆环 data-valo-state 反映当前状态', () => {
    renderWithIntl(
      <HealthHero state="glycogen-depleted" onOpenSwitchStatus={() => {}} />,
    );
    const section = document.querySelector('[data-valo-hero="true"]');
    expect(section?.getAttribute('data-valo-state')).toBe('glycogen-depleted');
  });

  it('四态穷举：圆环不写 backgroundImage（由 Canvas 动态绘制视觉）', () => {
    for (const state of HEALTH_VISUAL_STATES) {
      cleanup();
      renderWithIntl(
        <HealthHero state={state} onOpenSwitchStatus={() => {}} />,
      );
      const ring = screen.getByRole('button');
      const style = ring.getAttribute('style') ?? '';
      expect(style).not.toContain('background-image');
      expect(style).not.toContain('radial-gradient');
    }
  });

  it('渲染 HeroGlowCanvas，data-valo-hero-canvas 反映当前状态', () => {
    renderWithIntl(
      <HealthHero state="active-recovery" onOpenSwitchStatus={() => {}} />,
    );
    const canvas = document.querySelector('[data-valo-hero-canvas="active-recovery"]');
    expect(canvas).not.toBeNull();
    expect(canvas?.tagName).toBe('CANVAS');
  });

  it('四态穷举：HeroGlowCanvas 切换对应 state，不渲染静态 img', () => {
    for (const state of HEALTH_VISUAL_STATES) {
      cleanup();
      renderWithIntl(
        <HealthHero state={state} onOpenSwitchStatus={() => {}} />,
      );
      expect(document.querySelector(`[data-valo-hero-canvas="${state}"]`)).not.toBeNull();
      expect(document.querySelector('[data-valo-hero-canvas] img')).toBeNull();
    }
  });

  it('圆环 box-shadow 引用状态对应的 CSS 变量', () => {
    const state: HealthVisualState = 'metabolic-sluggish';
    renderWithIntl(
      <HealthHero state={state} onOpenSwitchStatus={() => {}} />,
    );
    const ring = screen.getByRole('button');
    const style = ring.getAttribute('style') ?? '';
    // cssVar 是 var(--valo-sluggish)，应出现在 box-shadow 拼接中
    expect(style).toContain(HEALTH_STATE_METADATA[state].cssVar);
  });

  it('不出现 hex 字面量（仅 token 引用）', () => {
    renderWithIntl(
      <HealthHero state="prime-readiness" onOpenSwitchStatus={() => {}} />,
    );
    const ring = screen.getByRole('button');
    const style = ring.getAttribute('style') ?? '';
    expect(style).not.toMatch(/#[0-9a-fA-F]{3,8}/);
  });

  it('children 在圆环下方追加内容', () => {
    renderWithIntl(
      <HealthHero state="prime-readiness" onOpenSwitchStatus={() => {}}>
        <span data-valo-child>extra</span>
      </HealthHero>,
    );
    expect(screen.getByText('extra')).toBeInTheDocument();
  });

  it('forwardRef 暴露圆环 button 节点', () => {
    const ref: { current: HTMLButtonElement | null } = { current: null };
    renderWithIntl(
      <HealthHero
        ref={ref}
        state="prime-readiness"
        onOpenSwitchStatus={() => {}}
      />,
    );
    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName).toBe('BUTTON');
  });
});
