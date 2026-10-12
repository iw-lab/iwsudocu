'use client';

import { memo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils/cn';
import { useGameStore } from '@/lib/store/gameStore';
import type { GameTheme } from '@/types';

interface SudokuCellProps {
  row: number;
  col: number;
  value: number;
  isGiven: boolean;
  isSelected: boolean;
  isHighlighted: boolean;
  isSameRow: boolean;
  isSameCol: boolean;
  isSameBox: boolean;
  isConflict: boolean;
  isErrorHighlight: boolean;
  /** Sorted, comma-joined notes (stable primitive so React.memo isn't defeated). */
  notesKey: string;
  theme: GameTheme;
}

const SudokuCell = memo(function SudokuCell({
  row,
  col,
  value,
  isGiven,
  isSelected,
  isHighlighted,
  isSameRow,
  isSameCol,
  isSameBox,
  isConflict,
  isErrorHighlight,
  notesKey,
  theme,
}: SudokuCellProps) {
  const selectCell = useGameStore((s) => s.selectCell);
  const notes = notesKey ? notesKey.split(',').map(Number) : [];

  const handleClick = useCallback(() => {
    selectCell(row, col);
  }, [selectCell, row, col]);

  // Determine background color using theme
  const bgColor = isErrorHighlight
    ? '#DC2626'
    : isSelected
      ? theme.selectedBg
      : isConflict
        ? theme.conflictBg
        : isHighlighted
          ? theme.highlightBg
          : isSameRow || isSameCol || isSameBox
            ? theme.highlightBg + '44'
            : theme.cellBg;

  // Border thicknesses for 3x3 box boundaries
  const isThickRight = col === 2 || col === 5;
  const isThickBottom = row === 2 || row === 5;

  return (
    <button
      type="button"
      onClick={handleClick}
      data-row={row}
      data-col={col}
      className={cn(
        'relative flex items-center justify-center aspect-square w-full active:scale-95 [perspective:300px]',
        'transition-colors duration-150 outline-none',
        isErrorHighlight && 'animate-pulse',
        'focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-400',
        isThickRight ? 'border-r-2' : 'border-r',
        isThickBottom ? 'border-b-2' : 'border-b',
        isSelected && 'ring-2 ring-inset ring-blue-400',
      )}
      style={{
        backgroundColor: bgColor,
        borderRightColor: isThickRight ? theme.accentColor + '80' : theme.borderColor + '80',
        borderBottomColor: isThickBottom ? theme.accentColor + '80' : theme.borderColor + '80',
      }}
      aria-label={`Cell row ${row + 1} column ${col + 1}${value ? `, value ${value}` : ', empty'}`}
    >
      <AnimatePresence mode="popLayout">
        {value !== 0 ? (
          <motion.span
            key={`val-${value}`}
            // 손맛: 놓은 숫자는 카드처럼 뒤집히며 나타난다(주어진 칸은 처음부터 그대로)
            initial={isGiven ? false : { rotateX: -90, scale: 0.8, opacity: 0 }}
            animate={{ rotateX: 0, scale: 1, opacity: 1 }}
            exit={{ scale: 0.5, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 520, damping: 22 }}
            className={cn(
              'sudoku-cell-value',
              'text-lg sm:text-xl md:text-2xl lg:text-3xl font-bold select-none leading-none',
              // Non-color cues (WCAG 1.4.1): given cells are heavier; wrong
              // entries are underlined so color isn't the only error signal.
              isGiven ? 'font-black' : 'font-semibold',
              isConflict && !isGiven && 'underline decoration-2 underline-offset-2',
            )}
            style={{
              color: isConflict && !isGiven
                ? '#f87171'
                : isGiven
                  ? theme.givenColor
                  : theme.inputColor,
            }}
          >
            {value}
          </motion.span>
        ) : notes.length > 0 ? (
          <motion.div
            key="notes"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="grid grid-cols-3 grid-rows-3 w-full h-full p-px"
          >
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
              <span
                key={n}
                className="sudoku-cell-note flex items-center justify-center text-[9px] sm:text-[10px] md:text-[11px] font-semibold leading-none select-none"
                style={{
                  color: notes.includes(n)
                    ? '#7DD3FC'
                    : 'transparent',
                }}
              >
                {n}
              </span>
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </button>
  );
});

export default SudokuCell;
