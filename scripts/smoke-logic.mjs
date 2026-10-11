// Smoke test of the fixed pure logic, run against the real source via tsx.
import assert from 'node:assert';
import { calculateTimeBonus, clampScore, calculateRewards } from '../src/lib/game/scoring.ts';
import { updateStreak } from '../src/lib/game/streak.ts';
import { checkCompletions } from '../src/lib/game/celebrations.ts';
import { checkAchievements } from '../src/lib/game/achievements.ts';
import { checkDailyBonus, getDailyBonus, getWeekId, getWeeklyMissionTemplates } from '../src/lib/game/daily.ts';

let n = 0;
const ok = (label) => { n++; console.log('  ✓', label); };

// 1. Negative elapsed time (rewound clock) must not inflate the time bonus.
assert.strictEqual(calculateTimeBonus('easy', -9999), calculateTimeBonus('easy', 0));
ok('time bonus clamps negative elapsed to 0-time');

// 2. Score clamp per difficulty.
assert.strictEqual(clampScore(1e9, 'master'), 5500);
assert.strictEqual(clampScore(-5, 'easy'), 0);
assert.strictEqual(clampScore(500, 'medium'), 500);
ok('clampScore bounds score to difficulty ceiling');

// 3. Rewards derived from clamped score (forged score cannot mint XP/coins).
const r = calculateRewards({ totalScore: 1e9, difficulty: 'easy', streakMultiplier: 1 });
assert.ok(r.xp <= 1300 * 0.5 + 1 && r.coins <= 1300 * 0.1 + 1);
ok('calculateRewards uses clamped score');

// 4. Streak: rewound/earlier date does not reset or advance the streak.
const base = { currentStreak: 5, longestStreak: 5, lastPlayDate: '2026-07-10', streakHistory: [], streakFreezeCount: 0, isStreakActive: true, claimedMilestones: [] };
assert.strictEqual(updateStreak(base, '2026-07-09').currentStreak, 5, 'earlier date keeps streak');
assert.strictEqual(updateStreak(base, '2026-07-10').currentStreak, 5, 'same date no change');
assert.strictEqual(updateStreak(base, '2026-07-11').currentStreak, 6, 'next day advances');
ok('streak ignores rewound clock, advances on next day');

// 5. Completion celebration requires solution match (wrong-filled row = no celebration).
const solution = Array.from({ length: 9 }, (_, r) => Array.from({ length: 9 }, (_, c) => ((r * 3 + Math.floor(r / 3) + c) % 9) + 1));
const board = solution.map((row) => [...row]);
// Fill row 0 with wrong values (all 1s) — full but incorrect.
for (let c = 0; c < 9; c++) board[0][c] = 1;
const wrongRow = checkCompletions(board, 0, 0, solution).filter((x) => x.type === 'row');
assert.strictEqual(wrongRow.length, 0, 'wrong-filled row must not celebrate');
// Correct row 1 should celebrate.
const rightRow = checkCompletions(solution, 1, 0, solution).filter((x) => x.type === 'row');
assert.strictEqual(rightRow.length, 1, 'correct row celebrates');
ok('completion celebration validated against solution');

// 6. Speed achievement unlocks when best time <= requirement.
const stats = {
  totalGamesWon: 1, puzzlesByDifficulty: { beginner: 0, easy: 1, medium: 0, hard: 0, expert: 0, master: 0 },
  bestTimes: { beginner: 0, easy: 150, medium: 0, hard: 0, expert: 0, master: 0 },
  longestStreak: 0, maxCombo: 0, perfectGames: 0, perfectGamesByDifficulty: {}, dailyChallengesCompleted: 0,
  brainScore: 0, dailyBonusCompleted: 0,
};
const achs = [{ id: 'speed_easy_3m', requirement: 180, isUnlocked: false, progress: 0 }];
const out = checkAchievements(stats, achs, 1);
assert.strictEqual(out[0].isUnlocked, true, 'speed_easy_3m unlocks at 150s <= 180s');
ok('speed achievements now unlock');

// 7. Daily bonus objective evaluation.
const bonus = { type: 'no_mistakes', target: 0, descriptionKo: '', bonusXP: 1, bonusCoins: 1 };
assert.strictEqual(checkDailyBonus(bonus, { timeInSeconds: 100, mistakes: 0, hintsUsed: 2, maxCombo: 0 }), true);
assert.strictEqual(checkDailyBonus(bonus, { timeInSeconds: 100, mistakes: 1, hintsUsed: 0, maxCombo: 0 }), false);
assert.ok(getDailyBonus('2026-07-19'));
ok('daily bonus check + deterministic pick');

// 8. Weekly missions deterministic & 3 per week.
const wk = getWeekId(new Date('2026-07-19T00:00:00Z'));
assert.strictEqual(getWeeklyMissionTemplates(wk).length, 3);
ok('weekly missions produce 3 deterministic entries');

// 9. 자유 입력 닉네임(욕설 필터 대상)은 걷어냈다 — 이름 입력 칸이 다시 생기지 않았는지 본다.
const fsMod = await import('node:fs');
const modal = fsMod.readFileSync(new URL('../src/components/game/GameCompleteModal.tsx', import.meta.url), 'utf8');
assert.ok(!/<input/.test(modal), '결과 창에 자유 입력 칸이 없다');
ok('no free-text name input on the result modal');

console.log(`\nAll ${n} logic checks passed.`);
