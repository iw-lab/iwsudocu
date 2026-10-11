// 작은 판 엔진 — 4×4·6×6·9×9 스도쿠(+대각선 규칙). DOM 을 import 하지 않는다(headless 시험이 그대로 부른다).
// 모든 판은 해가 정확히 1개다: 깎을 때마다 countSolutions(…, 2) === 1 을 확인한다.

export interface MiniConfig {
  /** 한 변 칸 수 */
  n: 4 | 6 | 9;
  /** 두 대각선에도 같은 숫자 금지(X-스도쿠) */
  diag: boolean;
}

export interface MiniPuzzle {
  cfg: MiniConfig;
  /** 길이 n*n · 0 = 빈칸 */
  givens: number[];
  solution: number[];
  /** 실제 남은 주어진 칸 수(목표보다 많을 수 있다 — 시간 상한에 걸리면 물러남) */
  clues: number;
}

/** 상자 높이×너비 — 6×6 은 2행×3열 */
export function boxShape(n: number): [number, number] {
  if (n === 4) return [2, 2];
  if (n === 6) return [2, 3];
  return [3, 3];
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Geo {
  n: number;
  /** 칸마다 속한 단위(행·열·상자·대각선) 번호 */
  unitsOf: number[][];
  /** 단위마다 칸 목록 */
  units: number[][];
  /** 칸마다 이웃(같은 단위의 다른 칸) */
  peers: number[][];
}

const geoCache = new Map<string, Geo>();

export function geometry(cfg: MiniConfig): Geo {
  const key = `${cfg.n}${cfg.diag ? 'x' : ''}`;
  const hit = geoCache.get(key);
  if (hit) return hit;
  const { n } = cfg;
  const [bh, bw] = boxShape(n);
  const units: number[][] = [];
  for (let r = 0; r < n; r++) units.push(Array.from({ length: n }, (_, c) => r * n + c));
  for (let c = 0; c < n; c++) units.push(Array.from({ length: n }, (_, r) => r * n + c));
  for (let br = 0; br < n; br += bh) {
    for (let bc = 0; bc < n; bc += bw) {
      const u: number[] = [];
      for (let r = br; r < br + bh; r++) for (let c = bc; c < bc + bw; c++) u.push(r * n + c);
      units.push(u);
    }
  }
  if (cfg.diag) {
    units.push(Array.from({ length: n }, (_, i) => i * n + i));
    units.push(Array.from({ length: n }, (_, i) => i * n + (n - 1 - i)));
  }
  const unitsOf: number[][] = Array.from({ length: n * n }, () => []);
  units.forEach((u, ui) => u.forEach((cell) => unitsOf[cell].push(ui)));
  const peers = unitsOf.map((us, cell) => {
    const s = new Set<number>();
    for (const ui of us) for (const p of units[ui]) if (p !== cell) s.add(p);
    return [...s];
  });
  const g = { n, unitsOf, units, peers };
  geoCache.set(key, g);
  return g;
}

export function isDiagCell(n: number, cell: number): boolean {
  const r = Math.floor(cell / n), c = cell % n;
  return r === c || r + c === n - 1;
}

/** 칸에 v 를 놓으면 규칙 위반인가(이웃 중 같은 숫자) */
export function conflicts(cfg: MiniConfig, grid: number[], cell: number, v: number): number[] {
  const g = geometry(cfg);
  return g.peers[cell].filter((p) => grid[p] === v);
}

/** 해 개수(limit 에서 멈춤) — 비트마스크 + 후보 최소 칸 우선 */
export function countSolutions(cfg: MiniConfig, grid: number[], limit = 2): number {
  const g = geometry(cfg);
  const n = g.n, full = (1 << (n + 1)) - 2;
  const used = new Int32Array(g.units.length);
  const a = grid.slice();
  for (let i = 0; i < a.length; i++) {
    const v = a[i];
    if (!v) continue;
    const bit = 1 << v;
    for (const u of g.unitsOf[i]) {
      if (used[u] & bit) return 0;
      used[u] |= bit;
    }
  }
  let count = 0;
  const popcnt = (x: number) => { let k = 0; while (x) { x &= x - 1; k++; } return k; };
  const rec = (): void => {
    let best = -1, bestMask = 0, bestCnt = 99;
    for (let i = 0; i < a.length; i++) {
      if (a[i]) continue;
      let m = 0;
      for (const u of g.unitsOf[i]) m |= used[u];
      const free = full & ~m;
      const k = popcnt(free);
      if (k < bestCnt) { best = i; bestMask = free; bestCnt = k; if (k <= 1) break; }
    }
    if (best < 0) { count++; return; }
    if (bestCnt === 0) return;
    for (let v = 1; v <= n && count < limit; v++) {
      const bit = 1 << v;
      if (!(bestMask & bit)) continue;
      a[best] = v;
      for (const u of g.unitsOf[best]) used[u] |= bit;
      rec();
      for (const u of g.unitsOf[best]) used[u] &= ~bit;
      a[best] = 0;
    }
  };
  rec();
  return count;
}

/** 무작위 완성판 하나 */
export function randomSolution(cfg: MiniConfig, rnd: () => number): number[] {
  const g = geometry(cfg);
  const n = g.n, full = (1 << (n + 1)) - 2;
  const used = new Int32Array(g.units.length);
  const a = new Array<number>(n * n).fill(0);
  let steps = 0;
  const order = (mask: number) => {
    const vs: number[] = [];
    for (let v = 1; v <= n; v++) if (mask & (1 << v)) vs.push(v);
    for (let i = vs.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [vs[i], vs[j]] = [vs[j], vs[i]]; }
    return vs;
  };
  const rec = (): boolean => {
    if (++steps > 200000) return false;
    let best = -1, bestMask = 0, bestCnt = 99;
    for (let i = 0; i < a.length; i++) {
      if (a[i]) continue;
      let m = 0;
      for (const u of g.unitsOf[i]) m |= used[u];
      const free = full & ~m;
      let k = 0; for (let x = free; x; x &= x - 1) k++;
      if (k < bestCnt) { best = i; bestMask = free; bestCnt = k; if (k <= 1) break; }
    }
    if (best < 0) return true;
    for (const v of order(bestMask)) {
      const bit = 1 << v;
      a[best] = v;
      for (const u of g.unitsOf[best]) used[u] |= bit;
      if (rec()) return true;
      for (const u of g.unitsOf[best]) used[u] &= ~bit;
      a[best] = 0;
    }
    return false;
  };
  if (!rec()) throw new Error(`완성판을 못 만들었다(n=${n} diag=${cfg.diag})`);
  return a;
}

/**
 * 해 1개짜리 퍼즐을 깎는다. 목표 칸 수까지 못 내려가면(유일해가 깨지거나 시간 상한) 그 자리에서 멈춘다.
 * budgetMs 는 깎기 단계의 상한 — 9×9 를 메인 스레드에서 돌려도 멈칫이 짧게.
 */
export function makePuzzle(cfg: MiniConfig, targetClues: number, seed: number, budgetMs = 600): MiniPuzzle {
  const rnd = mulberry32(seed);
  const solution = randomSolution(cfg, rnd);
  const cells = cfg.n * cfg.n;
  const givens = solution.slice();
  const order = Array.from({ length: cells }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const t0 = Date.now();
  let clues = cells;
  for (const cell of order) {
    if (clues <= targetClues) break;
    if (Date.now() - t0 > budgetMs) break;
    const keep = givens[cell];
    givens[cell] = 0;
    if (countSolutions(cfg, givens, 2) === 1) clues--;
    else givens[cell] = keep;
  }
  return { cfg, givens, solution, clues };
}
