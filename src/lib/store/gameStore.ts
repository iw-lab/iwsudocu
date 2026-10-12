import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  CellValue,
  Difficulty,
  Board,
  Puzzle,
  ComboState,
  GameAction,
  GameStatus,
  Notes,
} from '@/types';
import { generatePuzzle, generateDailyPuzzle } from '@/lib/sudoku/generator';
import { isCellCorrect, isBoardComplete } from '@/lib/sudoku/validator';
import { getHint } from '@/lib/sudoku/solver';
import { calculateFinalScore } from '@/lib/game/scoring';
import { kstToday } from '@/lib/game/daily';
import {
  updateComboOnCorrect,
  resetCombo,
  createInitialComboState,
  getComboTier,
  isComboExpired,
} from '@/lib/game/combo';
import { soundManager } from '@/lib/audio/soundManager';
import { DIFFICULTY_CONFIGS } from '@/lib/utils/constants';
import { hapticLight, hapticMedium, hapticSuccess, hapticError, hapticHeavy } from '@/lib/utils/haptic';
import { checkCompletions } from '@/lib/game/celebrations';
import { getJuice, elementCenter } from '@/lib/juice';
import toast from 'react-hot-toast';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createEmptyBoard(): Board {
  return Array.from({ length: 9 }, () => Array(9).fill(0) as CellValue[]);
}

function createEmptyNotes(): Notes {
  return Array.from({ length: 9 }, () =>
    Array.from({ length: 9 }, () => new Set<number>()),
  );
}

function cloneBoard(board: Board): Board {
  return board.map((row) => [...row]) as Board;
}

function cloneNotes(notes: Notes): Notes {
  return notes.map((row) => row.map((cell) => new Set(cell)));
}

/**
 * Monotonic clock reading. Immune to system-clock changes, so elapsed time and
 * combo windows cannot be manipulated by rewinding the device clock.
 */
