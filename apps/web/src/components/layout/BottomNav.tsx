'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { HomeIcon, ChartBarIcon, UserIcon } from '@heroicons/react/24/outline';
import {
  HomeIcon as HomeSolidIcon,
  ChartBarIcon as ChartBarSolidIcon,
  UserIcon as UserSolidIcon,
} from '@heroicons/react/24/solid';
import { useUIStore } from '@/stores/ui.store';

/**
 * Valo 底部导航信息架构：Home / Trends / My，右侧独立 Advisor Chat 入口。
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
  const navT = useTranslations('nav');
  const commonT = useTranslations('common');
  const { toggleAdvisorDrawer } = useUIStore();
  const renderNavItem = (item: (typeof navItems)[number]) => {
    const isActive = pathname === item.href;
    const Icon = isActive ? item.activeIcon : item.icon;

    return (
      <Link
        key={item.href}
        href={item.href}
        data-valo-nav-item={item.labelKey}
        data-valo-touch="true"
        aria-current={isActive ? 'page' : undefined}
        className={`relative flex h-full min-w-0 items-center justify-center text-[11px]
                    font-medium leading-none transition-colors ${
          isActive
            ? 'text-[var(--valo-prime)]'
            : 'text-[var(--valo-text-secondary)] hover:text-[var(--valo-text-primary)]'
        }`}
      >
        <span
          data-valo-nav-pill={isActive ? 'active' : 'inactive'}
          className={`flex h-[50px] min-w-[58px] flex-col items-center justify-center gap-1
                      rounded-full px-3 transition-colors ${
            isActive
              ? 'bg-[rgba(255,255,255,0.08)] shadow-[0_0_24px_rgba(167,139,250,0.16)]'
              : ''
          }`}
        >
          <Icon
            className="h-[23px] w-[23px]"
            strokeWidth={isActive ? 2.4 : 1.8}
            aria-hidden="true"
          />
          <span>{navT(item.labelKey)}</span>
        </span>
      </Link>
    );
  };

  return (
    <footer
      data-valo-bottomnav="true"
      className="relative z-30 mx-auto mb-6 mt-8 w-[320px] max-w-[calc(100%-36px)]
                 rounded-[34px] border border-white/10 px-[8px] py-[6px]
                 backdrop-blur-xl valo-bottomnav-safe"
      style={{
        backgroundColor: 'rgba(21, 21, 29, 0.62)',
        borderColor: 'var(--valo-border)',
        boxShadow:
          '0 14px 34px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
      }}
    >
      <div className="flex h-[62px] items-center gap-2">
        <nav aria-label="Primary" className="grid h-full flex-1 grid-cols-3 items-center gap-1">
          {navItems.map(renderNavItem)}
        </nav>

        <button
          type="button"
          aria-label={commonT('openAIAdvisor')}
          data-valo-advisor-trigger="true"
          data-valo-touch="true"
          onClick={() => toggleAdvisorDrawer(true)}
          className="relative flex h-[62px] w-[62px] shrink-0 items-center justify-center rounded-full
                     transition-transform hover:scale-[1.03] focus:outline-none
                     focus-visible:shadow-[var(--valo-focus-ring)] active:scale-95"
          style={{
            boxShadow:
              '0 0 26px rgba(167, 139, 250, 0.42), 0 12px 30px rgba(0, 0, 0, 0.42)',
          }}
        >
          <Image
            src="/valo/images/chat-entrance.png"
            alt=""
            width={62}
            height={62}
            className="h-[62px] w-[62px] object-contain"
            priority
          />
        </button>
      </div>
    </footer>
  );
}
