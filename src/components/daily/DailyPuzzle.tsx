'use client';

import { useRouter } from 'next/navigation';
import { Calendar, Trophy, Star } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useUserStore } from '@/lib/store/userStore';
import { useGameStore } from '@/lib/store/gameStore';
import { getDailyBonus, kstToday } from '@/lib/game/daily';
import { startWithTicket } from '@/lib/hub/gb';

export function DailyPuzzle() {
  const router = useRouter();
  const dailyCompletedDates = useUserStore((s) => s.profile.dailyCompletedDates);
  const startDailyChallenge = useGameStore((s) => s.startDailyChallenge);

  const todayStr = kstToday();
  // Daily completion is tracked independently of the play streak, so finishing
  // ordinary puzzles no longer marks today's challenge as done.
  const alreadyPlayed = (dailyCompletedDates ?? []).includes(todayStr);
  const bonus = getDailyBonus(todayStr);

  // 판 시작 관문(이용권) — 클릭 안에서 바로
  const handlePlay = () => {
    startWithTicket('daily', () => {
      startDailyChallenge();
      router.push('/play');
    });
  };

  return (
    <Card className="relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-indigo-500/10" />
      <div className="absolute -right-2 -top-2 h-12 w-12 rounded-full bg-purple-500/10" />

      <div className="relative space-y-4">
        {/* Header */}
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-indigo-400" />
          <h2 className="text-lg font-bold text-white">오늘의 도전</h2>
          <span className="text-xs text-slate-400">{todayStr}</span>
        </div>

        {/* Bonus objective */}
        <div className="rounded-xl bg-indigo-500/10 border border-indigo-500/20 p-3">
          <div className="flex items-center gap-2">
            <Star className="h-4 w-4 text-amber-400" />
            <span className="text-sm font-medium text-indigo-300">
              보너스 목표
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-300">{bonus.descriptionKo}</p>
          <div className="mt-1.5 flex items-center gap-3 text-xs text-slate-400">
            <span>+{bonus.bonusXP} XP</span>
            <span>+{bonus.bonusCoins} 코인</span>
          </div>
        </div>

        {/* Result or Play button */}
        {alreadyPlayed ? (
          <div className="flex items-center gap-2 rounded-xl bg-green-500/10 border border-green-500/20 p-3">
            <Trophy className="h-5 w-5 text-green-400" />
            <div>
              <p className="text-sm font-semibold text-green-300">
                오늘의 도전 완료!
              </p>
              <p className="text-xs text-slate-400">
                내일 새로운 도전이 기다리고 있습니다
              </p>
            </div>
          </div>
        ) : (
          <Button onClick={handlePlay} className="w-full" size="lg">
            도전하기
          </Button>
        )}
      </div>
    </Card>
  );
}
