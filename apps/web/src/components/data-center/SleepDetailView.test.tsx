import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { SleepDetailView } from './SleepDetailView';
import { DataCenterIntlProvider } from './intl-test-helper';
import type { DataCenterResponse, SandboxProfile } from '@health-advisor/shared';

/**
 * SleepDetailView 测试套件。
 *
 * 覆盖：
 * - duration：渲染 totalMinutes -> "Xh Ym"
 * - completion：基于 baseline.avgSleepMinutes 计算 %
 * - completion：baseline 缺失时显示 "未设置目标"
 * - stages：渲染 4 个分期
 * - efficiency：total / (total + awake)
 * - score：直接显示 sleep.score（不通过其他指标推导）
 * - missing data：缺失字段渲染 "—"，不崩溃
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
    tab: 'sleep',
    timeframe: 'day',
    range: { start: date, end: date },
    timeline: [{ date, values }],
    metadata: { recordCount: 1, metrics: ['sleep.totalMinutes'] },
  };
}

const BASE_PROFILE: SandboxProfile = {
  profileId: 'profile-1',
  name: { en: 'A', zh: 'A' },
  age: 30,
  gender: 'male',
  avatar: '',
  tags: [],
  baseline: {
    restingHr: 60,
    hrv: 50,
    spo2: 97,
    avgSleepMinutes: 480, // 8 小时目标
    avgSteps: 8000,
  },
};

describe('SleepDetailView', () => {
  afterEach(() => cleanup());

  it('渲染时长（452 分钟 -> 7时 32分）', () => {
    renderWithIntl(
      <SleepDetailView
        data={makeTimeline({
          'sleep.totalMinutes': 452,
          'sleep.score': 80,
          'sleep.stages.deep': 90,
          'sleep.stages.light': 240,
          'sleep.stages.rem': 100,
          'sleep.stages.awake': 20,
        })}
        profile={BASE_PROFILE}
      />,
    );
    expect(screen.getByText(/7时.*32分/)).toBeInTheDocument();
  });

  it('基于 baseline 渲染完成度 %', () => {
    // 452 / 480 ≈ 94%
    renderWithIntl(
      <SleepDetailView
        data={makeTimeline({ 'sleep.totalMinutes': 452 })}
        profile={BASE_PROFILE}
      />,
    );
    expect(screen.getByText('94%')).toBeInTheDocument();
  });

  it('baseline 缺失时显示 "未设置目标"', () => {
    renderWithIntl(
      <SleepDetailView
        data={makeTimeline({ 'sleep.totalMinutes': 452 })}
        profile={null}
      />,
    );
    expect(screen.getByText('未设置目标')).toBeInTheDocument();
  });

  it('渲染 4 个睡眠分期', () => {
    renderWithIntl(
      <SleepDetailView
        data={makeTimeline({
          'sleep.stages.deep': 90,
          'sleep.stages.light': 240,
          'sleep.stages.rem': 100,
          'sleep.stages.awake': 20,
        })}
        profile={BASE_PROFILE}
      />,
    );
    expect(screen.getByText('深睡')).toBeInTheDocument();
    expect(screen.getByText('浅睡')).toBeInTheDocument();
    expect(screen.getByText('REM')).toBeInTheDocument();
    expect(screen.getByText('清醒')).toBeInTheDocument();
  });

  it('渲染睡眠效率', () => {
    // total 452 + awake 20 = 472；452/472 ≈ 96%
    renderWithIntl(
      <SleepDetailView
        data={makeTimeline({
          'sleep.totalMinutes': 452,
          'sleep.stages.awake': 20,
        })}
        profile={BASE_PROFILE}
      />,
    );
    // 用 data-hook 定位
    const node = document.querySelector('[data-valo-sleep-efficiency]');
    expect(node?.textContent).toBe('96%');
  });

  it('渲染睡眠得分（直接显示，不推导）', () => {
    renderWithIntl(
      <SleepDetailView
        data={makeTimeline({ 'sleep.score': 82 })}
        profile={BASE_PROFILE}
      />,
    );
    const node = document.querySelector('[data-valo-sleep-score]');
    expect(node?.textContent).toBe('82');
  });

  it('缺失字段渲染 — 不崩溃', () => {
    renderWithIntl(<SleepDetailView data={makeTimeline({})} profile={null} />);
    // 时长 / 效率 / 得分 均显示 —
    const duration = document.querySelector('[data-valo-sleep-duration]');
    const efficiency = document.querySelector('[data-valo-sleep-efficiency]');
    const score = document.querySelector('[data-valo-sleep-score]');
    expect(duration?.textContent).toBe('—');
    expect(efficiency?.textContent).toBe('—');
    expect(score?.textContent).toBe('—');
  });

  it('awake 缺失时效率无法推导，显示 —', () => {
    renderWithIntl(
      <SleepDetailView
        data={makeTimeline({ 'sleep.totalMinutes': 452 })}
        profile={BASE_PROFILE}
      />,
    );
    const efficiency = document.querySelector('[data-valo-sleep-efficiency]');
    expect(efficiency?.textContent).toBe('—');
  });

  it('data 完全缺失时整体渲染空态而不崩溃', () => {
    renderWithIntl(<SleepDetailView data={null} profile={null} />);
    expect(document.querySelector('[data-valo-trends-sleep-detail]')).not.toBeNull();
    // 时长 / 效率 / 得分 / 4 个分期 都会显示 — ，故用 getAllByText
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('score 独立于 stages —— 修改 stages 不影响 score 显示', () => {
    const { rerender } = renderWithIntl(
      <SleepDetailView
        data={makeTimeline({ 'sleep.score': 70, 'sleep.stages.deep': 100 })}
        profile={BASE_PROFILE}
      />,
    );
    expect(document.querySelector('[data-valo-sleep-score]')?.textContent).toBe('70');

    // stages 变化，score 保持 API 给定值
    rerender(
      <DataCenterIntlProvider>
        <SleepDetailView
          data={makeTimeline({ 'sleep.score': 70, 'sleep.stages.deep': 30 })}
          profile={BASE_PROFILE}
        />
      </DataCenterIntlProvider>,
    );
    expect(document.querySelector('[data-valo-sleep-score]')?.textContent).toBe('70');
  });
});
