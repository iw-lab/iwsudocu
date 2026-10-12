'use client';
// 첫 화면 = game-builder 기본틀 셸: 머리줄 → 학교 순위(맨 위·접지 않음) → «시작하기» 1개 → 모드 카드 → 보조 줄.
// 판 시작은 전부 이용권 관문(startWithTicket)을 지난다 — 클릭 처리기 안에서 바로 불러야 자동 전체화면이 된다.
import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Maximize, Settings } from 'lucide-react';
import { BottomNav } from '@/components/layout/BottomNav';
import { StreakRiskBanner } from '@/components/home/StreakRiskBanner';
import { useUserStore } from '@/lib/store/userStore';
import { useGameStore } from '@/lib/store/gameStore';
import { kstToday } from '@/lib/game/daily';
import { mountRank, bindFullscreen, preloadHub, startWithTicket } from '@/lib/hub/gb';
import { getBest, bestLabel } from '@/lib/mini/records';
import type { RunKind } from '@/lib/mini/run';

const RUN_CARDS: { kind: RunKind; emoji: string; label: string; desc: string }[] = [
  { kind: 'time', emoji: '⏱️', label: '타임어택', desc: '90초 · 깨면 +12초' },
  { kind: 'survival', emoji: '❤️', label: '서바이벌', desc: '하트 3개로 버티기' },
  { kind: 'rule', emoji: '📐', label: '대각선', desc: '대각선도 겹치면 안 돼' },
];

export default function HomePage() {
  const router = useRouter();
  const rankRef = useRef<HTMLDivElement>(null);
  const modesRef = useRef<HTMLDivElement>(null);
  const fsRef = useRef<HTMLButtonElement>(null);
  const streak = useUserStore((s) => s.profile.streak.currentStreak);
  const dailyDone = useUserStore((s) => (s.profile.dailyCompletedDates ?? []).includes(kstToday()));
  const startDailyChallenge = useGameStore((s) => s.startDailyChallenge);

  useEffect(() => {
    if (rankRef.current) void mountRank(rankRef.current);
    void bindFullscreen(fsRef.current);
    let alive = true;
    void Promise.all([preloadHub(), import('@/gb/gb-modes.js')]).then(([, modes]) => {
      const el = modesRef.current;
      if (!alive || !el) return;
      const cards = [
        ...RUN_CARDS.map((c) => ({ id: c.kind, kind: c.kind, emoji: c.emoji, label: c.label, desc: c.desc, best: bestLabel(c.kind, getBest(c.kind)?.value) })),
        { id: 'daily', kind: 'daily' as const, emoji: '📅', label: '오늘의 퍼즐', desc: '하루 한 판 · 연속', best: dailyDone ? '오늘 완료 ✓' : streak > 0 ? `연속 ${streak}일` : '' },
      ];
      modes.renderModeCards(el, cards, (id) => {
        if (id === 'daily') {
          if (dailyDone) router.push('/daily');
          else startWithTicket('daily', () => { startDailyChallenge(); router.push('/play'); });
          return;
        }
        const kind = id as RunKind;
        startWithTicket(kind, () => router.push(`/${kind}`));
      });
    });
    return () => {
      alive = false;
    };
  }, [router, streak, dailyDone, startDailyChallenge]);

  const play = () => startWithTicket('classic', () => router.push('/play'));

  return (
    <div className="kc-home min-h-screen px-4 pb-28 pt-3 safe-top">
      <div className="gb-home">
        <div className="gb-home-top">
          <div className="gb-brand">
            <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">칸채움</span>
          </div>
          <div className="gb-tools">
            <button ref={fsRef} type="button" className="gb-icon" data-gb="fullscreen" aria-label="전체화면">
              <Maximize className="h-5 w-5" />
            </button>
            <Link href="/settings" className="gb-icon" aria-label="설정">
              <Settings className="h-5 w-5" />
            </Link>
          </div>
        </div>

        <div ref={rankRef} />

        <button type="button" className="gb-play" data-gb="play" data-gb-mode="classic" onClick={play}>
          🧩 시작하기 <span className="text-sm font-semibold opacity-80">· 클래식 9×9</span>
        </button>

        <div ref={modesRef} />

        <StreakRiskBanner />

        {/* 보조 줄 — 하단 메뉴(기록·프로필)와 겹치지 않는 것만 */}
        <div className="gb-sub">
          <button type="button" onClick={() => router.push('/help')}>도움말</button>
          <button type="button" onClick={() => router.push('/print')}>인쇄</button>
          <button type="button" onClick={() => router.push('/shop')}>상점</button>
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
