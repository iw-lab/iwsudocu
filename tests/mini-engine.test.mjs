// D3 — 작은 판 엔진: 크기 4·6·9 × 대각선 on/off, 시드 여럿 전부 «해 1개 · 규칙 충족 · 주어진 칸 ≈ 목표 · 시간 상한»
import test from 'node:test';
import assert from 'node:assert/strict';
import { makePuzzle, countSolutions, geometry, conflicts } from '../src/lib/mini/engine.ts';

const SEEDS = Number(process.env.MINI_SEEDS || 200);
const CASES = [
  { n: 4, diag: false, target: 7, slack: 2, p95: 50 },
  { n: 4, diag: true, target: 7, slack: 2, p95: 50 },
  { n: 6, diag: false, target: 16, slack: 2, p95: 50 },
  { n: 6, diag: true, target: 16, slack: 2, p95: 50 },
  { n: 9, diag: false, target: 30, slack: 4, p95: 800, seeds: 60 },
  { n: 9, diag: true, target: 30, slack: 4, p95: 800, seeds: 60 },
];

/** 판 전체가 규칙을 지키는가 — 엔진의 peers 가 아니라 행·열·상자·대각선을 직접 센다(엔진 자기검증 금지) */
function valid(n, diag, a) {
  const bh = n === 6 ? 2 : Math.sqrt(n), bw = n === 6 ? 3 : Math.sqrt(n);
  const groups = [];
  for (let r = 0; r < n; r++) groups.push([...Array(n)].map((_, c) => a[r * n + c]));
  for (let c = 0; c < n; c++) groups.push([...Array(n)].map((_, r) => a[r * n + c]));
  for (let br = 0; br < n; br += bh) for (let bc = 0; bc < n; bc += bw) {
    const g = []; for (let r = br; r < br + bh; r++) for (let c = bc; c < bc + bw; c++) g.push(a[r * n + c]); groups.push(g);
  }
  if (diag) { groups.push([...Array(n)].map((_, i) => a[i * n + i])); groups.push([...Array(n)].map((_, i) => a[i * n + n - 1 - i])); }
  return groups.every((g) => new Set(g).size === n && g.every((v) => v >= 1 && v <= n));
}

for (const k of CASES) {
  test(`D3 ${k.n}×${k.n}${k.diag ? ' 대각선' : ''} — 유일해·규칙·칸 수·시간`, () => {
    const cfg = { n: k.n, diag: k.diag };
    const times = [];
    const seeds = Math.min(SEEDS, k.seeds ?? SEEDS);
    for (let s = 1; s <= seeds; s++) {
      const t0 = performance.now();
      const p = makePuzzle(cfg, k.target, s * 7919);
      times.push(performance.now() - t0);
      assert.ok(valid(k.n, k.diag, p.solution), `해가 규칙 위반 seed=${s}`);
      assert.equal(countSolutions(cfg, p.givens, 2), 1, `해가 1개가 아니다 seed=${s}`);
      p.givens.forEach((v, i) => { if (v) assert.equal(v, p.solution[i]); });
      assert.equal(p.givens.filter(Boolean).length, p.clues);
      assert.ok(p.clues <= k.target + k.slack, `칸이 너무 많다 ${p.clues} > ${k.target}+${k.slack} seed=${s}`);
    }
    times.sort((a, b) => a - b);
    const p95 = times[Math.floor(times.length * 0.95)];
    assert.ok(p95 < k.p95, `생성 P95 ${p95.toFixed(1)}ms ≥ ${k.p95}ms`);
  });
}

test('대각선 규칙이 실제로 이웃에 들어 있다(주입: diag 를 빼면 빨강)', () => {
  const on = geometry({ n: 6, diag: true }), off = geometry({ n: 6, diag: false });
  assert.ok(on.peers[0].includes(35), '(0,0)↔(5,5) 대각선 이웃');
  assert.ok(!off.peers[0].includes(35));
  const g = new Array(36).fill(0); g[35] = 3;
  assert.deepEqual(conflicts({ n: 6, diag: true }, g, 0, 3), [35]);
  assert.deepEqual(conflicts({ n: 6, diag: false }, g, 0, 3), []);
});
