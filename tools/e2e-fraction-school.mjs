#!/usr/bin/env node
// 학교 허브 «문제 풀고 이용권» 화면의 분수 세로 표기 e2e — 허브 응답을 가짜로 갈아 끼워(분수 문항 5개) 실제 DOM 을 잰다.
// 사용: node tools/e2e-fraction-school.mjs <url> [시작단추 CSS 선택자]   · PASS = 빗금 0 && 쌓은 .frac ≥ 1 (문제 화면 + 채점 후 복습 화면)
import os from 'node:os';
import { createRequire } from 'node:module';
const GB = `${os.homedir()}/.claude/skills/game-builder`;
const { installFracHooks, probeFractions } = await import(`file://${GB}/tools/check-fraction-runtime.mjs`);
const puppeteer = createRequire(`${GB}/x.js`)('puppeteer');
const url = process.argv[2] || 'http://localhost:5183/';
const startSel = process.argv[3] || '';
const QS = [
  { text: '1/2 + 1/4 = ?', choices: ['3/4', '2/6', '1/6', '2/4'] },
  { text: '3/5 × 5 = ?', choices: ['3', '15/25', '3/25', '8/5'] },
  { text: '2/3 ÷ 2 = ?', choices: ['1/3', '4/3', '2/6 + 1', '1/6'] },
  { text: '1/3 + 1/6 = ?', choices: ['1/2', '2/9', '1/9', '2/3'] },
  { text: '3/4 - 1/4 = ?', choices: ['1/2', '2/8', '1/4', '4/4'] },
];
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage(); await page.setViewport({ width: 1024, height: 768 });
page.on('dialog', (d) => d.dismiss().catch(() => {}));
await installFracHooks(page);
await page.setRequestInterception(true);
const json = (body, status = 200) => ({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
page.on('request', (req) => {
  const u = new URL(req.url());
  if (!/\/api\/hub\//.test(u.pathname)) return req.continue();
  const p = u.pathname.split('/api/hub/')[1];
  if (p === 'me') return req.respond(json({ tix: 0, free: false, school: { name: '시험초등학교', code: 'T1', sido: 'B10' }, todayPts: 0, cap: 40, pass: 4, q: 5, per: 2 }));
  if (p === 'pack') return req.respond(json({ pid: 'x'.repeat(40), qs: QS }));
  if (p === 'grade') return req.respond(json({ right: [true, false, true, true, false], answers: [0, 1, 0, 0, 1], correct: 3, total: 5, pass: 4, tix: 0, ticket: 0 }));
  if (p.startsWith('schools')) return req.respond(json({ today: [], weekly: [] }));
  return req.respond(json({ ok: true, tix: 0 }));
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await page.goto(url, { waitUntil: 'networkidle2', timeout: 40000 }).catch(() => {});
await sleep(1500);
const quizOpen = () => page.evaluate(() => !!document.querySelector('#gb-layer:not([hidden]) [data-gb="quiz"]'));
for (let i = 0; i < 14 && !(await quizOpen()); i++) {
  await page.evaluate((sel) => {
    const vis = (b) => { const r = b.getBoundingClientRect(); const cs = getComputedStyle(b); return r.width > 4 && r.height > 4 && cs.visibility !== 'hidden' && cs.display !== 'none' && !b.disabled; };
    const cand = sel ? [...document.querySelectorAll(sel)] : [...document.querySelectorAll('button,[role=button],a,.btn')].filter((b) => /시작|출전|도전|플레이|play|start|go/i.test(b.textContent || '') && !/설정|랭킹|도움/.test(b.textContent || ''));
    const b = cand.find(vis); if (b) b.click();
  }, startSel);
  await sleep(900);
}
if (!(await quizOpen())) { console.log('FAIL 문제 화면에 못 들어갔다(시작 단추 선택자를 인자로)'); await browser.close(); process.exit(2); }
const hits = [], counts = {};
// 정답 수 «3/5»(gb-msg)·캔버스 HUD 진행 칸은 분수가 아니다 — 이 탐침은 허브 문제 화면(#gb-layer)의 분수만 잰다(게임 본판 캔버스는 각 게임 e2e 몫)
const take = async (tag) => { await page.evaluate(() => { if (!document.getElementById('__only_gb')) { const st = document.createElement('style'); st.id = '__only_gb'; st.textContent = 'body > *:not(#gb-layer){display:none!important}'; document.head.appendChild(st); } }); hits.push(...(await probeFractions(page)).filter((h) => h.where !== 'canvas' && h.where !== 'gb-msg').map((h) => ({ tag, ...h }))); counts[tag] = await page.evaluate(() => document.querySelectorAll('#gb-layer .frac').length); };
await page.click('#gb-layer [data-qgo]'); await page.waitForSelector('#gb-layer .gb-qtext', { timeout: 8000 });
await take('문제');
for (let i = 0; i < 5; i++) { await page.click('#gb-layer [data-pick="0"]').catch(() => {}); await sleep(250); if (i === 2) await take('문제3'); }
await page.waitForSelector('#gb-layer .gb-review', { timeout: 8000 }); await sleep(300);
await take('복습');
await browser.close();
console.log('쌓은 분수(.frac) 수', counts);
if (hits.length) { console.log(`FAIL 빗금 분수 ${hits.length}곳`); for (const h of hits.slice(0, 12)) console.log(' ', h.tag, h.where, h.text); process.exit(1); }
if (!counts['문제'] || !counts['복습']) { console.log('FAIL 쌓은 분수가 화면에 없다 — 측정 무효'); process.exit(1); }
console.log('PASS 빗금 0 · 쌓은 분수 문제/복습 화면 모두 ≥ 1');
