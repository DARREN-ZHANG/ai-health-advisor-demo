'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { HomeIcon, ChartBarIcon, UserIcon } from '@heroicons/react/24/outline';
import {
  HomeIcon as HomeSolidIcon,
  ChartBarIcon as ChartBarSolidIcon,
  UserIcon as UserSolidIcon,
} from '@heroicons/react/24/solid';

/**
 * Valo 底部导航信息架构：Home / Trends / My 三项主入口。
 *
 * I6.2 起与桌面端 Navbar 共用同一导航 IA；
 * 主状态色走 var(--valo-*) token；玻璃背景使用 Figma 原稿的半透明深色面。
 */
const navItems = [
  { href: '/', labelKey: 'home' as const, icon: HomeIcon, activeIcon: HomeSolidIcon },
  {
    href: '/data-center',
    labelKey: 'trends' as const,
    icon: ChartBarIcon,
    activeIcon: ChartBarSolidIcon,
  },
  { href: '/my', labelKey: 'my' as const, icon: UserIcon, activeIcon: UserSolidIcon },
];

export function BottomNav() {
  const pathname = usePathname();
  const t = useTranslations('nav');

  return (
    <nav
      data-valo-bottomnav="true"
      className="fixed bottom-6 z-50 w-[276px] rounded-[34px]
                 border border-white/10 px-[6px] py-[5px]
                 backdrop-blur-xl valo-bottomnav-safe"
      style={{
        left: 'max(18px, calc(50% - 178px))',
        backgroundColor: 'rgba(21, 21, 29, 0.62)',
        borderColor: 'var(--valo-border)',
        boxShadow:
          '0 14px 34px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
      }}
    >
      <div className="flex h-[56px] items-center justify-between">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = isActive ? item.activeIcon : item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              data-valo-nav-item={item.labelKey}
              data-valo-touch="true"
              aria-current={isActive ? 'page' : undefined}
              className={`relative flex h-full min-w-0 flex-1 flex-col items-center justify-center gap-1
                          rounded-[28px] text-[11px] font-medium leading-none transition-colors ${
                isActive
                  ? 'bg-[rgba(31,30,39,0.92)] text-[var(--valo-prime)] shadow-[0_0_28px_rgba(167,139,250,0.18)]'
                  : 'text-[var(--valo-text-secondary)] hover:text-[var(--valo-text-primary)]'
              }`}
            >
              <Icon
                className="h-[23px] w-[23px]"
                strokeWidth={isActive ? 2.4 : 1.8}
                aria-hidden="true"
              />
              <span>{t(item.labelKey)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
