import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { ActivityDetailView } from './ActivityDetailView';
import { DataCenterIntlProvider } from './intl-test-helper';
import type { DataCenterResponse } from '@health-advisor/shared';

/**
 * ActivityDetailView 测试套件。
 *
 * 覆盖：
 * - 渲染 4 项统计（steps / distance / calories / activeMinutes）
 * - distanceKm 出现在响应中
 * - 缺失字段渲染 —
 * - 整体 data 缺失时不崩溃
 */

function renderWithIntl(node: React.ReactNode) {
  return render(<DataCenterIntlProvider>{node}</DataCenterIntlProvider>);
}

function makeTimeline(
  values: Record<string, number | null>,
  date = '2026-06-21',
): DataCenterResponse {
  return {
    profileId: 'profile-1',
    tab: 'activity',
    timeframe: 'day',
    range: { start: date, end: date },
    timeline: [{ date, values }],
    metadata: { recordCount: 1, metrics: ['activity.steps'] },
  };
}

const FULL_VALUES = {
  'activity.steps': 8423,
  'activity.distanceKm': 6.42,
  'activity.calories': 412,
  'activity.activeMinutes': 53,
};

describe('ActivityDetailView', () => {
  afterEach(() => cleanup());

  it('渲染 4 项统计 label', () => {
    renderWithIntl(<ActivityDetailView data={makeTimeline(FULL_VALUES)} />);
    expect(document.querySelector('[data-valo-activity-stat="activity.steps"]')).not.toBeNull();
    expect(document.querySelector('[data-valo-activity-stat="activity.distanceKm"]')).not.toBeNull();
    expect(document.querySelector('[data-valo-activity-stat="activity.calories"]')).not.toBeNull();
    expect(document.querySelector('[data-valo-activity-stat="activity.activeMinutes"]')).not.toBeNull();
  });

  it('distanceKm 数值带 1 位小数渲染', () => {
    renderWithIntl(<ActivityDetailView data={makeTimeline(FULL_VALUES)} />);
    const node = document.querySelector('[data-valo-activity-stat="activity.distanceKm"]');
    expect(node?.textContent).toBe('6.4');
  });

  it('steps 使用千分位格式化', () => {
    renderWithIntl(<ActivityDetailView data={makeTimeline(FULL_VALUES)} />);
    const node = document.querySelector('[data-valo-activity-stat="activity.steps"]');
    expect(node?.textContent).toBe('8,423');
  });

  it('calories / activeMinutes 取整渲染', () => {
    renderWithIntl(<ActivityDetailView data={makeTimeline(FULL_VALUES)} />);
    expect(document.querySelector('[data-valo-activity-stat="activity.calories"]')?.textContent).toBe('412');
    expect(document.querySelector('[data-valo-activity-stat="activity.activeMinutes"]')?.textContent).toBe('53');
  });

  it('distance 单位 "公里" 渲染', () => {
    const { container } = render(<DataCenterIntlProvider><ActivityDetailView data={makeTimeline(FULL_VALUES)} /></DataCenterIntlProvider>);
    expect(container.textContent).toContain('公里');
  });

  it('缺失字段渲染 — 不崩溃', () => {
    renderWithIntl(
      <ActivityDetailView
        data={makeTimeline({ 'activity.steps': 1000 })}
      />,
    );
    expect(document.querySelector('[data-valo-activity-stat="activity.steps"]')?.textContent).toBe('1,000');
    expect(document.querySelector('[data-valo-activity-stat="activity.distanceKm"]')?.textContent).toBe('—');
    expect(document.querySelector('[data-valo-activity-stat="activity.calories"]')?.textContent).toBe('—');
    expect(document.querySelector('[data-valo-activity-stat="activity.activeMinutes"]')?.textContent).toBe('—');
  });

  it('data 完全缺失时整体渲染空态不崩溃', () => {
    renderWithIntl(<ActivityDetailView data={null} />);
    expect(document.querySelector('[data-valo-trends-activity-detail]')).not.toBeNull();
    // 4 个 stat 全部 —
    const stats = document.querySelectorAll('[data-valo-activity-stat]');
    expect(stats).toHaveLength(4);
    stats.forEach((s) => expect(s.textContent).toBe('—'));
  });
});
