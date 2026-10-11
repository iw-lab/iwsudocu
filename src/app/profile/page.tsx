'use client';

import Link from 'next/link';
import { Award } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { BottomNav } from '@/components/layout/BottomNav';
import { LevelProgress } from '@/components/profile/LevelProgress';
import { StatsCard } from '@/components/profile/StatsCard';
import { BrainScoreChart } from '@/components/profile/BrainScoreChart';
import { WeeklyReport } from '@/components/profile/WeeklyReport';
import { StreakCalendar } from '@/components/profile/StreakCalendar';
import { Button } from '@/components/ui/Button';
import { WeeklyMissions } from '@/components/missions/WeeklyMissions';
import { useUserStore } from '@/lib/store/userStore';

export default function ProfilePage() {
  const displayName = useUserStore((s) => s.profile.displayName);
  const unlockedCount = useUserStore(
    (s) => s.profile.achievements.filter((a) => a.isUnlocked).length
  );
  const totalCount = useUserStore((s) => s.profile.achievements.length);

  return (
    <div className="min-h-screen pb-24 pt-16">
      <Header />

      <main className="mx-auto max-w-lg space-y-4 px-4 pt-4">
        <WeeklyMissions />
        {/* User name */}
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">{displayName}</h2>
          <Link href="/settings">
            <Button variant="ghost" size="sm">
              설정
            </Button>
          </Link>
        </div>

        {/* Level progress */}
        <LevelProgress />

        {/* Brain score */}
        <BrainScoreChart />

        {/* Weekly training report */}
        <WeeklyReport />

        {/* Stats */}
        <StatsCard />

        {/* Streak calendar */}
        <StreakCalendar />

        {/* Achievements link */}
        <Link href="/achievements">
          <div className="flex items-center justify-between rounded-2xl bg-white/5 border border-white/10 p-4 hover:bg-white/10 transition-colors">
            <div className="flex items-center gap-3">
              <Award className="h-5 w-5 text-amber-400" />
              <div>
                <p className="text-sm font-semibold text-white">업적</p>
                <p className="text-xs text-slate-400">
                  {unlockedCount} / {totalCount} 달성
                </p>
              </div>
            </div>
            <span className="text-slate-400 text-sm">{'>'}</span>
          </div>
        </Link>
      </main>

      <BottomNav />
    </div>
  );
}
