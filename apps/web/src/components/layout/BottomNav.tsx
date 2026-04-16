'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { HomeIcon, ChartBarIcon } from '@heroicons/react/24/outline';

const navItems = [
  { href: '/', label: '首页', icon: HomeIcon },
  { href: '/data-center', label: '数据', icon: ChartBarIcon },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-slate-900/90 backdrop-blur-md border-t border-slate-800 pb-safe">
      <div className="flex items-center justify-around h-16">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-1 flex-1 py-2 transition-colors relative ${
                isActive ? 'text-blue-500' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <Icon className="w-6 h-6" />
              <span className="text-[10px] font-medium">{item.label}</span>
              {isActive && (
                <div className="absolute bottom-1 w-1 h-1 rounded-full bg-blue-500" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
