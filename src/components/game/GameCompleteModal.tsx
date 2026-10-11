"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trophy, Home, RotateCcw, Star, Zap } from "lucide-react";
import confetti from "canvas-confetti";
import { cn } from "@/lib/utils/cn";
import { formatTime, formatNumber } from "@/lib/utils/format";
import { useGameStore } from "@/lib/store/gameStore";
import { useUserStore } from "@/lib/store/userStore";
import { calculateRewards } from "@/lib/game/scoring";
import { getStreakMultiplier } from "@/lib/game/streak";

interface GameCompleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNewGame: () => void;
  onGoHome: () => void;
}

interface ScoreLine {
  label: string;
  value: number;
  isNegative?: boolean;
}

function AnimatedCounter({
  target,
  duration = 1000,
}: {
  target: number;
  duration?: number;
}) {
  const [animated, setAnimated] = useState(0);

  // Nothing to count up to when the target is zero or negative, so show it
  // outright instead of having the effect set state on the first render.
  const current = target <= 0 ? target : animated;

  useEffect(() => {
    if (target <= 0) return;
    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setAnimated(Math.round(target * eased));
      if (progress >= 1) clearInterval(interval);
    }, 16);
    return () => clearInterval(interval);
  }, [target, duration]);

  return <>{formatNumber(current)}</>;
}

