'use client';

import { Header } from '@/components/layout/Header';
import { BottomNav } from '@/components/layout/BottomNav';
import { DailyPuzzle } from '@/components/daily/DailyPuzzle';
import { DailyCountdown } from '@/components/daily/DailyCountdown';

export default function DailyPage() {
  return (
    <div className="min-h-screen pb-24 pt-16">
      <Header />

      <main className="mx-auto max-w-lg space-y-4 px-4 pt-4">
        <h2 className="text-lg font-bold text-white">데일리 챌린지</h2>

        <DailyPuzzle />
        <DailyCountdown />
      </main>

      <BottomNav />
    </div>
  );
}
