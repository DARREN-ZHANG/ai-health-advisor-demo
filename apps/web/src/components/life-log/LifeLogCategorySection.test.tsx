import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { LifeLogCategorySection } from './LifeLogCategorySection';
import { LifeLogIntlProvider } from './intl-test-helper';
import type { LifeLogEntry } from '@/lib/life-log';

function renderSection(
  type: 'caffeine' | 'alcohol' | 'hydration',
  entries: LifeLogEntry[] = [],
  onOpen = vi.fn(),
) {
  render(
    <LifeLogIntlProvider>
      <LifeLogCategorySection type={type} entries={entries} onOpen={onOpen} />
    </LifeLogIntlProvider>,
  );
  return onOpen;
}

describe('LifeLogCategorySection', () => {
  afterEach(cleanup);

  it('展示咖啡因汇总并通过按钮打开分类弹窗', () => {
    const onOpen = renderSection('caffeine', [
      {
        id: 'one',
        profileId: 'profile-a',
        type: 'caffeine',
        cups: 2,
        timestamp: '2026-07-08T14:00',
      },
    ]);
    expect(screen.getByText('2 drinks')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '自定义' }));
    expect(onOpen).toHaveBeenCalledWith('caffeine');
  });

  it('饮水按 ml 汇总', () => {
    renderSection('hydration', [
      {
        id: 'water',
        profileId: 'profile-a',
        type: 'hydration',
        cups: 2,
        timestamp: '2026-07-08T14:00',
      },
    ]);
    expect(screen.getByText('500 ml')).toBeTruthy();
  });

  it('空类目显示占位值', () => {
    renderSection('alcohol');
    expect(screen.getByText('- drinks')).toBeTruthy();
  });
});
