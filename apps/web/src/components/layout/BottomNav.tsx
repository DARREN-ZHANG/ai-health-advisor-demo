'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { HomeIcon, ChartBarIcon, UserIcon } from '@heroicons/react/24/outline';

/**
 * Valo 底部导航信息架构：Home / Trends / My 三项主入口。
 *
 * I6.2 起与桌面端 Navbar 共用同一导航 IA；
 * 颜色全部走 var(--valo-*) token，避免硬编码 slate-* / blue-*。
 */
const navItems = [
  { href: '/', labelKey: 'home' as const, icon: HomeIcon },
  { href: '/data-center', labelKey: 'trends' as const, icon: ChartBarIcon },
  { href: '/my', labelKey: 'my' as const, icon: UserIcon },
];

export function BottomNav() {
  const pathname = usePathname();
  const t = useTranslations('nav');

  return (
    <nav
      data-valo-bottomnav="true"
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 backdrop-blur-md border-t valo-bottomnav-safe"
      style={{
        backgroundColor: 'var(--valo-surface)',
        borderColor: 'var(--valo-border)',
      }}
    >
      <div className="flex items-center justify-around h-16">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              data-valo-nav-item={item.labelKey}
              data-valo-touch="true"
              aria-current={isActive ? 'page' : undefined}
              className={`flex flex-col items-center gap-1 flex-1 py-2 transition-colors relative ${
                isActive
                  ? 'text-[var(--valo-prime)]'
                  : 'text-[var(--valo-text-secondary)] hover:text-[var(--valo-text-primary)]'
              }`}
            >
              <Icon className="w-6 h-6" />
              <span className="text-[10px] font-medium">{t(item.labelKey)}</span>
              {isActive && (
                <span
                  aria-hidden="true"
                  className="absolute bottom-1 w-1 h-1 rounded-full bg-[var(--valo-prime)]"
                />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
