'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Container, Button } from '@health-advisor/ui';
import { useGodModeStore } from '@/stores/god-mode.store';
import { HeartIcon } from '@heroicons/react/24/solid';
import { LanguageSwitcher } from './LanguageSwitcher';

const NAV_KEYS = [
  { href: '/', key: 'home' as const },
  { href: '/data-center', key: 'dataCenter' as const },
];

export function Navbar() {
  const pathname = usePathname();
  const t = useTranslations('nav');
  const { isEnabled, toggleOpen } = useGodModeStore();

  return (
    <nav className="sticky top-0 z-50 bg-slate-900/80 backdrop-blur-md border-b border-slate-800">
      <Container className="h-14 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="/" className="font-bold text-slate-100 tracking-tight flex items-center gap-2">
            <HeartIcon className="w-6 h-6 text-blue-500" />
            <span>
              HEALTH <span className="text-blue-500">ADVISOR</span>
            </span>
          </Link>
          <div className="hidden md:flex items-center gap-6">
            {NAV_KEYS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`text-sm font-medium transition-colors ${
                  pathname === item.href
                    ? 'text-blue-500'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {t(item.key)}
              </Link>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          {isEnabled && (
            <Button
              variant="ghost"
              onClick={() => toggleOpen()}
              className="text-xs text-yellow-500/60 hover:text-yellow-500 hover:bg-yellow-500/10 border border-yellow-500/20 px-2 py-1 h-auto"
            >
              GOD MODE
            </Button>
          )}
          <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs">
            JD
          </div>
        </div>
      </Container>
    </nav>
  );
}
