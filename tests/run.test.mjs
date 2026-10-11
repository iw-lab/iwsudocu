// D4·D5·D6·D12 — 런 모드 상태기계(headless). 실행: node --import ./scripts/ts-alias-hook.mjs --test tests/run.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRun, place, tick, boardSpec, TIME_START_MS, TIME_CLEAR_BONUS_MS, TIME_MISTAKE_MS } from '../src/lib/mini/run.ts';
import { mulberry32 } from '../src/lib/mini/engine.ts';

const empties = (s) => s.grid.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);

test('D4 타임어택 — 판을 채우면 +12초·+10점, 틀리면 −5초, 0초면 끝', () => {
  const s = createRun('time', 11);
  assert.equal(s.timeLeftMs, TIME_START_MS);
  assert.equal(s.spec.n, 4);
  const e = empties(s);
  const wrongCell = e[0], right = s.board.solution[wrongCell];
  assert.equal(place(s, wrongCell, (right % 4) + 1), 'wrong');
  assert.equal(s.timeLeftMs, TIME_START_MS - TIME_MISTAKE_MS);
  let last;
  for (const i of e) last = place(s, i, s.board.solution[i]);
  assert.equal(last, 'cleared');
  assert.equal(s.score, 10);
  assert.equal(s.timeLeftMs, TIME_START_MS - TIME_MISTAKE_MS + TIME_CLEAR_BONUS_MS);
  assert.equal(s.cleared, 1);
  assert.ok(empties(s).length > 0, '다음 판이 깔렸다');
  assert.equal(tick(s, s.timeLeftMs), true);
  assert.equal(s.over, true);
  assert.equal(place(s, empties(s)[0], 1), 'ignored', '끝난 판에는 못 놓는다');
});

test('D5 서바이벌 — 실수 3번이면 끝, 판을 깨면 라운드+1, 3번째 판은 6×6', () => {
  const s = createRun('survival', 5);
  for (let k = 0; k < 2; k++) for (const i of empties(s)) place(s, i, s.board.solution[i]);
  assert.equal(s.cleared, 2);
  assert.equal(s.spec.n, 6);
  const c = empties(s)[0], w = (s.board.solution[c] % 6) + 1;
  assert.equal(place(s, c, w), 'wrong');
  assert.equal(place(s, c, w === 6 ? 1 : w + 1 === s.board.solution[c] ? ((w + 1) % 6) + 1 : w + 1), 'wrong');
  assert.equal(s.hearts, 1);
  let r; do { const v = (s.board.solution[c] % 6) + 1; r = place(s, c, v); } while (r === 'ignored');
  assert.equal(r, 'over');
  assert.equal(s.over, true);
});

test('D6 대각선 — 판이 대각선 규칙이고, 대각선 중복 숫자는 실수', () => {
  const s = createRun('rule', 3);
  assert.equal(s.spec.diag, true);
  const n = s.spec.n;
  // 빈 대각선 칸에 «같은 대각선의 다른 칸 숫자»를 넣으면 실수다
  const diagCells = [...Array(n)].map((_, i) => i * n + i);
  const target = diagCells.find((i) => !s.grid[i]);
  const other = diagCells.find((i) => i !== target);
  const dup = s.board.solution[other];
  assert.notEqual(dup, s.board.solution[target]);
  assert.equal(place(s, target, dup), 'wrong');
  for (let idx = 0; idx < 8; idx++) assert.equal(boardSpec('rule', idx).diag, true);
});

/** 봇: 사람 속도로 탭. logic = 정답을 안다(칸당 think 초), guess = 빈칸에 무작위 숫자(탭당 0.5초) */
function playTime(seed, bot) {
  const rnd = mulberry32(seed ^ 0x9e37);
  const s = createRun('time', seed);
  let guard = 0;
  while (!s.over && guard++ < 20000) {
    const e = empties(s); const i = e[Math.floor(rnd() * e.length)];
    if (bot === 'logic') { if (tick(s, s.spec.n === 4 ? 1500 : 3000)) break; place(s, i, s.board.solution[i]); }
    else { if (tick(s, 500)) break; place(s, i, 1 + Math.floor(rnd() * s.spec.n)); }
  }
  return s;
}
function playSurvival(seed, bot, kind = 'survival') {
  const rnd = mulberry32(seed ^ 0x51ed);
  const s = createRun(kind, seed);
  let guard = 0;
  while (!s.over && s.cleared < 7 && guard++ < 5000) {
    const e = empties(s); const i = e[Math.floor(rnd() * e.length)];
    place(s, i, bot === 'logic' ? s.board.solution[i] : 1 + Math.floor(rnd() * s.spec.n));
  }
  return s;
}

test('D12 찍기는 지고 풀기는 이긴다 — 타임어택·서바이벌·대각선 각 200판', () => {
  const N = 200;
  let gScore = 0, lScore = 0, gZero = 0, lMin = Infinity;
  for (let k = 1; k <= N; k++) {
    const g = playTime(k, 'guess'), l = playTime(k, 'logic');
    gScore += g.score; lScore += l.score; if (g.score === 0) gZero++; lMin = Math.min(lMin, l.cleared);
  }
  console.log(`  타임어택 평균 — 찍기 ${(gScore / N).toFixed(1)}점(0점 ${gZero}/${N}) · 풀기 ${(lScore / N).toFixed(1)}점 · 풀기 최소 ${lMin}판`);
  assert.ok(lMin >= 5, `풀기 봇 최소 ${lMin}판 < 5`);
  assert.ok(gScore / N <= 0.1 * (lScore / N), '찍기 평균이 풀기의 10%를 넘는다');
  for (const kind of ['survival', 'rule']) {
    let gR = 0, lR = 0;
    for (let k = 1; k <= N; k++) { gR += playSurvival(k, 'guess', kind).cleared; lR += playSurvival(k, 'logic', kind).cleared; }
    console.log(`  ${kind} 평균 라운드 — 찍기 ${(gR / N).toFixed(2)} · 풀기 ${(lR / N).toFixed(2)}`);
    assert.ok(gR / N < 0.5, `${kind} 찍기 평균 ${gR / N} ≥ 0.5라운드`);
    assert.ok(lR / N >= 7, `${kind} 풀기 봇이 7판을 못 간다`);
  }
});
