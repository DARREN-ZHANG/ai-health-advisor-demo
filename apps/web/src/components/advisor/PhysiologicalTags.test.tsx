import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { PhysiologicalTags } from './PhysiologicalTags';
import { useProfileStore } from '@/stores/profile.store';
import { useDataCenterStore } from '@/stores/data-center.store';

/**
 * PhysiologicalTags 单元测试（I5.2）。
 *
 * 覆盖：
 * - data-valo-physio-tags 容器 + 每类 Pill 的 data-valo-physio-tag 锚点。
 * - 仅引用 var(--valo-*)，无散落的 slate-/blue-/green- 类名（容器层面）。
 * - data-center / homepage 路径分支切换 Pill 集合。
 * - profile 名 / 自定义 tag 渲染。
 */

// 通过共享变量控制 usePathname 返回值，方便在用例间切换。
let mockPathname = '/data-center';
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

const ZH_MESSAGES = {
  common: {
    homepageContext: '首页上下文',
    realTimeConnection: '实时连接',
  },
  dataCenter: {
    physTagSleep: '睡眠',
    physTagHrv: 'HRV',
    physTagRestingHr: '心率',
    physTagActivity: '活动',
    physTagSpo2: '血氧',
    physTagStress: '压力',
    physTagDay: '今日',
    physTagWeek: '本周',
    physTagMonth: '本月',
    physTagYear: '今年',
  },
} as const;

function renderWithIntl(node: ReactNode) {
  return render(
    <NextIntlClientProvider locale="zh" messages={ZH_MESSAGES}>
      {node}
    </NextIntlClientProvider>,
  );
}

describe('PhysiologicalTags', () => {
  beforeEach(() => {
    mockPathname = '/data-center';
    useProfileStore.setState({
      currentProfileId: 'profile-a',
      currentProfile: {
        profileId: 'profile-a',
        name: { zh: '用户A', en: 'UserA' },
        age: 30,
        gender: 'male',
        avatar: 'avatar',
        tags: [
          { zh: '夜猫子', en: 'Night Owl' },
          { zh: '咖啡敏感', en: 'Caffeine Sensitive' },
        ],
        baseline: {
          restingHr: 60,
          hrv: 50,
          spo2: 97,
          avgSleepMinutes: 480,
          avgSteps: 8000,
        },
      },
    });
    useDataCenterStore.setState({ activeTab: 'sleep', timeframe: 'week' });
  });

  afterEach(() => cleanup());

  it('挂出 data-valo-physio-tags="true" 容器', () => {
    renderWithIntl(<PhysiologicalTags />);
    expect(
      document.querySelector('[data-valo-physio-tags="true"]'),
    ).not.toBeNull();
  });

  it('profile Pill 携带 data-valo-physio-tag="profile" 且文本含 profile 名', () => {
    renderWithIntl(<PhysiologicalTags />);
    const pill = document.querySelector('[data-valo-physio-tag="profile"]');
    expect(pill).not.toBeNull();
    expect(pill?.textContent).toContain('用户A');
  });

  it('profile Pill 使用 var(--valo-prime) 作为强调色（color-mix 形式）', () => {
    renderWithIntl(<PhysiologicalTags />);
    const pill = document.querySelector(
      '[data-valo-physio-tag="profile"]',
    ) as HTMLElement | null;
    const style = pill?.getAttribute('style') ?? '';
    expect(style).toContain('var(--valo-prime)');
  });

  it('profile.tags 前 2 条渲染为 data-valo-physio-tag="custom-tag"', () => {
    renderWithIntl(<PhysiologicalTags />);
    const pills = document.querySelectorAll(
      '[data-valo-physio-tag="custom-tag"]',
    );
    expect(pills).toHaveLength(2);
    expect(pills[0]?.textContent).toContain('夜猫子');
    expect(pills[1]?.textContent).toContain('咖啡敏感');
  });

  it('data-center 路径渲染 tab 与 timeframe Pill', () => {
    renderWithIntl(<PhysiologicalTags />);
    expect(
      document.querySelector('[data-valo-physio-tag="tab"]'),
    ).not.toBeNull();
    expect(
      document.querySelector('[data-valo-physio-tag="timeframe"]'),
    ).not.toBeNull();
    // tab 文案来自 activeTab=sleep → physTagSleep="睡眠"
    expect(
      document.querySelector('[data-valo-physio-tag="tab"]')?.textContent,
    ).toContain('睡眠');
    // timeframe=week → physTagWeek="本周"
    expect(
      document.querySelector('[data-valo-physio-tag="timeframe"]')?.textContent,
    ).toContain('本周');
  });

  it('homepage 路径渲染 homepage Pill 而非 tab/timeframe', () => {
    mockPathname = '/';
    renderWithIntl(<PhysiologicalTags />);
    expect(
      document.querySelector('[data-valo-physio-tag="homepage"]'),
    ).not.toBeNull();
    expect(
      document.querySelector('[data-valo-physio-tag="homepage"]')?.textContent,
    ).toContain('首页上下文');
    expect(
      document.querySelector('[data-valo-physio-tag="tab"]'),
    ).toBeNull();
    expect(
      document.querySelector('[data-valo-physio-tag="timeframe"]'),
    ).toBeNull();
  });

  it('connection Pill 使用 var(--valo-active) 绿色强调', () => {
    renderWithIntl(<PhysiologicalTags />);
    const pill = document.querySelector(
      '[data-valo-physio-tag="connection"]',
    ) as HTMLElement | null;
    const style = pill?.getAttribute('style') ?? '';
    expect(style).toContain('var(--valo-active)');
    expect(pill?.textContent).toContain('实时连接');
  });

  it('容器（PhysiologicalTags 自身）不再使用散落的 slate-/blue-/green- 类名', () => {
    const { container } = renderWithIntl(<PhysiologicalTags />);
    const root = container.querySelector(
      '[data-valo-physio-tags="true"]',
    ) as HTMLElement | null;
    expect(root).not.toBeNull();
    const rootCls = root?.className ?? '';
    expect(rootCls).toContain('border-[var(--valo-border)]');
    expect(rootCls).not.toContain('bg-slate');
    expect(rootCls).not.toContain('border-slate');
  });

  it('profile 为 null 时退化为 currentProfileId 文本', () => {
    useProfileStore.setState({
      currentProfile: null,
      currentProfileId: 'fallback-id',
    });
    renderWithIntl(<PhysiologicalTags />);
    const pill = document.querySelector('[data-valo-physio-tag="profile"]');
    expect(pill?.textContent).toContain('fallback-id');
  });
});