function perfNow(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

/** Remove a candidate number from all notes in the same row, column, and box. */
function removeNoteFromPeers(
  notes: Notes,
  row: number,
  col: number,
  num: number,
): Notes {
  const next = cloneNotes(notes);

  // Row
  for (let c = 0; c < 9; c++) {
    next[row][c].delete(num);
  }
  // Column
  for (let r = 0; r < 9; r++) {
    next[r][col].delete(num);
  }
  // Box
  const boxRow = Math.floor(row / 3) * 3;
  const boxCol = Math.floor(col / 3) * 3;
  for (let r = boxRow; r < boxRow + 3; r++) {
    for (let c = boxCol; c < boxCol + 3; c++) {
      next[r][c].delete(num);
    }
  }

  return next;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Fallback lives before a difficulty is chosen. Per-difficulty values live in
// DIFFICULTY_CONFIGS[difficulty].maxMistakes and are applied when a game starts.
const MAX_MISTAKES = 5;
const MAX_HINTS = 3;
const MAX_HISTORY = 300;

/** Append an action to history, truncating redo tail and capping total length. */
function appendHistory(history: GameAction[], historyIndex: number, action: GameAction) {
  let next = [...history.slice(0, historyIndex + 1), action];
  if (next.length > MAX_HISTORY) next = next.slice(next.length - MAX_HISTORY);
  return { history: next, historyIndex: next.length - 1 };
}

// ---------------------------------------------------------------------------
// Deferred puzzle generation
// ---------------------------------------------------------------------------
// A true Web Worker isn't reliable under Next's static (output: export) +
// Turbopack build — the worker ships as raw TS and fails to load. Instead we
// paint the "generating" spinner first, then generate on the next frame.
//
// Generation still runs on the main thread and blocks it. Only Master is worth
// noting — p50 ~100 ms, p95 ~280 ms here, held under ~800 ms on much slower
// hardware by GENERATION_BUDGET_MS; every other tier is under 10 ms. That is
// left as-is deliberately: this screen has no controls to press, and the
// spinner animates `transform` only, which the compositor keeps ticking while
// the main thread is busy. If either stops being true, chunk pickBest's retry
// loop rather than the whole call — Master is ~135 attempts of ~0.5 ms, so it
// slices finely.

let genRequestId = 0;

// 🔴 rAF 만 믿으면 숨은 탭(창 가림·최소화)에서 생성이 영영 안 일어난다(2026-07-26 실측 cells=0).
//    한 프레임 그릴 기회를 주되, 120ms 안에 프레임이 안 오면 타이머가 대신 돌린다 — 먼저 오는 쪽 한 번만.
function scheduleGeneration(run: () => void) {
  let done = false;
  const once = () => {
    if (done) return;
    done = true;
    run();
  };
  const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
  if (typeof requestAnimationFrame !== 'undefined' && !hidden) {
    requestAnimationFrame(() => setTimeout(once, 0));
  }
  setTimeout(once, 120);
}

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

export interface GameStore {
  // --- State ---
  puzzle: Puzzle | null;
  currentBoard: Board;
  notes: Notes;
  selectedCell: { row: number; col: number } | null;
  history: GameAction[];
  historyIndex: number;
  status: GameStatus;
  /** Wall-clock start (Date.now) — kept only for puzzle id / display, never for scoring. */
  startTime: number;
  /** Committed play time in ms from finished run segments (pauses/freezes). */
  accumulatedMs: number;
  /** Monotonic timestamp when the current active run segment started (0 = inactive). */
  runStartPerf: number;
  elapsedTime: number;
  mistakes: number;
  maxMistakes: number;
  hintsUsed: number;
  maxHints: number;
  score: number;
  isNotesMode: boolean;
  highlightedNumber: CellValue;
  difficulty: Difficulty;
  combo: ComboState;
  maxCombo: number;

  // --- Power-up state (monotonic timestamps) ---
  frozenUntilPerf: number;
  comboBoostUntilPerf: number;
  errorHighlights: { row: number; col: number }[];

  // --- Leaderboard anti-cheat session token ---
  sessionToken: string | null;
  requestSession: (difficulty: Difficulty) => void;

  // --- Actions ---
  startNewGame: (difficulty: Difficulty) => void;
  startDailyChallenge: () => void;
  pauseGame: () => void;
  resumeGame: () => void;
  selectCell: (row: number, col: number) => void;
  clearSelection: () => void;
  placeNumber: (num: number) => void;
  eraseNumber: () => void;
  toggleNote: (num: number) => void;
  toggleNotesMode: () => void;
  undo: () => void;
  redo: () => void;
  useHint: () => void;
  tick: () => void;
  checkCompletion: () => boolean;

  // --- Power-up actions ---
  revealCell: () => void;
  checkBoardErrors: () => void;
  freezeTimer: () => void;
  activateComboBoost: () => void;
  undoMistake: () => void;
  grantHints: (amount: number) => void;
  reviveGame: () => void;
  resetToIdle: () => void;
  getGameResult: () => {
    difficulty: Difficulty;
    timeInSeconds: number;
    mistakes: number;
    hintsUsed: number;
    maxCombo: number;
    baseScore: number;
    timeBonus: number;
    comboBonus: number;
    perfectBonus: number;
    mistakePenalty: number;
    hintPenalty: number;
    totalScore: number;
  } | null;
}

// ---------------------------------------------------------------------------
// Initial state factory
// ---------------------------------------------------------------------------

function getInitialState() {
  return {
    puzzle: null as Puzzle | null,
    currentBoard: createEmptyBoard(),
    notes: createEmptyNotes(),
    selectedCell: null as { row: number; col: number } | null,
    history: [] as GameAction[],
    historyIndex: -1,
    status: 'idle' as GameStatus,
    startTime: 0,
    accumulatedMs: 0,
    runStartPerf: 0,
    elapsedTime: 0,
    mistakes: 0,
    maxMistakes: MAX_MISTAKES,
    hintsUsed: 0,
    maxHints: MAX_HINTS,
    score: 0,
    isNotesMode: false,
    highlightedNumber: 0 as CellValue,
    difficulty: 'medium' as Difficulty,
    combo: createInitialComboState(),
    maxCombo: 0,
    frozenUntilPerf: 0,
    comboBoostUntilPerf: 0,
    errorHighlights: [],
    sessionToken: null as string | null,
  };
}

/** Current elapsed play time in ms, derived from the monotonic clock. */
function computeElapsedMs(state: {
  accumulatedMs: number;
  runStartPerf: number;
  frozenUntilPerf: number;
}): number {
  if (state.runStartPerf <= 0) return state.accumulatedMs;
  const now = perfNow();
  if (state.frozenUntilPerf > now) return state.accumulatedMs;
  return state.accumulatedMs + (now - state.runStartPerf);
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

// Set instances don't survive JSON — tag them on write, revive on read.
const jsonReplacer = (_key: string, value: unknown) =>
  value instanceof Set ? { __t: 'set', v: [...value] } : value;
const jsonReviver = (_key: string, value: unknown) => {
  if (value && typeof value === 'object' && (value as { __t?: string }).__t === 'set') {
    return new Set((value as { v: number[] }).v);
  }
  return value;
};

export const useGameStore = create<GameStore>()(
  persist(
    (set, get) => ({
  ...getInitialState(),

  // -----------------------------------------------------------------------
  // Game lifecycle
  // -----------------------------------------------------------------------

  startNewGame: (difficulty: Difficulty) => {
    const applyPuzzle = (board: Board, solution: Board) => {
      const puzzleObj: Puzzle = {
        id: `${difficulty}-${Date.now()}`,
        board,
        solution,
        difficulty,
        createdAt: new Date().toISOString(),
      };
      set({
        ...getInitialState(),
        puzzle: puzzleObj,
        currentBoard: cloneBoard(board),
        difficulty,
        maxMistakes: DIFFICULTY_CONFIGS[difficulty].maxMistakes,
        status: 'playing',
        startTime: Date.now(),
        runStartPerf: perfNow(),
      });
      get().requestSession(difficulty);
    };

    // Paint the generating spinner, then build on the next frame.
    set({ ...getInitialState(), difficulty, status: 'generating' });
    const id = ++genRequestId;
    scheduleGeneration(() => {
      if (get().status !== 'generating' || genRequestId !== id) return;
      const { puzzle, solution } = generatePuzzle(difficulty);
      applyPuzzle(puzzle, solution);
    });
  },

  requestSession: (difficulty: Difficulty) => {
    // 자유 닉네임 랭킹(서버 제출)을 걷어냈다 — 학교 순위는 키트 허브가 맡는다. 호출부 호환용으로만 남긴다.
    void difficulty;
  },

  startDailyChallenge: () => {
    const dateStr = kstToday();

    const applyDaily = (board: Board, solution: Board) => {
      const puzzleObj: Puzzle = {
        id: `daily-${dateStr}`,
        board,
        solution,
        difficulty: 'medium',
        createdAt: new Date().toISOString(),
        seed: parseInt(dateStr.replace(/-/g, ''), 10),
      };
      set({
        ...getInitialState(),
        puzzle: puzzleObj,
        currentBoard: cloneBoard(board),
        difficulty: 'medium',
        maxMistakes: DIFFICULTY_CONFIGS['medium'].maxMistakes,
        status: 'playing',
        startTime: Date.now(),
        runStartPerf: perfNow(),
      });
      get().requestSession('medium');
    };

    set({ ...getInitialState(), difficulty: 'medium', status: 'generating' });
    const id = ++genRequestId;
    scheduleGeneration(() => {
      if (get().status !== 'generating' || genRequestId !== id) return;
      const { puzzle, solution } = generateDailyPuzzle(dateStr);
      applyDaily(puzzle, solution);
    });
  },

  pauseGame: () => {
    const { status, accumulatedMs, runStartPerf, frozenUntilPerf } = get();
    if (status === 'playing') {
      // Commit the current run segment so paused time is excluded from elapsed.
      const now = perfNow();
      const segment = runStartPerf > 0 && frozenUntilPerf <= now ? now - runStartPerf : 0;
      set({ status: 'paused', accumulatedMs: accumulatedMs + segment, runStartPerf: 0 });
    }
  },

  resumeGame: () => {
    const { status } = get();
    if (status === 'paused') {
      set({ status: 'playing', runStartPerf: perfNow() });
    }
  },

  // -----------------------------------------------------------------------
  // Cell selection
  // -----------------------------------------------------------------------

  selectCell: (row: number, col: number) => {
    const { currentBoard } = get();
    const value = currentBoard[row][col];
    soundManager.play('tap');
    hapticLight();
    set({
      selectedCell: { row, col },
      highlightedNumber: value,
    });
  },

  clearSelection: () => {
    set({ selectedCell: null, highlightedNumber: 0 as CellValue });
  },

  // -----------------------------------------------------------------------
  // Number placement
  // -----------------------------------------------------------------------

  placeNumber: (num: number) => {
    const {
      puzzle,
      currentBoard,
      notes,
      selectedCell,
      status,
      isNotesMode,
      history,
      historyIndex,
      mistakes,
      maxMistakes,
      hintsUsed,
      combo,
      maxCombo,
    } = get();

    if (!puzzle || !selectedCell || status !== 'playing') return;

    const { row, col } = selectedCell;

    // Cannot modify given cells
    if (puzzle.board[row][col] !== 0) return;

    // Notes mode: toggle note instead
    if (isNotesMode) {
      get().toggleNote(num);
      return;
    }

    const prevValue = currentBoard[row][col];
    const prevNotes = Array.from(notes[row][col]);

    // Create action for history (truncate any redo history). The progression
    // snapshot captures state BEFORE this move so undo restores it exactly,
    // preventing undo→re-place combo farming.
    const action: GameAction = {
      type: 'place',
      row,
      col,
      prevValue: prevValue as CellValue,
      newValue: num as CellValue,
      prevNotes,
      newNotes: [],
      timestamp: Date.now(),
      prevCombo: { ...combo },
      prevMaxCombo: maxCombo,
      prevMistakes: mistakes,
      prevHintsUsed: hintsUsed,
    };
    const { history: newHistory } = appendHistory(history, historyIndex, action);

    // Place the number
    const newBoard = cloneBoard(currentBoard);
    newBoard[row][col] = num as CellValue;

    // Clear notes on this cell
    let newNotes = cloneNotes(notes);
    newNotes[row][col].clear();

    // Check correctness
    const correct = isCellCorrect(newBoard, puzzle.solution, row, col);

    if (correct) {
      // Auto-remove this number from notes in same row/col/box
      newNotes = removeNoteFromPeers(newNotes, row, col, num);

      // Update combo (with boost if active). Uses the monotonic clock so the
      // combo window can't be manipulated via the system clock. Expiry is also
      // evaluated here — not just in tick() — so a combo that lapsed while the
      // tab was throttled restarts at 1 instead of continuing.
      const nowPerf = perfNow();
      const activeCombo = isComboExpired(combo, nowPerf) ? resetCombo() : combo;
      let newCombo = updateComboOnCorrect(activeCombo, nowPerf);
      if (get().comboBoostUntilPerf > nowPerf) {
        newCombo = { ...newCombo, multiplier: newCombo.multiplier * 2 };
      }
      const newMaxCombo = Math.max(maxCombo, newCombo.current);

      // 반응 키트 — 소리 1번만(기존 soundManager.play 를 J.fire 의 sfx 갈래로 옮김) + 튀는 숫자·HUD 펀치·자체 콤보 과장(연속마다 음 상승·3/5/10 에서 추가 배너)
      const tier = getComboTier(newCombo.current);
      getJuice()?.fire('correct', {
        sfx: tier.sound || 'correct',
        ...elementCenter(`[data-row="${row}"][data-col="${col}"]`),
        text: `+${num}`,
        punch: '.gbj-timer',
      });

      hapticMedium();
      hapticSuccess();

      set({
        currentBoard: newBoard,
        notes: newNotes,
        history: newHistory,
        historyIndex: newHistory.length - 1,
        combo: newCombo,
        maxCombo: newMaxCombo,
        highlightedNumber: num as CellValue,
      });

      // Check for completion celebrations (row/col/box/number) — only real,
      // solution-matching completions trigger a celebration.
      const completions = checkCompletions(newBoard, row, col, puzzle.solution);
      for (const c of completions) {
        if (c.type === 'number') {
          toast(`숫자 ${c.index} 완성!`, { icon: '🎯' });
        } else if (c.type === 'row') {
          toast(`${c.index + 1}행 완성!`, { icon: '✨' });
        } else if (c.type === 'column') {
          toast(`${c.index + 1}열 완성!`, { icon: '✨' });
        } else if (c.type === 'box') {
          toast('박스 완성!', { icon: '🎉' });
        }
      }
      // 줄/칸/숫자 완성 — «큰 성공» 취급(펑+배너+화면 번쩍). 기존 soundManager.play 를 J.fire 의 sfx 갈래로 옮김(중복 재생 방지)
      if (completions.length > 0) {
        const big = completions.find((c) => c.type === 'number')
          ? '숫자 완성!'
          : completions.find((c) => c.type === 'box')
            ? '박스 완성!'
            : completions.length > 1
              ? `${completions.length}개 완성!`
              : completions[0].type === 'row'
                ? `${completions[0].index + 1}행 완성!`
                : `${completions[0].index + 1}열 완성!`;
        getJuice()?.fire('unitComplete', { sfx: 'dailyComplete', text: big });
      }

      // Check if game is complete
      get().checkCompletion();
    } else {
      // Wrong placement
      const newMistakes = mistakes + 1;
      const newCombo = resetCombo();

      getJuice()?.fire('wrong', {
        sfx: 'wrong',
        ...elementCenter(`[data-row="${row}"][data-col="${col}"]`),
        punch: '.gbj-hearts',
      });
      hapticMedium();
      hapticError();
      if (combo.current > 0) {
        soundManager.play('comboBreak');
      }

      set({
        currentBoard: newBoard,
        notes: newNotes,
        history: newHistory,
        historyIndex: newHistory.length - 1,
        mistakes: newMistakes,
        combo: newCombo,
        highlightedNumber: num as CellValue,
      });

      // Check if game failed — freeze the clock so revive resumes from the
      // exact game-over time, not inflated by idle time on the failed screen.
      if (newMistakes >= maxMistakes) {
        soundManager.play('wrong');
        hapticHeavy();
        const elapsedMs = computeElapsedMs(get());
        set({
          status: 'failed',
          accumulatedMs: elapsedMs,
          elapsedTime: Math.max(0, Math.floor(elapsedMs / 1000)),
          runStartPerf: 0,
        });
      }
    }
  },

  // -----------------------------------------------------------------------
  // Erase
  // -----------------------------------------------------------------------

  eraseNumber: () => {
    const { puzzle, currentBoard, notes, selectedCell, status, history, historyIndex, combo, maxCombo, mistakes, hintsUsed } = get();

    if (!puzzle || !selectedCell || status !== 'playing') return;

    const { row, col } = selectedCell;

    // Cannot erase given cells
    if (puzzle.board[row][col] !== 0) return;

    const prevValue = currentBoard[row][col];
    // Nothing to erase
    if (prevValue === 0 && notes[row][col].size === 0) return;

    const prevNotesList = Array.from(notes[row][col]);

    const action: GameAction = {
      type: 'erase',
      row,
      col,
      prevValue: prevValue as CellValue,
      newValue: 0 as CellValue,
      prevNotes: prevNotesList,
      newNotes: [],
      timestamp: Date.now(),
      prevCombo: { ...combo },
      prevMaxCombo: maxCombo,
      prevMistakes: mistakes,
      prevHintsUsed: hintsUsed,
    };
    const { history: newHistory } = appendHistory(history, historyIndex, action);

    const newBoard = cloneBoard(currentBoard);
    newBoard[row][col] = 0;

    const newNotes = cloneNotes(notes);
    newNotes[row][col].clear();

    soundManager.play('undo');

    set({
      currentBoard: newBoard,
      notes: newNotes,
      history: newHistory,
      historyIndex: newHistory.length - 1,
      highlightedNumber: 0 as CellValue,
    });
  },

  // -----------------------------------------------------------------------
  // Notes
  // -----------------------------------------------------------------------

  toggleNote: (num: number) => {
    const { puzzle, currentBoard, notes, selectedCell, status, history, historyIndex, combo, maxCombo, mistakes, hintsUsed } = get();

    if (!puzzle || status !== 'playing') return;

    if (!selectedCell) {
      toast('셀을 먼저 선택해주세요', { icon: '👆' });
      return;
    }

    const { row, col } = selectedCell;

    // Cannot add notes to given cells or cells that already have a value
    if (puzzle.board[row][col] !== 0 || currentBoard[row][col] !== 0) return;

    const prevNotesList = Array.from(notes[row][col]);
    const newNotes = cloneNotes(notes);

    if (newNotes[row][col].has(num)) {
      newNotes[row][col].delete(num);
    } else {
      newNotes[row][col].add(num);
    }

    const newNotesList = Array.from(newNotes[row][col]);

    const action: GameAction = {
      type: 'note',
      row,
      col,
      prevValue: 0 as CellValue,
      newValue: 0 as CellValue,
      prevNotes: prevNotesList,
      newNotes: newNotesList,
      timestamp: Date.now(),
      prevCombo: { ...combo },
      prevMaxCombo: maxCombo,
      prevMistakes: mistakes,
      prevHintsUsed: hintsUsed,
    };
    const { history: newHistory } = appendHistory(history, historyIndex, action);

    soundManager.play('tap');

    set({
      notes: newNotes,
      history: newHistory,
      historyIndex: newHistory.length - 1,
    });
  },

  toggleNotesMode: () => {
    const newMode = !get().isNotesMode;
    soundManager.play('tap');
    hapticLight();
    set({ isNotesMode: newMode });
  },

  // -----------------------------------------------------------------------
  // Undo / Redo
  // -----------------------------------------------------------------------

  undo: () => {
    const { history, historyIndex, currentBoard, notes, status, puzzle } = get();

    if (historyIndex < 0 || status !== 'playing' || !puzzle) return;

    const action = history[historyIndex];
    const newBoard = cloneBoard(currentBoard);
    const newNotes = cloneNotes(notes);

    // Restore previous state
    newBoard[action.row][action.col] = action.prevValue;
    if (action.prevNotes) {
      newNotes[action.row][action.col] = new Set(action.prevNotes);
    }

    soundManager.play('undo');

    // Restore the pre-action combo snapshot so undo can't farm combo. Mistakes
    // and hints are deliberately NOT restored: undoing a wrong entry or a hint
    // must not refund its cost (otherwise mistakes/hints could be zeroed out by
    // undo→re-enter, forging perfect/no-hint bonuses).
    set({
      currentBoard: newBoard,
      notes: newNotes,
      historyIndex: historyIndex - 1,
      highlightedNumber: action.prevValue,
      ...(action.prevCombo ? { combo: { ...action.prevCombo } } : {}),
      ...(action.prevMaxCombo !== undefined ? { maxCombo: action.prevMaxCombo } : {}),
    });
  },

  redo: () => {
    const { history, historyIndex, currentBoard, notes, status, puzzle } = get();

    if (historyIndex >= history.length - 1 || status !== 'playing' || !puzzle) return;

    const action = history[historyIndex + 1];
    const newBoard = cloneBoard(currentBoard);
    const newNotes = cloneNotes(notes);

    newBoard[action.row][action.col] = action.newValue;
    if (action.newNotes) {
      newNotes[action.row][action.col] = new Set(action.newNotes);
    }

    soundManager.play('tap');

    // Re-applying an action never restores a combo (that would resurrect a
    // farmed combo). Mistakes/hints are left as-is — they were never refunded
    // by undo, so there's nothing to re-charge here.
    set({
      currentBoard: newBoard,
      notes: newNotes,
      historyIndex: historyIndex + 1,
      highlightedNumber: action.newValue,
      combo: resetCombo(),
    });
  },

  // -----------------------------------------------------------------------
  // Hint
  // -----------------------------------------------------------------------

  useHint: () => {
    const {
      puzzle,
      currentBoard,
      notes,
      hintsUsed,
      maxHints,
      status,
      history,
      historyIndex,
      combo,
      maxCombo,
      mistakes,
    } = get();

    if (!puzzle || status !== 'playing' || hintsUsed >= maxHints) return;

    const hint = getHint(currentBoard, puzzle.solution);
    if (!hint) return;

    const { row, col, value } = hint;
    const prevValue = currentBoard[row][col];
    const prevNotesList = Array.from(notes[row][col]);

    const action: GameAction = {
      type: 'hint',
      row,
      col,
      prevValue: prevValue as CellValue,
      newValue: value,
      prevNotes: prevNotesList,
      newNotes: [],
      timestamp: Date.now(),
      prevCombo: { ...combo },
      prevMaxCombo: maxCombo,
      prevMistakes: mistakes,
      prevHintsUsed: hintsUsed,
    };
    const { history: newHistory } = appendHistory(history, historyIndex, action);

    const newBoard = cloneBoard(currentBoard);
    newBoard[row][col] = value;

    // Clear notes and remove from peers
    let newNotes = cloneNotes(notes);
    newNotes[row][col].clear();
    newNotes = removeNoteFromPeers(newNotes, row, col, value);

    // Hints reset combo
    const newCombo = resetCombo();

    getJuice()?.fire('powerup', { sfx: 'hint', ...elementCenter(`[data-row="${row}"][data-col="${col}"]`), punch: '.gbj-hearts' });
    if (combo.current > 0) {
      soundManager.play('comboBreak');
    }

    set({
      currentBoard: newBoard,
      notes: newNotes,
      history: newHistory,
      historyIndex: newHistory.length - 1,
      hintsUsed: hintsUsed + 1,
      combo: newCombo,
      selectedCell: { row, col },
      highlightedNumber: value,
    });

    // Check completion after hint
    get().checkCompletion();
  },

  // -----------------------------------------------------------------------
  // Timer tick
  // -----------------------------------------------------------------------

  tick: () => {
    const state = get();
    const { status, combo, frozenUntilPerf, runStartPerf, accumulatedMs } = state;

    if (status !== 'playing') return;

    const now = perfNow();

    // When a freeze expires, restart the active segment so the frozen span is
    // excluded from elapsed time (no clock-arithmetic hacks).
    let nextRunStart = runStartPerf;
    if (frozenUntilPerf > 0 && now >= frozenUntilPerf) {
      set({ frozenUntilPerf: 0, runStartPerf: now });
      nextRunStart = now;
    }

    const elapsedMs = computeElapsedMs({
      accumulatedMs,
      runStartPerf: nextRunStart,
      frozenUntilPerf: get().frozenUntilPerf,
    });
    const elapsed = Math.max(0, Math.floor(elapsedMs / 1000));

    // Combo expiry judged by real elapsed time since the last correct entry.
    let newCombo = combo;
    if (isComboExpired(combo, now)) {
      if (combo.current > 0) soundManager.play('comboBreak');
      newCombo = resetCombo();
    }

    set({
      elapsedTime: elapsed,
      combo: newCombo,
    });
  },

  // -----------------------------------------------------------------------
  // Completion check
  // -----------------------------------------------------------------------

  checkCompletion: (): boolean => {
    const { puzzle, currentBoard, status } = get();

    if (!puzzle || status !== 'playing') return false;

    const complete = isBoardComplete(currentBoard, puzzle.solution);

    if (complete) {
      // 판 전체 완성 — 가장 큰 순간(배너+화면 번쩍+진동). hapticHeavy 와 같은 패턴을 vib 로 넘겨 중복 진동을 막는다.
      getJuice()?.fire('puzzleComplete', { sfx: 'complete', title: '퍼즐 완료!', vib: [10, 30, 10, 30, 50] });

      // Freeze final elapsed time from the monotonic clock before scoring.
      const finalElapsed = Math.max(0, Math.floor(computeElapsedMs(get()) / 1000));
      set({ elapsedTime: finalElapsed, runStartPerf: 0 });

      const result = get().getGameResult();
      set({
        status: 'completed',
        score: result?.totalScore ?? 0,
      });
    }

    return complete;
  },

  // -----------------------------------------------------------------------
  // Game result
  // -----------------------------------------------------------------------

  getGameResult: () => {
    const { puzzle, elapsedTime, mistakes, hintsUsed, maxCombo, difficulty } = get();

    if (!puzzle) return null;

    const scoreResult = calculateFinalScore({
      difficulty,
      timeInSeconds: elapsedTime,
      mistakes,
      hintsUsed,
      maxCombo,
    });

    return {
      difficulty,
      timeInSeconds: elapsedTime,
      mistakes,
      hintsUsed,
      maxCombo,
      ...scoreResult,
    };
  },

  // -----------------------------------------------------------------------
  // Power-up actions
  // -----------------------------------------------------------------------

  revealCell: () => {
    const { puzzle, currentBoard, notes, status, history, historyIndex, combo, maxCombo, mistakes, hintsUsed } = get();
    if (!puzzle || status !== 'playing') return;

    // Find all empty cells
    const emptyCells: { row: number; col: number }[] = [];
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (currentBoard[r][c] === 0 && puzzle.board[r][c] === 0) {
          emptyCells.push({ row: r, col: c });
        }
      }
    }
    if (emptyCells.length === 0) return;

    // Pick a random empty cell
    const target = emptyCells[Math.floor(Math.random() * emptyCells.length)];
    const value = puzzle.solution[target.row][target.col];
    const prevNotesList = Array.from(notes[target.row][target.col]);

    const action: GameAction = {
      type: 'hint',
      row: target.row,
      col: target.col,
      prevValue: 0 as CellValue,
      newValue: value,
      prevNotes: prevNotesList,
      newNotes: [],
      timestamp: Date.now(),
      prevCombo: { ...combo },
      prevMaxCombo: maxCombo,
      prevMistakes: mistakes,
      prevHintsUsed: hintsUsed,
    };
    const { history: newHistory } = appendHistory(history, historyIndex, action);

    const newBoard = cloneBoard(currentBoard);
    newBoard[target.row][target.col] = value;

    let newNotes = cloneNotes(notes);
    newNotes[target.row][target.col].clear();
    newNotes = removeNoteFromPeers(newNotes, target.row, target.col, value);

    getJuice()?.fire('powerup', { sfx: 'hint', ...elementCenter(`[data-row="${target.row}"][data-col="${target.col}"]`), punch: '.gbj-hearts' });
    hapticSuccess();
    toast('셀이 공개되었습니다!', { icon: '🔍' });

    set({
      currentBoard: newBoard,
      notes: newNotes,
      history: newHistory,
      historyIndex: newHistory.length - 1,
      selectedCell: target,
      highlightedNumber: value,
    });

    get().checkCompletion();
  },

  checkBoardErrors: () => {
    const { puzzle, currentBoard, status } = get();
    if (!puzzle || status !== 'playing') return;

    const errors: { row: number; col: number }[] = [];
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (currentBoard[r][c] !== 0 && currentBoard[r][c] !== puzzle.solution[r][c]) {
          errors.push({ row: r, col: c });
        }
      }
    }

    getJuice()?.fire('powerup', { sfx: 'hint', punch: '.gbj-hearts' });
    hapticMedium();

    if (errors.length === 0) {
      toast('오류가 없습니다! 잘하고 있어요!', { icon: '✅' });
    } else {
      toast(`${errors.length}개의 오류가 발견되었습니다!`, { icon: '❌' });
      set({ errorHighlights: errors });
      // Clear highlights after 3 seconds
      setTimeout(() => {
        set({ errorHighlights: [] });
      }, 3000);
    }
  },

  freezeTimer: () => {
    const { status, accumulatedMs, runStartPerf, frozenUntilPerf } = get();
    if (status !== 'playing') return;

    getJuice()?.fire('powerup', { sfx: 'powerup', punch: '.gbj-timer' });
    hapticSuccess();
    toast('30초 동안 타이머가 정지됩니다!', { icon: '❄️' });

    // Commit the current run segment, then start the frozen window.
    const now = perfNow();
    const segment = runStartPerf > 0 && frozenUntilPerf <= now ? now - runStartPerf : 0;
    set({
      accumulatedMs: accumulatedMs + segment,
      runStartPerf: now,
      frozenUntilPerf: now + 30000,
    });
  },

  activateComboBoost: () => {
    const { status } = get();
    if (status !== 'playing') return;

    getJuice()?.fire('powerup', { sfx: 'powerup', punch: '.gbj-timer' });
    hapticSuccess();
    toast('60초 동안 콤보 배율 2배!', { icon: '🚀' });

    set({ comboBoostUntilPerf: perfNow() + 60000 });
  },

  undoMistake: () => {
    const { mistakes, status } = get();
    if (status !== 'playing' || mistakes <= 0) return;

    getJuice()?.fire('powerup', { sfx: 'powerup', punch: '.gbj-hearts' });
    hapticSuccess();
    toast('실수 1회가 취소되었습니다!', { icon: '⏪' });

    set({ mistakes: mistakes - 1 });
  },

  grantHints: (amount: number) => {
    const { status, maxHints } = get();
    if (status !== 'playing' || amount <= 0) return;
    getJuice()?.fire('powerup', { sfx: 'powerup', punch: '.gbj-hearts' });
    hapticSuccess();
    toast(`힌트 ${amount}회가 추가되었습니다!`, { icon: '💡' });
    set({ maxHints: maxHints + amount });
  },

  reviveGame: () => {
    // Continue a lost game with one mistake slot back. Payment (coins/ad) is
    // handled by the caller; this only restores the playable state.
    const { status } = get();
    if (status !== 'failed') return;
    getJuice()?.fire('powerup', { sfx: 'powerup', title: '부활!', punch: '.gbj-hearts' });
    hapticSuccess();
    // Commit elapsed time accrued up to the game-over point before restarting
    // the active segment, so revive doesn't reset the timer to zero.
    const elapsedMs = computeElapsedMs(get());
    set({
      accumulatedMs: elapsedMs,
      elapsedTime: Math.max(0, Math.floor(elapsedMs / 1000)),
      // Restore exactly one life relative to this game's difficulty cap.
      mistakes: Math.max(0, get().maxMistakes - 1),
      status: 'playing',
      runStartPerf: perfNow(),
      frozenUntilPerf: 0,
    });
  },

  resetToIdle: () => {
    set(getInitialState());
  },
    }),
    {
      name: 'numero-quest-game',
      version: 1,
      storage: createJSONStorage(() => localStorage, {
        replacer: jsonReplacer,
        reviver: jsonReviver,
      }),
      // Persist only the in-progress game; monotonic timestamps are session-
      // relative and must never be restored across reloads.
      partialize: (s) => ({
        puzzle: s.puzzle,
        currentBoard: s.currentBoard,
        notes: s.notes,
        selectedCell: s.selectedCell,
        history: s.history,
        historyIndex: s.historyIndex,
        status: s.status,
        startTime: s.startTime,
        accumulatedMs: s.accumulatedMs,
        elapsedTime: s.elapsedTime,
        mistakes: s.mistakes,
        // Persisted so a reload can't silently change how many lives the run
        // has (per-difficulty caps would otherwise fall back to MAX_MISTAKES).
        maxMistakes: s.maxMistakes,
        hintsUsed: s.hintsUsed,
        // Purchased hint packs raise this above the default — persist it so a
        // reload doesn't silently revoke what the player paid for.
        maxHints: s.maxHints,
        difficulty: s.difficulty,
        combo: s.combo,
        maxCombo: s.maxCombo,
        isNotesMode: s.isNotesMode,
        sessionToken: s.sessionToken,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        // A puzzle that was mid-generation at reload can't be resumed.
        if (state.status === 'generating' || !state.puzzle) {
          state.status = 'idle';
          return;
        }
        // Resume as paused so the resume dialog appears; reset session clocks.
        if (state.status === 'playing') {
          state.status = 'paused';
        }
        // The life cap is a pure function of the difficulty, so derive it here
        // rather than trusting the merged value: a save written before
        // maxMistakes was persisted is indistinguishable from a real one after
        // zustand merges the fallback over it, and would silently resume with
        // fewer lives than the difficulty grants.
        const cap = DIFFICULTY_CONFIGS[state.difficulty]?.maxMistakes;
        if (typeof cap === 'number') {
          state.maxMistakes = cap;
        }
        // elapsedTime is the persisted source of truth for prior play time; fold
        // it into accumulatedMs so the monotonic clock continues from there
        // instead of restarting at zero after a reload.
        state.accumulatedMs = Math.max(0, Math.round((state.elapsedTime ?? 0) * 1000));
        state.runStartPerf = 0;
        state.frozenUntilPerf = 0;
        state.comboBoostUntilPerf = 0;
        state.errorHighlights = [];
        // combo.lastCorrectTime is a performance.now() value (session-relative);
        // it's meaningless after a reload and would otherwise make the restored
        // combo never expire. Reset the live combo and neutralize the same
        // timestamp inside undo snapshots.
        state.combo = createInitialComboState();
        if (Array.isArray(state.history)) {
          state.history = state.history.map((a) =>
            a.prevCombo ? { ...a, prevCombo: createInitialComboState() } : a,
          );
        }
      },
    },
  ),
);
