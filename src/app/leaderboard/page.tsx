'use client';

import { useEffect, useRef, useState } from 'react';
import { Header } from '@/components/layout/Header';
import { BottomNav } from '@/components/layout/BottomNav';
import { Card } from '@/components/ui/Card';
import { useUserStore } from '@/lib/store/userStore';
import { mountRank } from '@/lib/hub/gb';
import { getBest, bestLabel } from '@/lib/mini/records';
import type { RunKind } from '@/lib/mini/run';

const RUN_ROWS: { kind: RunKind; emoji: string; label: string }[] = [
  { kind: 'time', emoji: '⏱️', label: '타임어택' },
  { kind: 'survival', emoji: '❤️', label: '서바이벌' },
  { kind: 'rule', emoji: '📐', label: '대각선' },
];

// 자유 입력 닉네임 랭킹은 걷어냈다(아동 개인정보) — 여기는 학교 순위 + 내 기록만 보여 준다.
export default function LeaderboardPage() {
  const rankRef = useRef<HTMLDivElement>(null);
  const stats = useUserStore((s) => s.profile.stats);
  const streak = useUserStore((s) => s.profile.streak.currentStreak);
  const [bests, setBests] = useState<Record<string, string>>({});

  useEffect(() => {
    if (rankRef.current) void mountRank(rankRef.current);
    // 기록은 localStorage 에만 있다 — 서버 렌더와 어긋나지 않게 마운트 뒤에 읽는다
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBests(Object.fromEntries(RUN_ROWS.map((r) => [r.kind, bestLabel(r.kind, getBest(r.kind)?.value) || '기록 없음'])));
  }, []);

  return (
    <div className="min-h-screen pb-24 pt-16">
      <Header />
      <main className="mx-auto max-w-lg space-y-4 px-4 pt-4">
        <h2 className="text-lg font-bold text-white">학교 순위</h2>
        <div ref={rankRef} />
        <h2 className="pt-2 text-lg font-bold text-white">내 기록</h2>
        <Card className="space-y-2">
          {RUN_ROWS.map((r) => (
            <div key={r.kind} className="flex items-center justify-between text-sm">
              <span className="text-slate-300">{r.emoji} {r.label}</span>
              <span className="font-semibold text-white">{bests[r.kind] ?? ''}</span>
            </div>
          ))}
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-300">🧩 클래식 승리</span>
            <span className="font-semibold text-white">{stats.totalGamesWon}판</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-300">📅 연속 도전</span>
            <span className="font-semibold text-white">{streak}일</span>
          </div>
        </Card>
      </main>
      <BottomNav />
    </div>
  );
}
