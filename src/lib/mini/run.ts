// 런 모드 상태기계 — 타임어택·서바이벌·대각선. 순수 로직(DOM·시계 0): 시간은 호출자가 tick(dt) 로 밀어 넣는다.
import { makePuzzle, type MiniConfig, type MiniPuzzle } from './engine';

export type RunKind = 'time' | 'survival' | 'rule';

export interface BoardSpec extends MiniConfig {
  clues: number;
  /** 타임어택 판 점수 */
  points: number;
}

export const TIME_START_MS = 90_000;
export const TIME_CLEAR_BONUS_MS = 12_000;
/** 찍기가 이득이 되지 않게 — 실수 한 번이 칸 하나 푸는 시간보다 비싸다(시험 D12 가 잰다) */
export const TIME_MISTAKE_MS = 5_000;
export const HEARTS = 3;

/** idx 번째 판(0부터) — GDD §1-4 표 */
export function boardSpec(kind: RunKind, idx: number): BoardSpec {
  if (kind === 'time') {
    if (idx < 3) return { n: 4, diag: false, clues: [9, 8, 7][idx], points: 10 };
    return { n: 6, diag: false, clues: Math.max(16, 22 - 2 * (idx - 3)), points: 30 };
  }
  const diag = kind === 'rule';
  if (idx < 2) return { n: 4, diag, clues: [8, 7][idx], points: 0 };
  if (idx < 5) return { n: 6, diag, clues: [20, 18, 16][idx - 2], points: 0 };
  const start = diag ? 40 : 46;
  return { n: 9, diag, clues: Math.max(30, start - 4 * (idx - 5)), points: 0 };
}

export interface RunState {
  kind: RunKind;
  seed: number;
  /** 깬 판 수 */
  cleared: number;
  score: number;
  hearts: number;
  timeLeftMs: number;
  mistakes: number;
  board: MiniPuzzle;
  spec: BoardSpec;
  /** 지금 판에 놓인 숫자(주어진 칸 포함) */
  grid: number[];
  over: boolean;
}

function newBoard(kind: RunKind, seed: number, idx: number): { board: MiniPuzzle; spec: BoardSpec } {
  const spec = boardSpec(kind, idx);
  const board = makePuzzle({ n: spec.n, diag: spec.diag }, spec.clues, (seed + idx * 104729) >>> 0);
  return { board, spec };
}

export function createRun(kind: RunKind, seed: number): RunState {
  const { board, spec } = newBoard(kind, seed, 0);
  return {
    kind, seed, cleared: 0, score: 0, hearts: kind === 'time' ? 0 : HEARTS,
    timeLeftMs: kind === 'time' ? TIME_START_MS : 0, mistakes: 0,
    board, spec, grid: board.givens.slice(), over: false,
  };
}

export type PlaceResult = 'ok' | 'wrong' | 'cleared' | 'over' | 'ignored';

/** 칸에 숫자를 놓는다. 틀리면 놓지 않고 벌점(시간/하트). 판을 다 채우면 다음 판으로 넘어간다. */
export function place(s: RunState, cell: number, v: number): PlaceResult {
  if (s.over || s.board.givens[cell] || s.grid[cell] === v || v < 1 || v > s.spec.n) return 'ignored';
  if (s.board.solution[cell] !== v) {
    s.mistakes++;
    if (s.kind === 'time') {
      s.timeLeftMs = Math.max(0, s.timeLeftMs - TIME_MISTAKE_MS);
      if (s.timeLeftMs <= 0) { s.over = true; return 'over'; }
    } else {
      s.hearts--;
      if (s.hearts <= 0) { s.over = true; return 'over'; }
    }
    return 'wrong';
  }
  s.grid[cell] = v;
  if (s.grid.every((x, i) => x === s.board.solution[i])) {
    s.cleared++;
    if (s.kind === 'time') { s.score += s.spec.points; s.timeLeftMs += TIME_CLEAR_BONUS_MS; }
    else s.score = s.cleared;
    const nb = newBoard(s.kind, s.seed, s.cleared);
    s.board = nb.board; s.spec = nb.spec; s.grid = nb.board.givens.slice();
    return 'cleared';
  }
  return 'ok';
}

/** 지운다(내가 놓은 칸만) */
export function erase(s: RunState, cell: number): boolean {
  if (s.over || s.board.givens[cell] || !s.grid[cell]) return false;
  s.grid[cell] = 0;
  return true;
}

/** 타임어택 시계 — dt 만큼 흐른다. 끝나면 true */
export function tick(s: RunState, dtMs: number): boolean {
  if (s.over || s.kind !== 'time') return s.over;
  s.timeLeftMs = Math.max(0, s.timeLeftMs - dtMs);
  if (s.timeLeftMs <= 0) s.over = true;
  return s.over;
}

/** 기록 비교용 값 — 타임어택 = 점수, 나머지 = 깬 판 수 */
export function runRecord(s: RunState): number {
  return s.kind === 'time' ? s.score : s.cleared;
}
