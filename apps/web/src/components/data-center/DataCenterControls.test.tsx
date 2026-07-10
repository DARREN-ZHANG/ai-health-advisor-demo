import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { DataCenterControls } from './DataCenterControls';
import { DataCenterIntlProvider } from './intl-test-helper';

describe('DataCenterControls', () => {
  afterEach(() => cleanup());

  it('将日期翻页控件作为紧凑的居中组合渲染', () => {
    render(
      <DataCenterIntlProvider>
        <DataCenterControls />
      </DataCenterIntlProvider>,
    );

    const group = document.querySelector('[data-valo-date-pagination-group]');
    expect(group?.className).toContain('gap-2');
    expect(group?.className).not.toContain('justify-between');
    expect(screen.getByRole('button', { name: '前一天' }).className).not.toContain('absolute');
    expect(screen.getByRole('button', { name: '后一天' }).className).not.toContain('absolute');
  });
});
