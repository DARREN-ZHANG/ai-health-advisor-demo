import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { LanguageSheet } from './LanguageSheet';

/**
 * LanguageSheet 单元测试。
 *
 * 双视口（移动端 ValoSheet + 桌面端 ValoDialog）同时挂载，故 radio/dialog
 * 均会出现 2 份。测试断言时取 `getAllBy*` 并校验最少 2 份或精确 2 份。
 */

const MESSAGES = {
  my: {
    languageSheet: {
      title: 'Language',
      legend: 'Choose language',
    },
  },
} as const;

function renderSheet(node: ReactNode) {
  return render(
    <NextIntlClientProvider locale="zh" messages={MESSAGES}>
      {node}
    </NextIntlClientProvider>,
  );
}

/** Mock window.location.reload —— jsdom 默认无实现 */
function mockReload() {
  const reload = vi.fn();
  Object.defineProperty(window, 'location', {
    value: { ...window.location, reload },
    writable: true,
  });
  return reload;
}

describe('LanguageSheet', () => {
  beforeEach(() => {
    // 清空 localStorage 防止用例间污染
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('open=false 时不渲染任何弹窗', () => {
    renderSheet(<LanguageSheet open={false} onClose={() => {}} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('open=true 时同时挂载移动端与桌面端两份弹窗', () => {
    renderSheet(<LanguageSheet open onClose={() => {}} />);
    const dialogs = screen.getAllByRole('dialog');
    expect(dialogs.length).toBeGreaterThanOrEqual(2);
  });

  it('渲染 zh / en 两个选项（双视口共 4 个 radio）', () => {
    renderSheet(<LanguageSheet open onClose={() => {}} />);
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(4);
    for (const r of radios) {
      expect(r.getAttribute('name')).toBe('locale');
    }
  });

  it('展示本地语言名称 "简体中文" 与 "English"', () => {
    renderSheet(<LanguageSheet open onClose={() => {}} />);
    // 每个名称至少出现一次（双视口各 1 次）
    expect(screen.getAllByText('简体中文').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('English').length).toBeGreaterThanOrEqual(1);
  });

  it('当前 locale (zh) 对应的 radio 为 checked', () => {
    renderSheet(<LanguageSheet open onClose={() => {}} />);
    const checkedRadios = screen
      .getAllByRole('radio')
      .filter((r) => r.getAttribute('checked') === '');
    expect(checkedRadios.length).toBe(2); // 双视口各 1
    for (const r of checkedRadios) {
      expect(r.getAttribute('value')).toBe('zh');
    }
  });

  it('选择新 locale 调用 localStorage.setItem 与 window.location.reload', () => {
    const reload = mockReload();
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');

    renderSheet(<LanguageSheet open onClose={() => {}} />);

    const enRadio = screen
      .getAllByRole('radio')
      .find((r) => r.getAttribute('value') === 'en');
    expect(enRadio).toBeDefined();
    fireEvent.click(enRadio!);

    expect(setItemSpy).toHaveBeenCalledWith('lang', 'en');
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('点击当前 locale 不触发副作用，仅调用 onClose 关闭弹窗', () => {
    const reload = mockReload();
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    const onClose = vi.fn();

    renderSheet(<LanguageSheet open onClose={onClose} />);

    const zhRadio = screen
      .getAllByRole('radio')
      .find((r) => r.getAttribute('value') === 'zh');
    expect(zhRadio).toBeDefined();
    fireEvent.click(zhRadio!);

    expect(setItemSpy).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
