// 실제 클릭 e2e — 폰 세로(390×740 터치)에서 사람이 하는 순서대로 누른다. 화면마다 촬영 · 콘솔 에러 0 단언.
// 사용: node tests/e2e-real.mjs <주소> [촬영폴더]   · 종료코드 0 = 전부 통과
// 🔴 배포본에서 학교를 실제로 고르지 않는다(아이들 순위판) — 허브가 살아 있으면 «목록에 없어요» 경로로 간다.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(path.join(process.env.HOME, '.claude/skills/game-builder/package.json'));
const puppeteer = require('puppeteer');

const BASE = (process.argv[2] || 'http://127.0.0.1:8791').replace(/\/$/, '');
const OUT = process.argv[3] || '/tmp/kc-e2e';
fs.mkdirSync(OUT, { recursive: true });
const fails = [];
const ok = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) fails.push(msg); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ headless: 'new', pipe: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 740, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (process.env.KC_DBG) console.log('  [console]', m.type(), m.text().slice(0, 300)); if (m.type() === 'error' && !/api\/hub|Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });
const apiCalls = [];
page.on('request', (r) => { if (r.url().includes('/api/leaderboard')) apiCalls.push(r.url()); });
await page.evaluateOnNewDocument(() => { window.__fsCalls = 0; const o = Element.prototype.requestFullscreen; Element.prototype.requestFullscreen = function (...a) { window.__fsCalls++; return o ? o.apply(this, a).catch(() => {}) : Promise.resolve(); }; });