export default function GameCompleteModal({
  isOpen,
  onClose,
  onNewGame,
  onGoHome,
}: GameCompleteModalProps) {
  const gameResult = useGameStore((s) => s.getGameResult);
  const elapsedTime = useGameStore((s) => s.elapsedTime);
  const mistakes = useGameStore((s) => s.mistakes);
  const maxCombo = useGameStore((s) => s.maxCombo);

  const [visibleLines, setVisibleLines] = useState(0);
  const confettiFired = useRef(false);
  const animationStarted = useRef(false);

  const result = gameResult();
  const streakCurrent = useUserStore((s) => s.profile.streak.currentStreak);

  // Preview the exact XP/coins the store will grant (streak multiplier and
  // per-difficulty clamp included) so the display matches the real payout.
  const rewardPreview = result
    ? calculateRewards({
        totalScore: result.totalScore,
        difficulty: result.difficulty,
        streakMultiplier: getStreakMultiplier(streakCurrent),
      })
    : { xp: 0, coins: 0 };

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  // Fire confetti on open
  useEffect(() => {
    if (isOpen && !confettiFired.current) {
      confettiFired.current = true;

      const fireConfetti = () => {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { x: 0.2, y: 0.6 },
          colors: ["#6366F1", "#8B5CF6", "#3B82F6", "#22D3EE", "#FFD700"],
        });
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { x: 0.8, y: 0.6 },
          colors: ["#6366F1", "#8B5CF6", "#3B82F6", "#22D3EE", "#FFD700"],
        });
      };

      fireConfetti();
      setTimeout(fireConfetti, 300);
      setTimeout(fireConfetti, 600);
    }

    if (!isOpen) {
      confettiFired.current = false;
      animationStarted.current = false;
      setVisibleLines(0);
    }
  }, [isOpen]);

  // Sequentially reveal score lines - schedule all timers at once, no cleanup
  const scoreLines: ScoreLine[] = result
    ? [
        { label: "기본 점수", value: result.baseScore },
        { label: "시간 보너스", value: result.timeBonus },
        { label: "콤보 보너스", value: result.comboBonus },
        { label: "퍼펙트 보너스", value: result.perfectBonus },
        {
          label: "실수 패널티",
          value: result.mistakePenalty,
          isNegative: true,
        },
        { label: "힌트 패널티", value: result.hintPenalty, isNegative: true },
      ]
    : [];

  useEffect(() => {
    if (!isOpen || animationStarted.current) return;
    animationStarted.current = true;

    // Schedule all reveals upfront with fixed delays (no cleanup needed)
    const NUM_LINES = 6;
    for (let i = 1; i <= NUM_LINES; i++) {
      setTimeout(() => setVisibleLines(i), 500 + i * 200);
    }
  }, [isOpen]);

  const handleNewGame = useCallback(() => {
    onNewGame();
  }, [onNewGame]);

  const handleGoHome = useCallback(() => {
    onGoHome();
  }, [onGoHome]);

  if (!result) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={handleClose}
        >
          <motion.div
            initial={{ scale: 0.8, opacity: 0, y: 30 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.8, opacity: 0, y: 30 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className={cn(
              "relative w-full max-w-sm max-h-[85dvh] rounded-2xl overflow-y-auto",
              "bg-gradient-to-b from-slate-800 to-slate-900",
              "border border-white/10 shadow-2xl",
            )}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="relative flex flex-col items-center pt-6 pb-4 px-6">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{
                  type: "spring",
                  stiffness: 300,
                  damping: 15,
                  delay: 0.2,
                }}
                className="w-16 h-16 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center mb-3 shadow-lg shadow-yellow-500/30"
              >
                <Trophy className="w-8 h-8 text-white" />
              </motion.div>

              <motion.h2
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="text-xl font-bold text-white"
              >
                퍼즐 완료!
              </motion.h2>

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="text-sm text-white/50 mt-1"
              >
                {formatTime(elapsedTime)} | 실수 {mistakes} | 콤보 {maxCombo}x
              </motion.p>
            </div>

            {/* Score breakdown */}
            <div className="px-6 pb-4 space-y-1.5">
              {scoreLines.map((line, i) => (
                <AnimatePresence key={line.label}>
                  {i < visibleLines && (
                    <motion.div
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.2 }}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="text-white/60">{line.label}</span>
                      <span
                        className={cn(
                          "font-semibold tabular-nums",
                          line.isNegative && line.value > 0
                            ? "text-red-400"
                            : "text-white/80",
                        )}
                      >
                        {line.isNegative && line.value > 0 ? "-" : "+"}
                        {formatNumber(line.value)}
                      </span>
                    </motion.div>
                  )}
                </AnimatePresence>
              ))}

              {/* Divider */}
              {visibleLines >= scoreLines.length && (
                <motion.div
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  className="h-px bg-white/10 my-2"
                />
              )}

              {/* Total score */}
              {visibleLines >= scoreLines.length && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  className="flex items-center justify-between pt-1"
                >
                  <span className="text-base font-bold text-white">
                    총 점수
                  </span>
                  <span className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500 tabular-nums">
                    <AnimatedCounter
                      target={result.totalScore}
                      duration={1200}
                    />
                  </span>
                </motion.div>
              )}
            </div>

            {/* XP and Coins earned */}
            {visibleLines >= scoreLines.length && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="px-6 pb-4"
              >
                <div className="flex items-center gap-4 justify-center">
                  <div className="flex items-center gap-1.5">
                    <Star className="w-4 h-4 text-purple-400" />
                    <span className="text-sm font-semibold text-purple-300 tabular-nums">
                      +{formatNumber(rewardPreview.xp)} XP
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Zap className="w-4 h-4 text-yellow-400" />
                    <span className="text-sm font-semibold text-yellow-300 tabular-nums">
                      +{formatNumber(rewardPreview.coins)} 코인
                    </span>
                  </div>
                </div>
              </motion.div>
            )}


            {/* Action buttons — always reachable, with or without a ranking
                submission, so the modal is never a dead end. */}
            {visibleLines >= scoreLines.length && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="flex gap-3 px-6 pb-6"
              >
                <button
                  type="button"
                  onClick={handleGoHome}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl",
                    "bg-white/10 text-white/80 hover:bg-white/20",
                    "font-semibold transition-all duration-150",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400",
                  )}
                >
                  <Home className="w-4 h-4" />홈
                </button>
                <button
                  type="button"
                  onClick={handleNewGame}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl",
                    "bg-gradient-to-r from-indigo-500 to-purple-600 text-white",
                    "font-semibold shadow-lg shadow-indigo-500/25",
                    "hover:shadow-xl hover:shadow-indigo-500/40",
                    "transition-all duration-150",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400",
                  )}
                >
                  <RotateCcw className="w-4 h-4" />새 게임
                </button>
              </motion.div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
