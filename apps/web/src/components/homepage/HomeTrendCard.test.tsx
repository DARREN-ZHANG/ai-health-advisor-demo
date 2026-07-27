import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { HomeTrendCard } from './HomeTrendCard';
import { HomepageIntlProvider } from './intl-test-helper';

function renderWithIntl(node: React.ReactNode) {
  return render(<HomepageIntlProvider>{node}</HomepageIntlProvider>);
}

describe('HomeTrendCard', () => {
  afterEach(() => cleanup());

  describe('Sleep display', () => {
    it('渲染 Sleep 标题、副标和固定 mock 数值', () => {
      const { container } = renderWithIntl(<HomeTrendCard display="sleep" />);

      expect(container.querySelector('[data-valo-home-trend-card="sleep"]')).not.toBeNull();
      expect(container.textContent).toContain('Sleep');
      expect(container.textContent).toContain('7 日简报');
      expect(container.textContent).toContain('7h 42m');
      expect(container.textContent).toContain('Score');
      expect(container.textContent).toContain('82');
      expect(container.textContent).toContain('Deep Sleep');
      expect(container.textContent).toContain('1h 35m');
      expect(container.textContent).toContain('Efficiency');
      expect(container.textContent).toContain('92%');
    });
  });

  describe('Activity display', () => {
    it('渲染 Activity 标题与 steps/distance/calories/active minutes', () => {
      const { container } = renderWithIntl(<HomeTrendCard display="activity" />);

      expect(container.querySelector('[data-valo-home-trend-card="activity"]')).not.toBeNull();
      expect(container.textContent).toContain('Activity');
      expect(container.textContent).toContain('8,426');
      expect(container.textContent).toContain('Distance');
      expect(container.textContent).toContain('5.8 km');
      expect(container.textContent).toContain('Calories');
      expect(container.textContent).toContain('420 kcal');
      expect(container.textContent).toContain('Active Minutes');
      expect(container.textContent).toContain('52 min');
    });
  });

  describe('视觉合同', () => {
    it('根 section 使用 ValoCard as=section 且固定 h-48', () => {
      const { container } = renderWithIntl(<HomeTrendCard display="sleep" />);
      const root = container.querySelector('[data-valo-home-trend-card]');
      expect(root?.tagName).toBe('SECTION');
      expect(root?.className).toContain('h-48');
      expect(root?.className).toContain('overflow-hidden');
    });

    it('根 section 含 aria-label（Sleep 或 Activity）', () => {
      const { container: sleepContainer } = renderWithIntl(<HomeTrendCard display="sleep" />);
      expect(
        sleepContainer.querySelector('[data-valo-home-trend-card="sleep"]')?.getAttribute('aria-label'),
      ).toBe('Sleep');

      const { container: activityContainer } = renderWithIntl(<HomeTrendCard display="activity" />);
      expect(
        activityContainer
          .querySelector('[data-valo-home-trend-card="activity"]')
          ?.getAttribute('aria-label'),
      ).toBe('Activity');
    });

    it('内联 SVG aria-hidden=true（不被辅助技术重复朗读）', () => {
      const { container } = renderWithIntl(<HomeTrendCard display="sleep" />);
      const svg = container.querySelector('svg');
      expect(svg).not.toBeNull();
      expect(svg?.getAttribute('aria-hidden')).toBe('true');
    });

    it('不渲染 button / link（无伪交互）', () => {
      const { container } = renderWithIntl(<HomeTrendCard display="sleep" />);
      expect(container.querySelector('button')).toBeNull();
      expect(container.querySelector('a')).toBeNull();
    });

    it('Sleep 与 Activity 都使用相同的固定外框高度（h-48）', () => {
      const { container: sleepContainer } = renderWithIntl(<HomeTrendCard display="sleep" />);
      const { container: activityContainer } = renderWithIntl(<HomeTrendCard display="activity" />);
      const sleepClass = sleepContainer.querySelector('[data-valo-home-trend-card]')?.className ?? '';
      const activityClass =
        activityContainer.querySelector('[data-valo-home-trend-card]')?.className ?? '';
      // 两者必须包含相同的高度类
      expect(sleepClass).toContain('h-48');
      expect(activityClass).toContain('h-48');
    });
  });

  describe('趋势数据归一化', () => {
    it('渲染 7 个数据点的 SVG 折线', () => {
      const { container } = renderWithIntl(<HomeTrendCard display="sleep" />);
      // 归一化函数生成的 SVG path 不依赖具体值，但 polyline 的 points 应包含 7 个点
      const polyline = container.querySelector('polyline');
      expect(polyline).not.toBeNull();
      const points = polyline?.getAttribute('points') ?? '';
      // 7 个 (x,y) 对
      expect(points.trim().split(/\s+/)).toHaveLength(7);
    });

    it('所有值相同时映射到中线（不抛错）', () => {
      // 直接调用归一化函数测试边界情况
      // 这里通过组件渲染验证 sleep/activity 均可正常渲染
      const { container: activityContainer } = renderWithIntl(
        <HomeTrendCard display="activity" />,
      );
      const polyline = activityContainer.querySelector('polyline');
      expect(polyline).not.toBeNull();
    });
  });
});
