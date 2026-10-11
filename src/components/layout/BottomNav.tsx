'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Gamepad2, Calendar, Trophy, User } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

const NAV_ITEMS = [
  { label: '홈', icon: Home, path: '/' },
  { label: '플레이', icon: Gamepad2, path: '/play' },
  { label: '데일리', icon: Calendar, path: '/daily' },
  { label: '랭킹', icon: Trophy, path: '/leaderboard' },
  { label: '프로필', icon: User, path: '/profile' },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 glass-card rounded-none border-x-0 border-b-0 pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex max-w-lg items-center justify-around px-2 py-1">
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.path === '/'
              ? pathname === '/'
              : pathname.startsWith(item.path);
          const Icon = item.icon;

          return (
            <Link
              key={item.path}
              href={item.path}
              className={cn(
                'flex flex-col items-center gap-0.5 rounded-xl px-3 py-1.5 transition-all duration-200',
                isActive
                  ? 'text-indigo-400'
                  : 'text-slate-500 hover:text-slate-300'
              )}
            >
              <div className="relative">
                <Icon
                  className={cn(
                    'h-5 w-5 transition-all duration-200',
                    isActive && 'scale-110'
                  )}
                />
                {isActive && (
                  <div className="absolute -bottom-1 left-1/2 h-0.5 w-3 -translate-x-1/2 rounded-full bg-indigo-400" />
                )}
              </div>
              <span
                className={cn(
                  'text-xs font-medium',
                  isActive ? 'text-indigo-400' : 'text-slate-500'
                )}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
