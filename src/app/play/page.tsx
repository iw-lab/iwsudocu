'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useGameStore } from '@/lib/store/gameStore';
import { useUserStore } from '@/lib/store/userStore';
import { useTimer } from '@/hooks/useTimer';
import { useKeyboard } from '@/hooks/useKeyboard';
import DifficultySelector from '@/components/game/DifficultySelector';
import GameHeader from '@/components/game/GameHeader';
import SudokuBoard from '@/components/game/SudokuBoard';
import GameControls from '@/components/game/GameControls';
import NumberPad from '@/components/game/NumberPad';
import ComboIndicator from '@/components/game/ComboIndicator';
import GameCompleteModal from '@/components/game/GameCompleteModal';
import { BottomNav } from '@/components/layout/BottomNav';
import { OnboardingModal } from '@/components/onboarding/OnboardingModal';
import { Header } from '@/components/layout/Header';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { XCircle, Home, RotateCcw, PlayCircle, PlusCircle } from 'lucide-react';
import { bgmManager } from '@/lib/audio/bgmManager';
import { DIFFICULTY_CONFIGS } from '@/lib/utils/constants';
import { formatTime } from '@/lib/utils/format';
import { kstToday } from '@/lib/game/daily';
import { startWithTicket, hasTicket, finishTicket, leaveTicket } from '@/lib/hub/gb';
import { isRewardedAdReady, showRewardedAd } from '@/lib/monetization/bridge';
import toast from 'react-hot-toast';
import type { Difficulty } from '@/types';

