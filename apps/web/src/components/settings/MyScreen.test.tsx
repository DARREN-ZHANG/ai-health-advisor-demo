import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { MyScreen } from './MyScreen';

const MESSAGES = {
  my: {
    title: 'My',
    groups: {
      general: 'General',
      app: 'App',
      resources: 'Resources',
      legal: 'Legal',
    },
    items: {
      valoRing: 'Valo Ring',
      account: 'Account',
      goals: 'Goals',
      subscription: 'Subscription',
      language: 'Language',
      notifications: 'Notifications',
      appearance: 'Appearance',
      unit: 'Unit',
      gettingStarted: 'Getting Started with Valo',
      faq: 'FAQ',
      termsOfService: 'Terms of Service',
      privacyPolicy: 'Privacy Policy',
    },
    languageSheet: {
      title: 'Language',
      legend: 'Choose language',
    },
  },
} as const;

function renderScreen() {
  return render(
    <NextIntlClientProvider locale="zh" messages={MESSAGES}>
      <MyScreen />
    </NextIntlClientProvider>,
  );
}

describe('MyScreen', () => {
  afterEach(() => {
    cleanup();
  });

  it('渲染设计稿中的标题与分组', () => {
    renderScreen();

    expect(screen.getByRole('heading', { level: 1, name: 'My' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'General' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'App' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Resources' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Legal' })).toBeInTheDocument();
  });

  it('渲染设计稿中的所有静态菜单项', () => {
    renderScreen();

    for (const label of Object.values(MESSAGES.my.items)) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('只有 language 菜单项渲染为 button，其他保持静态', () => {
    renderScreen();

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveTextContent('Language');
  });

  it('data-valo-my 共 13 个（1 root + 12 行）', () => {
    renderScreen();

    expect(document.querySelector('[data-valo-my="root"]')).not.toBeNull();
    expect(document.querySelectorAll('[data-valo-my]').length).toBe(13);
  });

  it('点击 language 按钮打开语言切换弹窗', () => {
    renderScreen();

    // 初始无弹窗
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Language' }));

    // 弹窗出现（至少 1 个；实际 2 个 = 移动端 + 桌面端 dual-render）
    const dialogs = screen.getAllByRole('dialog');
    expect(dialogs.length).toBeGreaterThanOrEqual(1);
  });
});
