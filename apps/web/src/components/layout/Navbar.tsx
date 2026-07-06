'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Container } from '@health-advisor/ui';
import { HeartIcon } from '@heroicons/react/24/solid';
import { LanguageSwitcher } from './LanguageSwitcher';

/**
 * 桌面端顶部导航 IA：Home / Trends / My。
 *
 * I6.2 起与移动端 BottomNav 共用同一导航 IA；
 * 颜色全部走 var(--valo-*) token。
 */
const NAV_KEYS = [
  { href: '/', key: 'home' as const },
  { href: '/data-center', key: 'trends' as const },
  { href: '/my', key: 'my' as const },
];

export function Navbar() {
  const pathname = usePathname();
  const t = useTranslations('nav');
  const isHome = pathname === '/';

  return (
    <nav
      data-valo-navbar="true"
      aria-hidden={isHome ? 'true' : undefined}
      className={`${isHome ? 'hidden' : 'sticky'} top-0 z-50 backdrop-blur-md border-b`}
      style={{
        backgroundColor: 'var(--valo-glass)',
        borderColor: 'var(--valo-border)',
      }}
    >
      <Container className="h-14 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link
            href="/"
            className="font-bold tracking-tight flex items-center gap-2 text-[var(--valo-text-primary)]"
          >
            <HeartIcon className="w-6 h-6 text-[var(--valo-prime)]" />
            <span>
              HEALTH <span className="text-[var(--valo-prime)]">ADVISOR</span>
            </span>
          </Link>
          <div className="hidden md:flex items-center gap-6">
            {NAV_KEYS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                data-valo-nav-item={item.key}
                aria-current={pathname === item.href ? 'page' : undefined}
                className={`text-sm font-medium transition-colors ${
                  pathname === item.href
                    ? 'text-[var(--valo-prime)]'
                    : 'text-[var(--valo-text-secondary)] hover:text-[var(--valo-text-primary)]'
                }`}
              >
                {t(item.key)}
              </Link>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <LanguageSwitcher />
        </div>
      </Container>
    </nav>
  );
}
