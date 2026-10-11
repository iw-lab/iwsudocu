'use client';

import { useEffect, useRef } from 'react';
import { Heart, Maximize, Pause, Play } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils/cn';
import { formatTime } from '@/lib/utils/format';
import { DIFFICULTY_CONFIGS } from '@/lib/utils/constants';
import { useGameStore } from '@/lib/store/gameStore';
import { bindFullscreen } from '@/lib/hub/gb';

export default function GameHeader() {
  const difficulty = useGameStore((s) => s.difficulty);
  const elapsedTime = useGameStore((s) => s.elapsedTime);
  const mistakes = useGameStore((s) => s.mistakes);
  const maxMistakes = useGameStore((s) => s.maxMistakes);
  const status = useGameStore((s) => s.status);
  const pauseGame = useGameStore((s) => s.pauseGame);
  const resumeGame = useGameStore((s) => s.resumeGame);

  const config = DIFFICULTY_CONFIGS[difficulty];
  const isPaused = status === 'paused';
  const remainingLives = maxMistakes - mistakes;
  const fsRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    void bindFullscreen(fsRef.current);
  }, []);

  return (
    <div className="flex items-center justify-between w-full max-w-[420px] mx-auto px-2 py-2">
      {/* Difficulty badge */}
      <motion.div
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        className="flex items-center"
      >
        <span
          className="px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wider"
          style={{
            backgroundColor: `${config.color}20`,
            color: config.color,
            border: `1px solid ${config.color}40`,
          }}
        >
          {config.nameKo}
        </span>
      </motion.div>

      {/* Timer */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-2"
      >
        <span
          className={cn(
            'font-mono text-lg font-semibold tabular-nums',
            isPaused ? 'blur-sm text-white/40' : 'text-white/90',
          )}
        >
          {formatTime(elapsedTime)}
        </span>
      </motion.div>

      {/* Mistakes as hearts + Pause */}
      <motion.div
        initial={{ opacity: 0, x: 10 }}
        animate={{ opacity: 1, x: 0 }}
        className="flex items-center gap-3"
      >
        {/* Hearts */}
        <div className="flex items-center gap-0.5">
          {Array.from({ length: maxMistakes }).map((_, i) => (
            <Heart
              key={i}
              className={cn(
                'w-4 h-4 transition-colors duration-300',
                i < remainingLives
                  ? 'fill-red-500 text-red-500'
                  : 'fill-none text-slate-600',
              )}
            />
          ))}
        </div>

        {/* 전체화면(기본틀: 홈 머리줄 + 게임 상단 둘 다) */}
        <button
          ref={fsRef}
          type="button"
          data-gb="fullscreen"
          aria-label="전체화면"
          className="grid h-11 w-11 place-items-center rounded-lg bg-white/10 text-white/70 hover:bg-white/20 hover:text-white"
        >
          <Maximize className="w-4 h-4" />
        </button>

        {/* Pause / Resume button */}
        <button
          type="button"
          onClick={isPaused ? resumeGame : pauseGame}
          className={cn(
            'grid h-11 w-11 place-items-center rounded-lg',
            'bg-white/10 hover:bg-white/20 text-white/70 hover:text-white',
            'transition-all duration-150',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400',
          )}
          aria-label={isPaused ? 'Resume' : 'Pause'}
        >
          {isPaused ? (
            <Play className="w-4 h-4" />
          ) : (
            <Pause className="w-4 h-4" />
          )}
        </button>
      </motion.div>
    </div>
  );
}