export default function PlayPage() {
  const router = useRouter();
  const status = useGameStore((s) => s.status);
  const startNewGame = useGameStore((s) => s.startNewGame);
  const resetToIdle = useGameStore((s) => s.resetToIdle);
  const getGameResult = useGameStore((s) => s.getGameResult);
  const recordGameResult = useUserStore((s) => s.recordGameResult);
  const recordStreak = useUserStore((s) => s.recordStreak);
  const reviveGame = useGameStore((s) => s.reviveGame);
  const spendCoins = useUserStore((s) => s.spendCoins);
  const coins = useUserStore((s) => s.profile.coins);

  // Bound to a non-`use*` name: it is a store action, not a React hook.
  const runPowerUp = useUserStore((s) => s.usePowerUp);
  const consumeFreeRevive = useUserStore((s) => s.consumeFreeRevive);
  const hasEntitlement = useUserStore((s) => s.hasEntitlement);
  const lastFreeReviveDate = useUserStore((s) => s.profile.lastFreeReviveDate);
  const reviveTickets = useUserStore(
    (s) => s.profile.powerUps.find((p) => p.id === 'revive_ticket')?.count ?? 0,
  );
  const freeReviveAvailable = lastFreeReviveDate !== kstToday();

  // Rewarded ads only exist in a wrapper build with an ad unit configured; on
  // the web this stays false and the free daily continue is offered instead.
  const [adReady, setAdReady] = useState(false);
  useEffect(() => {
    setAdReady(status === 'failed' && isRewardedAdReady(hasEntitlement('removeAds')));
  }, [status, hasEntitlement]);

  const REVIVE_COST = 150;
  const handleRevive = useCallback(() => {
    if (spendCoins(REVIVE_COST)) {
      resultRecorded.current = false;
      reviveGame();
    } else {
      toast('코인이 부족합니다.', { icon: '🪙' });
    }
  }, [spendCoins, reviveGame]);

  const handleTicketRevive = useCallback(() => {
    if (runPowerUp('revive_ticket')) {
      resultRecorded.current = false;
    }
  }, [runPowerUp]);

  const handleFreeRevive = useCallback(() => {
    if (consumeFreeRevive()) {
      resultRecorded.current = false;
      reviveGame();
      toast('오늘의 무료 이어하기를 사용했습니다.', { icon: '🎁' });
    }
  }, [consumeFreeRevive, reviveGame]);

  const handleAdRevive = useCallback(async () => {
    const watched = await showRewardedAd();
    if (watched) {
      resultRecorded.current = false;
      reviveGame();
    } else {
      toast('광고를 끝까지 시청해야 이어할 수 있어요.', { icon: '📺' });
    }
  }, [reviveGame]);

  // On mount: if game was completed/failed, reset to idle for fresh start
  const [showResumeDialog, setShowResumeDialog] = useState(() => {
    const s = useGameStore.getState().status;
    if (s === 'completed' || s === 'failed') {
      useGameStore.getState().resetToIdle();
      return false;
    }
    return s === 'playing' || s === 'paused';
  });

  // Hooks
  useTimer();
  useKeyboard();

  // BGM: start when playing, stop when done or leaving
  const musicEnabled = useUserStore((s) => s.profile.settings.musicEnabled);

  useEffect(() => {
    if (status === 'playing' && musicEnabled) {
      bgmManager.setEnabled(true);
      bgmManager.play();
    } else if (status === 'completed' || status === 'failed' || status === 'idle') {
      bgmManager.stop();
    }

    return () => {
      bgmManager.stop();
    };
  }, [status, musicEnabled]);

  // Record local stats immediately on completion
  const resultRecorded = useRef(false);

  // 학교 점수 정산 — 이기든 지든 판이 끝나면 영수증을 쓴다
  useEffect(() => {
    if (status === 'completed' || status === 'failed') void finishTicket(status === 'completed');
  }, [status]);

  useEffect(() => {
    if (status === 'completed' && !resultRecorded.current) {
      resultRecorded.current = true;
      const result = getGameResult();
      if (result) {
        const puzzleId = useGameStore.getState().puzzle?.id ?? '';
        const isDaily = puzzleId.startsWith('daily-');

        // Update the streak first so this game's reward multiplier and any
        // streak-milestone achievement reflect today's completion immediately.
        recordStreak();
        const outcome = recordGameResult({
          difficulty: result.difficulty,
          timeInSeconds: result.timeInSeconds,
          mistakes: result.mistakes,
          hintsUsed: result.hintsUsed,
          maxCombo: result.maxCombo,
          totalScore: result.totalScore,
          isDaily,
        });

        if (outcome.dailyBonusAwarded) {
          toast(
            `보너스 달성! ${outcome.dailyBonusAwarded.descriptionKo} (+${outcome.dailyBonusAwarded.xp} XP)`,
            { icon: '🎁', duration: 4000 },
          );
        }
        if (outcome.leveledUp) {
          toast(`레벨 ${outcome.newLevel} 달성!`, { icon: '🎉', duration: 4000 });
        }
        for (const ach of outcome.newlyUnlocked) {
          toast(`업적 해금: ${ach.nameKo}`, { icon: ach.icon || '🏆', duration: 4000 });
        }
      }
    }
    if (status === 'idle') {
      resultRecorded.current = false;
    }
  }, [status, getGameResult, recordGameResult, recordStreak]);

  // 판 시작 관문: 홈 «시작하기»에서 받아 온 이용권이 있으면 그대로, 없으면 여기서 받는다(클릭 안에서 바로)
  const handleSelectDifficulty = useCallback(
    (difficulty: Difficulty) => {
      if (hasTicket('classic')) startNewGame(difficulty);
      else startWithTicket('classic', () => startNewGame(difficulty));
    },
    [startNewGame]
  );

  // handleGameComplete is now handled by the useEffect above

  const handleNewGame = useCallback(() => {
    resultRecorded.current = false;
    const difficulty = useGameStore.getState().difficulty;
    startWithTicket('classic', () => {
      resetToIdle();
      startNewGame(difficulty);
    });
  }, [startNewGame, resetToIdle]);

  const handleGoHome = useCallback(() => {
    const s = useGameStore.getState().status;
    if (s === 'playing' || s === 'paused') void leaveTicket();
    resetToIdle();
    router.push('/');
  }, [router, resetToIdle]);

  const handleResume = useCallback(() => {
    setShowResumeDialog(false);
    const s = useGameStore.getState().status;
    if (s === 'paused') {
      useGameStore.getState().resumeGame();
    }
  }, []);

  const handleNewGameFromResume = useCallback(() => {
    setShowResumeDialog(false);
    resetToIdle();
  }, [resetToIdle]);

  // Resume dialog: show when returning to an in-progress game
  if (showResumeDialog && (status === 'playing' || status === 'paused')) {
    const difficulty = useGameStore.getState().difficulty;
    const elapsedTime = useGameStore.getState().elapsedTime;
    const mistakes = useGameStore.getState().mistakes;
    const config = DIFFICULTY_CONFIGS[difficulty];

    return (
      <div className="min-h-screen pb-24 pt-16">
        <Header />
        <main className="mx-auto max-w-lg px-4 pt-4">
          <Modal
            isOpen={true}
            onClose={handleResume}
            title="진행 중인 게임"
          >
            <div className="flex flex-col items-center space-y-4">
              <div className="w-full rounded-xl bg-white/5 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-white/50">난이도</span>
                  <span className="text-sm font-semibold" style={{ color: config.color }}>
                    {config.icon} {config.nameKo}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-white/50">경과 시간</span>
                  <span className="text-sm font-semibold text-white tabular-nums">
                    {formatTime(elapsedTime)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-white/50">실수</span>
                  <span className="text-sm font-semibold text-white">
                    {mistakes} / {config.maxMistakes}
                  </span>
                </div>
              </div>
              <div className="flex w-full gap-3">
                <Button
                  variant="secondary"
                  onClick={handleNewGameFromResume}
                  className="flex-1"
                >
                  <PlusCircle className="h-4 w-4" />
                  새 게임
                </Button>
                <Button
                  variant="primary"
                  onClick={handleResume}
                  className="flex-1"
                >
                  <PlayCircle className="h-4 w-4" />
                  계속하기
                </Button>
              </div>
            </div>
          </Modal>
        </main>
        <BottomNav />
      </div>
    );
  }

  // Idle: show difficulty selector
  if (status === 'idle') {
    return (
      <div className="min-h-screen pb-24 pt-16">
        <OnboardingModal />
        <Header />
        <main className="mx-auto max-w-lg px-4 pt-4">
          <DifficultySelector onSelect={handleSelectDifficulty} />
        </main>
        <BottomNav />
      </div>
    );
  }

  // Generating: the board is being built. Deliberately no controls here — the
  // build blocks the main thread (see scheduleGeneration in gameStore).
  if (status === 'generating') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 pt-16">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-white/10 border-t-indigo-400" />
        <p className="text-sm text-slate-400">퍼즐을 생성하는 중...</p>
      </div>
    );
  }

  // Active game (playing/paused)
  const isGameActive = status === 'playing' || status === 'paused';

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      {/* Game UI */}
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-2 pt-1 pb-2 safe-top">
        <GameHeader />
        <ComboIndicator />
        <div className="flex-1 flex items-center justify-center py-1 min-h-0">
          <SudokuBoard />
        </div>
        <div className="shrink-0 space-y-1.5 pb-5 safe-bottom">
          <GameControls />
          <NumberPad />
        </div>
      </main>

      {/* Completed modal */}
      <GameCompleteModal
        isOpen={status === 'completed'}
        onClose={handleGoHome}
        onNewGame={handleNewGame}
        onGoHome={handleGoHome}
      />

      {/* Failed modal */}
      <Modal
        isOpen={status === 'failed'}
        onClose={handleGoHome}
        title="게임 오버"
      >
        <div className="flex flex-col items-center space-y-4">
          <XCircle className="h-16 w-16 text-red-400" />
          <p className="text-center text-slate-300">
            실수가 너무 많았습니다. 이어서 도전하거나 새로 시작하세요!
          </p>

          {/* Revive paths, cheapest for the player first */}
          {adReady && (
            <Button variant="primary" onClick={handleAdRevive} className="w-full">
              <PlayCircle className="h-4 w-4" />
              광고 보고 이어하기
            </Button>
          )}

          {!adReady && freeReviveAvailable && (
            <Button variant="primary" onClick={handleFreeRevive} className="w-full">
              <PlayCircle className="h-4 w-4" />
              무료 이어하기 (오늘 1회)
            </Button>
          )}

          {reviveTickets > 0 && (
            <Button variant="secondary" onClick={handleTicketRevive} className="w-full">
              🎟️ 부활권 사용 (보유 {reviveTickets})
            </Button>
          )}

          <Button
            variant={adReady || freeReviveAvailable ? 'secondary' : 'primary'}
            onClick={handleRevive}
            className="w-full"
            disabled={coins < REVIVE_COST}
          >
            <PlayCircle className="h-4 w-4" />
            이어하기 (코인 {REVIVE_COST})
          </Button>

          <div className="flex w-full gap-3">
            <Button
              variant="secondary"
              onClick={handleGoHome}
              className="flex-1"
            >
              <Home className="h-4 w-4" />
              홈으로
            </Button>
            <Button
              variant="secondary"
              onClick={handleNewGame}
              className="flex-1"
            >
              <RotateCcw className="h-4 w-4" />
              다시 도전
            </Button>
          </div>
        </div>
      </Modal>

      {/* Hide bottom nav during active game */}
      {!isGameActive && status !== 'completed' && status !== 'failed' && (
        <BottomNav />
      )}
    </div>
  );
}