const shot = (n) => page.screenshot({ path: path.join(OUT, `${n}.png`) });
/** 허브가 살아 있으면 뜨는 덮개를 사람처럼 넘긴다: 학교 정하기 → «목록에 없어요» · 문제 → 맞혀서 이용권 */
async function passGate() {
  for (let k = 0; k < 30; k++) {
    await sleep(700);
    const st = await page.evaluate(() => {
      const v = (s) => { const e = document.querySelector(s); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      if (v('[data-gb="school-pick"]')) return 'school';
      if (v('.gb-choice')) return 'question';
      if (v('[data-gb="quiz"]')) return 'quiz';
      return 'none';
    });
    if (st === 'none') return;
    if (k < 3) await shot(`gate-${k}-${st}`);
    if (st === 'school') { await page.click('[data-gb-none]'); continue; }
    if (st === 'question') {
      const i = await page.evaluate(() => {
        const t = document.querySelector('.gb-qtext')?.textContent || '';
        const m = t.match(/(\d+)\s*([+−\-×÷])\s*(\d+)/); if (!m) return 0;
        const a = +m[1], c = +m[3], v = { '+': a + c, '−': a - c, '-': a - c, '×': a * c, '÷': a / c }[m[2]];
        const ch = [...document.querySelectorAll('.gb-choice')].map((e) => e.textContent.trim());
        const j = ch.findIndex((x) => Number(x) === v); return j < 0 ? 0 : j;
      });
      await page.click(`[data-pick="${i}"]`).catch(() => {});
      continue;
    }
    await page.click('[data-qgo]').catch(() => {});
  }
}
/** 판 화면 칸·숫자 단추를 진짜로 누른다(중심 elementFromPoint 가 그 요소인지 먼저 본다) */
async function tapSel(sel) {
  // 판을 끝내면 0.65초 물결(입력 없음) 뒤에 새 판이 깔린다 — 칸이 다시 생길 때까지 기다린다
  await page.waitForSelector(sel, { timeout: 4000 }).catch(() => {});
  const h = await page.$(sel);
  if (!h) throw new Error(`없음: ${sel}`);
  const hit = await h.evaluate((el) => { const r = el.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return t === el || el.contains(t); });
  if (!hit) {
    const why = await h.evaluate((el) => { const r = el.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { boards: document.querySelectorAll('[data-run-board]').length, cells: document.querySelectorAll('[data-cell]').length, rect: [r.left, r.top, r.width, r.height].map(Math.round), top: t ? `${t.tagName}.${t.className}`.slice(0, 120) : null, vw: innerWidth, vh: innerHeight, chain: [...document.querySelectorAll('[data-run-board]')].map((b) => { const a = []; for (let e = b; e && e !== document.body; e = e.parentElement) a.push(`${e.tagName}${e.dataset && Object.keys(e.dataset).length ? '[' + Object.keys(e.dataset).join(',') + ']' : ''}.${String(e.className).slice(0, 40)}`); return a.join(' < '); }), mains: document.querySelectorAll('main').length }; });
    throw new Error(`가려짐: ${sel} ${JSON.stringify(why)} errors=${JSON.stringify(errors)}`);
  }
  await h.tap();
}
const run = () => page.evaluate(() => { const s = window.__kcRun; return s && { n: s.spec.n, diag: s.spec.diag, grid: s.grid.slice(), sol: s.board.solution.slice(), cleared: s.cleared, score: s.score, hearts: s.hearts, t: s.timeLeftMs, over: s.over }; });
async function solveBoard() {
  const s0 = await run();
  const before = s0.cleared;
  // 판을 넘길 때 이전 판 DOM 이 남으면(형제 key 충돌) 판이 두 개 겹쳐 보인다
  await page.waitForSelector('[data-cell]', { timeout: 4000 }).catch(() => {});
  const boards = await page.evaluate(() => document.querySelectorAll('[data-run-board]').length);
  if (boards !== 1) throw new Error(`판 DOM ${boards}개 — 1개여야 한다`);
  for (let guard = 0; guard < 100; guard++) {
    const s = await run();
    if (s.cleared > before || s.over) return;
    const i = s.grid.findIndex((v) => !v);
    await tapSel(`[data-cell="${i}"]`);
    await tapSel(`[data-num="${s.sol[i]}"]`);
  }
}
async function wrongOnce() {
  const s = await run();
  const i = s.grid.findIndex((v) => !v);
  await tapSel(`[data-cell="${i}"]`);
  // 이미 다 놓인 숫자는 단추가 꺼져 있다(4×4 에 9칸 주면 흔하다) — 켜진 오답 단추를 고른다
  let w = 0;
  for (let k = 1; k < s.n && !w; k++) { const v = ((s.sol[i] - 1 + k) % s.n) + 1; if (s.grid.filter((x) => x === v).length < s.n) w = v; }
  await tapSel(`[data-num="${w}"]`);
}
async function home() {
  await page.goto(BASE + '/', { waitUntil: 'networkidle2' });
  await page.waitForSelector('.gb-mode[data-id="time"]', { timeout: 15000 });
  await sleep(500);
}

try {
  await page.goto(BASE + '/', { waitUntil: 'networkidle2' });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await home();
  await shot('01-home');
  const h = await page.evaluate(() => ({ title: document.title, rank: !!document.querySelector('[data-gb="school-rank"]'), modes: [...document.querySelectorAll('[data-gb-mode]')].map((e) => e.dataset.gbMode) }));
  ok(/칸채움/.test(h.title), `신원 확인: ${h.title}`);
  ok(h.rank && ['classic', 'time', 'survival', 'rule', 'daily'].every((k) => h.modes.includes(k)), `홈 모드 5종 ${h.modes}`);

  // ── 타임어택 ──
  await tapSel('.gb-mode[data-id="time"]');
  await passGate();
  await page.waitForSelector('[data-run-board]', { timeout: 15000 });
  ok((await page.evaluate(() => window.__fsCalls)) > 0, 'D2 모드 카드를 누르면 전체화면 요청');
  const seed0 = await page.evaluate(() => window.__kcRun && window.__kcRun.seed);
  await sleep(1500);
  const seed1 = await page.evaluate(() => window.__kcRun && window.__kcRun.seed);
  ok(seed0 === seed1, `판이 저절로 다시 시작되지 않는다 (${seed0} → ${seed1})`);
  let s = await run();
  ok(s.n === 4 && s.t <= 90000 && s.t > 80000, `D4 첫 판 4×4 · 90초 (${s.n}, ${s.t})`);
  await wrongOnce();
  await sleep(200);
  const s1 = await run();
  if (s.t - s1.t < 4500) console.log('   디버그', JSON.stringify({ before: s.t, after: s1.t, seed: await page.evaluate(() => window.__kcRun.seed), mistakes: await page.evaluate(() => window.__kcRun.mistakes) }));
  ok(s.t - s1.t >= 4500, `D4 틀리면 −5초 (${s.t}→${s1.t})`);
  await shot('02-time-wrong');
  for (let k = 0; k < 3; k++) await solveBoard();
  s = await run();
  ok(s.cleared === 3 && s.score === 30 && s.n === 6, `D4 4×4 세 판 → 30점·6×6 (${s.cleared}, ${s.score}, ${s.n})`);
  await shot('03-time-6x6');
  await sleep(500);
  await sleep(1500);
  const mus = await page.evaluate(() => window.__kcMusic && window.__kcMusic());
  ok(mus && mus.unlocked && mus.ctx === 'running' && mus.want === 'rush' && mus.playing.includes('rush') && !mus.playing.includes('calm'), `배경음악: 타임어택 = 빠른 곡 한 곡만 ${JSON.stringify(mus)}`);
  const sfx = await page.evaluate(() => window.__kcSfx && window.__kcSfx());
  ok(sfx && sfx.files >= 10 && sfx.state === 'running', `D13 효과음 파일 ${sfx && sfx.files}개 · 오디오 ${sfx && sfx.state}`);
  while (!(await run()).over) await wrongOnce();
  await page.waitForSelector('[data-run-result]', { timeout: 5000 });
  await sleep(450);
  await shot('04-time-result');
  ok(true, 'D4 0초 → 결과 화면');

  // ── 서바이벌 ──
  await home();
  await shot('05-home-best');
  ok(/최고 30점/.test(await page.$eval('.gb-mode[data-id="time"]', (e) => e.textContent)), 'D4 홈 카드에 최고 기록');
  await tapSel('.gb-mode[data-id="survival"]');
  await passGate();
  await page.waitForSelector('[data-run-board]', { timeout: 15000 });
  for (let k = 0; k < 2; k++) await solveBoard();
  s = await run();
  ok(s.cleared === 2 && s.n === 6, `D5 두 판 깨면 3라운드 6×6 (${s.cleared}, ${s.n})`);
  await shot('06-survival-6x6');
  for (let k = 0; k < 3; k++) await wrongOnce();
  await page.waitForSelector('[data-run-result]', { timeout: 5000 });
  await sleep(450);
  await shot('07-survival-result');
  ok((await run()).over, 'D5 실수 3번 → 결과 화면');

  // ── 대각선 ──
  await home();
  await tapSel('.gb-mode[data-id="rule"]');
  await passGate();
  await page.waitForSelector('[data-run-board]', { timeout: 15000 });
  s = await run();
  const diagN = await page.$$eval('[data-diag]', (e) => e.length);
  const want = s.n % 2 ? 2 * s.n - 1 : 2 * s.n;
  ok(s.diag && diagN === want, `D6 대각선 칸 표시 ${diagN}/${want}(선택 강조와 무관)`);
  await solveBoard();
  await solveBoard();
  await shot('08-rule-6x6');
  ok((await run()).cleared === 2, 'D6 대각선 두 판 통과');
  await tapSel('button[aria-label="홈으로"]');
  await page.waitForSelector('.gb-mode[data-id="time"]', { timeout: 10000 });

  // ── 클래식(숨은 탭에서도 생성 — D9) ──
  await sleep(500);
  await tapSel('[data-gb="play"]');
  await passGate();
  await page.waitForFunction(() => location.pathname.startsWith('/play'), { timeout: 10000 });
  await sleep(800);
  await shot('09-classic-select');
  const skip = await page.$$eval('button', (bs) => { const b = bs.find((x) => x.textContent.includes('건너뛰기')); if (b) { b.click(); return true; } return false; });
  ok(skip, '첫 방문 안내(온보딩)가 클래식 화면에서 뜨고 건너뛸 수 있다');
  await sleep(400);
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { get: () => 'hidden', configurable: true }); window.requestAnimationFrame = () => 0; });
  const diffBtn = await page.$$('main button');
  await diffBtn[0].tap();
  const gen = await page.waitForFunction(() => document.querySelectorAll('button.aspect-square').length >= 81, { timeout: 5000, polling: 200 }).then(() => true, () => false);
  await sleep(600);
  const cells = await page.evaluate(() => document.querySelectorAll('button.aspect-square').length);
  await shot('10-classic-board');
  ok(gen && cells >= 81, `D9 숨은 탭에서도 클래식 판 생성(칸 ${cells})`);

  // ── 내 기록 ──
  await page.goto(BASE + '/leaderboard', { waitUntil: 'networkidle2' });
  await sleep(800);
  await shot('11-records');
  ok(/최고 30점/.test(await page.evaluate(() => document.body.innerText)), '내 기록에 타임어택 최고');

  ok(apiCalls.length === 0, `D8 /api/leaderboard 호출 0 (${apiCalls.length})`);
  ok((await page.$$('input[type="text"]')).length === 0, 'D8 자유 입력 칸 0');
  ok(errors.length === 0, `D10 콘솔 에러 0 ${errors.slice(0, 3).join(' | ')}`);
} catch (e) {
  fails.push(String(e && e.stack || e));
  console.log('❌', e);
  await shot('zz-crash').catch(() => {});
} finally {
  await browser.close();
}
console.log(fails.length ? `❌ 실패 ${fails.length}` : '✅ e2e 전부 통과', `· 촬영 ${OUT}`);
process.exit(fails.length ? 1 : 0);
