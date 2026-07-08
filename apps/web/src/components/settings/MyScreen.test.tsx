import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
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

  it('菜单项是静态列表，不渲染旧版可点击设置按钮', () => {
    renderScreen();

    expect(screen.queryByRole('button')).toBeNull();
    expect(document.querySelector('[data-valo-my="root"]')).not.toBeNull();
    expect(document.querySelectorAll('[data-valo-my]').length).toBe(13);
  });
});
