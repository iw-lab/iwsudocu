'use client';
// 런 모드 화면 — 타임어택·서바이벌·대각선. 규칙은 전부 lib/mini/run.ts(순수)가 정하고 여기는 그리기·입력·손맛만 한다.
// 손맛: 타일 눌림 · 맞히면 뒤집히며 숫자 등장 · 연속 정답마다 음이 오른다 · 줄/상자를 채우면 빛 물결 · 판을 끝내면 타일 물결 후 새 판.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Eraser, Maximize } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { createRun, place, erase, tick, runRecord, type RunKind, type RunState } from '@/lib/mini/run';
import { boxShape, isDiagCell, geometry } from '@/lib/mini/engine';
import { getBest, putBest, bestLabel } from '@/lib/mini/records';
import { startWithTicket, hasTicket, finishTicket, leaveTicket, bindFullscreen, preloadHub } from '@/lib/hub/gb';
import { soundManager } from '@/lib/audio/soundManager';
import { music } from '@/lib/audio/music';
import { hapticError, hapticHeavy, hapticLight, hapticSuccess } from '@/lib/utils/haptic';
import { useUserStore } from '@/lib/store/userStore';
import { getJuice, elementCenter } from '@/lib/juice';

export const RUN_META: Record<RunKind, { emoji: string; label: string; how: string }> = {
  time: { emoji: '⏱️', label: '타임어택', how: '90초 · 판을 끝내면 +12초 · 틀리면 −5초' },
  survival: { emoji: '❤️', label: '서바이벌', how: '하트 3개 · 판마다 커져요 · 힌트 없음' },
  rule: { emoji: '📐', label: '대각선', how: '두 대각선에도 같은 숫자가 들어가면 안 돼요' },
};

/** 판을 끝낸 뒤 물결을 보여 주는 시간 — 그동안은 입력·시계를 멈춘다 */
const CLEAR_MS = 650;

type Flash = { cell: number; kind: 'wrong' | 'ok'; key: number } | null;
type Float = { text: string; key: number; tone: 'good' | 'bad' } | null;
/** 줄·상자 완성 물결 — 칸마다 출발점에서의 거리만큼 늦게 */
type Wave = { delay: Map<number, number>; key: number } | null;
/** 끝낸 판 스냅숏(새 판이 깔리기 전 물결용) */
type Clearing = { grid: number[]; givens: number[]; n: number; diag: boolean; from: number; key: number } | null;

export default function RunGame({ kind }: { kind: RunKind }) {
  const router = useRouter();
  const meta = RUN_META[kind];
  const sfxOn = useUserStore((s) => s.profile.settings.soundEnabled);
  // 판 상태는 run.ts 가 제자리에서 바꾸는 객체 하나 — 화면은 setVer 로 다시 그린다. runRef 는 처리기·정리용 거울.
  const [run, setRun] = useState<RunState | null>(null);
  const runRef = useRef<RunState | null>(null);
  const [, setVer] = useState(0);
  const bump = useCallback(() => setVer((v) => v + 1), []);
  const [phase, setPhase] = useState<'ready' | 'play' | 'over'>('ready');
  const [sel, setSel] = useState<number>(-1);
  const [flash, setFlash] = useState<Flash>(null);
  const [float, setFloat] = useState<Float>(null);
  const [wave, setWave] = useState<Wave>(null);
  const [clearing, setClearing] = useState<Clearing>(null);
  const clearingRef = useRef(false);
  const [combo, setCombo] = useState(0);
  const comboRef = useRef(0);
  const [boardKey, setBoardKey] = useState(0);
  const [result, setResult] = useState<{ value: number; best: boolean } | null>(null);
  const fsRef = useRef<HTMLButtonElement>(null);
  const keyN = useRef(0);

  const sfx = useCallback((name: Parameters<typeof soundManager.play>[0], rate = 1) => {
    soundManager.setEnabled(sfxOn);
    soundManager.play(name, rate);
  }, [sfxOn]);

  // 반응 키트 HUD 펀치 타깃 — 모드마다 점수·라운드 표시가 다른 요소라 셀렉터도 다르다
  const punchGood = kind === 'time' ? '[data-run-score]' : '[data-run-round]';
  const punchBad = kind === 'time' ? '[data-run-clock]' : '[data-run-hearts]';

  const firstEmpty = (s: RunState, from = 0) => {
    const total = s.grid.length;
    for (let k = 0; k < total; k++) {
      const i = (from + k) % total;
      if (!s.grid[i]) return i;
    }
    return -1;
  };

  const setComboN = (v: number) => {
    comboRef.current = v;
    setCombo(v);
  };

  const begin = useCallback(() => {
    const seed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
    const s = createRun(kind, seed);
    runRef.current = s;
    setRun(s);
    setSel(firstEmpty(s));
    setResult(null);
    setClearing(null);
    clearingRef.current = false;
    comboRef.current = 0;
    setCombo(0);
    setBoardKey((k) => k + 1);
    setPhase('play');
    bump();
  }, [kind, bump]);

  const end = useCallback(() => {
    const s = runRef.current;
    if (!s) return;
    const value = runRecord(s);
    const best = putBest(kind, value);
    setResult({ value, best });
    setPhase('over');
    sfx(s.cleared > 0 ? 'complete' : 'comboBreak');
    if (s.cleared > 0) hapticHeavy();
    void finishTicket(s.cleared > 0);
  }, [kind, sfx]);

  // 홈에서 이용권을 받아 왔으면 바로 시작, 아니면 «시작하기» 단추가 관문을 연다
  useEffect(() => {
    void preloadHub();
    void bindFullscreen(fsRef.current);
    // 이용권은 sessionStorage 에만 있다 — 마운트 뒤에 한 번 보고 바로 시작한다
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (hasTicket(kind)) begin();
  }, [kind, begin]);

  // 배경음악: 타임어택 판 중에만 빠른 곡, 나머지는 잔잔한 곡(한 곡만 울리게 크로스페이드)
  useEffect(() => {
    music.track(kind === 'time' && phase === 'play' ? 'rush' : 'calm');
  }, [kind, phase]);
  useEffect(() => () => music.track('calm'), []);

  // e2e 가 «정답을 아는 사람»처럼 진짜 칸·숫자 단추를 누르게 판 상태를 읽기 전용으로 비춘다(규칙은 그대로)
  useEffect(() => {
    (window as unknown as { __kcRun?: RunState | null }).__kcRun = run;
  }, [run]);

  // 판 도중 화면을 떠나면 이용권 환불(새로고침·탭 닫기는 키트의 pagehide 가 맡는다)
  useEffect(() => () => {
    const s = runRef.current;
    if (s && !s.over) void leaveTicket();
  }, []);

  // 타임어택 시계 — 탭이 숨으면 멈춘다(숨은 탭 타이머는 1초씩 뭉텅 흐른다) · 판 끝 물결 동안도 멈춘다
  useEffect(() => {
    if (phase !== 'play' || kind !== 'time') return;
    let last = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      const dt = Math.min(250, now - last);
      last = now;
      if (document.visibilityState === 'hidden' || clearingRef.current) return;
      const s = runRef.current;
      if (!s) return;
      if (tick(s, dt)) end();
      bump();
    }, 100);
    return () => clearInterval(id);
  }, [phase, kind, end, bump]);

  const input = useCallback((v: number) => {
    const s = runRef.current;
    if (!s || phase !== 'play' || sel < 0 || clearingRef.current) return;
    const n = s.spec.n;
    // 끝낼 판의 모습을 먼저 떠 둔다(place 가 'cleared' 면 곧바로 다음 판으로 바뀐다)
    const before = { grid: s.board.solution.slice(), givens: s.board.givens.slice(), n, diag: s.spec.diag };
    const r = place(s, sel, v);
    const k = ++keyN.current;
    if (r === 'wrong' || r === 'over') {
      setFlash({ cell: sel, kind: 'wrong', key: k });
      setComboN(0);
      getJuice()?.fire('wrong', { sfx: 'wrong', ...elementCenter(`[data-cell="${sel}"]`), punch: punchBad });
      hapticError();
      if (kind === 'time') setFloat({ text: '−5초', key: k, tone: 'bad' });
      if (r === 'over') end();
    } else if (r === 'cleared') {
      setComboN(comboRef.current + 1);
      getJuice()?.fire('puzzleComplete', { sfx: 'complete', title: kind === 'time' ? '클리어!' : `${s.cleared}라운드 통과!`, vib: [10, 50, 20] });
      setFloat({ text: kind === 'time' ? `+12초 · +${n === 4 ? 10 : 30}점` : `${s.cleared}라운드 통과!`, key: k, tone: 'good' });
      clearingRef.current = true;
      setClearing({ ...before, from: sel, key: k });
      setTimeout(() => {
        clearingRef.current = false;
        setClearing(null);
        setBoardKey((b) => b + 1);
        const cur = runRef.current;
        if (cur) setSel(firstEmpty(cur));
      }, CLEAR_MS);
    } else if (r === 'ok') {
      const c = comboRef.current + 1;
      setComboN(c);
      setFlash({ cell: sel, kind: 'ok', key: k });
      // 연속 정답마다 반음씩(J 내부 콤보 갈래가 맡는다 — 3·5·10 연속에선 추가 배너도)
      getJuice()?.fire('correct', { sfx: 'place', ...elementCenter(`[data-cell="${sel}"]`), punch: punchGood });
      hapticLight();
      // 이 칸으로 줄·상자·대각선이 다 찼으면 그 칸들에 빛 물결
      const g = geometry({ n, diag: s.spec.diag });
      const done = g.unitsOf[sel].filter((u) => g.units[u].every((i) => s.grid[i]));
      if (done.length) {
        const delay = new Map<number, number>();
        const r0 = Math.floor(sel / n), c0 = sel % n;
        for (const u of done) for (const i of g.units[u]) {
          const d = Math.abs(Math.floor(i / n) - r0) + Math.abs((i % n) - c0);
          delay.set(i, Math.min(delay.get(i) ?? 99, d));
        }
        setWave({ delay, key: k });
        getJuice()?.fire('unitComplete', { sfx: 'correct', ...elementCenter(`[data-cell="${sel}"]`), text: '완성!' });
        hapticSuccess();
      }
      const next = firstEmpty(s, sel + 1);
      if (next >= 0) setSel(next);
    }
    bump();
  }, [phase, sel, kind, end, bump, punchGood, punchBad]);

  // 키보드(PC): 숫자 · 방향키 · 지우기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = runRef.current;
      if (!s || phase !== 'play') return;
      const n = s.spec.n;
      if (/^[1-9]$/.test(e.key) && Number(e.key) <= n) { input(Number(e.key)); return; }
      if (e.key === 'Backspace' || e.key === 'Delete') { if (erase(s, sel)) bump(); return; }
      const mv: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
      const d = mv[e.key];
      if (!d) return;
      e.preventDefault();
      const r0 = sel < 0 ? 0 : Math.floor(sel / n), c0 = sel < 0 ? 0 : sel % n;
      setSel(((r0 + d[0] + n) % n) * n + ((c0 + d[1] + n) % n));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, sel, input, bump]);

  const goHome = () => {
    const s = runRef.current;
    if (s && !s.over && phase === 'play') { s.over = true; void leaveTicket(); }
    router.push('/');
  };
  const again = () => startWithTicket(kind, begin);

  const s = run;
  const best = getBest(kind);

  return (
    <div className="run-screen flex h-dvh flex-col overflow-hidden safe-top" data-run={kind}>
      <header className="mx-auto flex w-full max-w-lg items-center gap-2 px-4 pt-2">
        <button type="button" onClick={goHome} aria-label="홈으로" className="run-icon">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <p className="flex-1 text-center text-[15px] font-bold tracking-tight text-white/90">{meta.label}</p>
        <button ref={fsRef} type="button" data-gb="fullscreen" aria-label="전체화면" className="run-icon">
          <Maximize className="h-5 w-5" />
        </button>
      </header>

      {phase === 'ready' && (
        <main className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
          <div className="run-badge" aria-hidden>{meta.emoji}</div>
          <h1 className="text-2xl font-extrabold tracking-tight text-white">{meta.label}</h1>
          <p className="text-[15px] leading-relaxed text-slate-400">{meta.how}</p>
          {best && <p className="text-sm font-semibold text-amber-300/90">{bestLabel(kind, best.value)}</p>}
          <button type="button" data-run-start onClick={again} className="run-cta mt-2 w-full max-w-xs">시작하기</button>
        </main>
      )}

      {phase !== 'ready' && s && (
        <main className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4 pb-4 min-h-0">
          <RunBar s={s} kind={kind} combo={combo} />
          <div className="relative flex flex-1 items-center justify-center py-3 min-h-0">
            {clearing ? (
              <ClearBoard c={clearing} />
            ) : (
              <Board key={`board-${boardKey}`} s={s} sel={sel} flash={flash} wave={wave} onPick={(i) => { setSel(i); sfx('tap'); hapticLight(); }} />
            )}
            {float && (
              <div key={`float-${float.key}`} className={cn('run-float pointer-events-none absolute top-4 text-xl font-extrabold drop-shadow', float.tone === 'good' ? 'text-emerald-300' : 'text-rose-400')}>
                {float.text}
              </div>
            )}
          </div>
          <Pad n={s.spec.n} grid={s.grid} onNum={input} onErase={() => { if (erase(s, sel)) { sfx('undo'); hapticLight(); bump(); } }} />
        </main>
      )}

      {phase === 'over' && result && (
        <div className="run-sheet-bg" role="dialog" aria-modal="true" data-run-result>
          <div className="run-sheet">
            <div className="run-badge" aria-hidden>{result.value > 0 ? '🏆' : '💪'}</div>
            <h2 className="mt-3 text-lg font-bold text-white/80">{kind === 'time' ? '시간 끝!' : '게임 끝!'}</h2>
            <p className="mt-1 text-5xl font-black tracking-tight text-white tabular-nums">{kind === 'time' ? `${result.value}점` : `${result.value}라운드`}</p>
            {result.best && result.value > 0 ? (
              <p className="mt-2 text-sm font-bold text-amber-300">새 최고 기록!</p>
            ) : (
              best && <p className="mt-2 text-sm text-slate-400">{bestLabel(kind, best.value)}</p>
            )}
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button type="button" onClick={() => router.push('/')} className="run-ghost">홈</button>
              <button type="button" data-run-again onClick={again} className="run-cta">다시 하기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RunBar({ s, kind, combo }: { s: RunState; kind: RunKind; combo: number }) {
  const chip = combo >= 3 ? <span key={combo} className="run-combo">{combo}연속</span> : null;
  if (kind === 'time') {
    const sec = Math.ceil(s.timeLeftMs / 1000);
    const urgent = s.timeLeftMs <= 10_000;
    return (
      <div className="run-bar" data-run-bar>
        <span className={cn('text-3xl font-black tabular-nums tracking-tight', urgent ? 'text-rose-400 animate-pulse' : 'text-white')} data-run-clock>
          {Math.floor(sec / 60)}:{String(sec % 60).padStart(2, '0')}
        </span>
        {chip}
        <span className="text-right leading-tight">
          <span className="block text-2xl font-extrabold text-amber-300 tabular-nums" data-run-score>{s.score}점</span>
          <span className="text-xs text-slate-500">{s.spec.n}×{s.spec.n} · {s.cleared + 1}번째 판</span>
        </span>
      </div>
    );
  }
  return (
    <div className="run-bar" data-run-bar>
      <span className="flex gap-1 text-xl" aria-label={`하트 ${s.hearts}개`} data-run-hearts={s.hearts}>
        {Array.from({ length: 3 }, (_, i) => <span key={i} className={i < s.hearts ? '' : 'opacity-20 grayscale'}>❤️</span>)}
      </span>
      {chip}
      <span className="text-right leading-tight">
        <span className="block text-2xl font-extrabold text-white tabular-nums" data-run-round>{s.cleared + 1}라운드</span>
        <span className="text-xs text-slate-500">{s.spec.n}×{s.spec.n}{s.spec.diag ? ' · 대각선' : ''}</span>
      </span>
    </div>
  );
}

/** 상자 단위로 묶은 타일 격자 — 상자 사이는 넓은 틈, 칸 사이는 좁은 틈 */
function Grid({ n, children }: { n: number; children: (i: number) => React.ReactNode }) {
  const [bh, bw] = boxShape(n);
  const boxes: number[][] = [];
  for (let br = 0; br < n; br += bh) for (let bc = 0; bc < n; bc += bw) {
    const cells: number[] = [];
    for (let r = br; r < br + bh; r++) for (let c = bc; c < bc + bw; c++) cells.push(r * n + c);
    boxes.push(cells);
  }
  return (
    <div className="run-board grid aspect-square w-full max-w-[min(100%,58dvh)] min-w-0" style={{ gridTemplateColumns: `repeat(${n / bw}, minmax(0, 1fr))`, gap: n === 9 ? 5 : 7 }} data-run-board={n}>
      {boxes.map((cells, b) => (
        <div key={b} className="grid" style={{ gridTemplateColumns: `repeat(${bw}, minmax(0, 1fr))`, gap: n === 9 ? 3 : 5 }}>
          {cells.map((i) => children(i))}
        </div>
      ))}
    </div>
  );
}

function Board({ s, sel, flash, wave, onPick }: { s: RunState; sel: number; flash: Flash; wave: Wave; onPick: (i: number) => void }) {
  const n = s.spec.n;
  const [bh, bw] = boxShape(n);
  const sr = sel >= 0 ? Math.floor(sel / n) : -1, sc = sel >= 0 ? sel % n : -1;
  const selVal = sel >= 0 ? s.grid[sel] : 0;
  const font = n === 4 ? 'text-4xl' : n === 6 ? 'text-3xl' : 'text-xl';
  return (
    <Grid n={n}>
      {(i) => {
        const v = s.grid[i];
        const r = Math.floor(i / n), c = i % n;
        const given = !!s.board.givens[i];
        const diag = s.spec.diag && isDiagCell(n, i);
        const peer = sel >= 0 && i !== sel && (r === sr || c === sc || (Math.floor(r / bh) === Math.floor(sr / bh) && Math.floor(c / bw) === Math.floor(sc / bw)));
        const sameVal = !!selVal && v === selVal && i !== sel;
        const fl = flash && flash.cell === i ? flash : null;
        const wd = wave?.delay.get(i);
        return (
          <button
            key={i}
            type="button"
            data-cell={i}
            onClick={() => onPick(i)}
            aria-label={`${r + 1}행 ${c + 1}열 ${v || '빈칸'}`}
            className={cn(
              'run-tile', font,
              given ? 'run-tile--given' : v ? 'run-tile--mine' : 'run-tile--empty',
              peer && 'run-tile--peer',
              sameVal && 'run-tile--same',
              i === sel && 'run-tile--sel',
              fl?.kind === 'wrong' && 'run-shake run-tile--wrong',
              fl?.kind === 'ok' && 'run-flip',
              wd != null && 'run-wave',
            )}
            style={wd != null ? { animationDelay: `${wd * 45}ms` } : undefined}
          >
            {/* 대각선 표시는 배경색이 아니라 따로 깐 층 — 선택·같은 줄 강조가 배경을 덮어도 대각선은 계속 보인다 */}
            {diag && <span data-diag aria-hidden className="run-diag" />}
            <span key={`${fl?.key ?? 0}-${wave?.key ?? 0}`} className="relative">{v || ''}</span>
          </button>
        );
      }}
    </Grid>
  );
}

/** 끝낸 판 — 마지막 칸에서 퍼지는 물결로 타일이 튀어 오른다(입력 없음) */
function ClearBoard({ c }: { c: NonNullable<Clearing> }) {
  const { n } = c;
  const r0 = Math.floor(c.from / n), c0 = c.from % n;
  const font = n === 4 ? 'text-4xl' : n === 6 ? 'text-3xl' : 'text-xl';
  return (
    <Grid n={n}>
      {(i) => {
        const d = Math.abs(Math.floor(i / n) - r0) + Math.abs((i % n) - c0);
        return (
          <div key={i} className={cn('run-tile run-clear', font, c.givens[i] ? 'run-tile--given' : 'run-tile--mine')} style={{ animationDelay: `${d * 40}ms` }}>
            {c.diag && isDiagCell(n, i) && <span aria-hidden className="run-diag" />}
            <span className="relative">{c.grid[i]}</span>
          </div>
        );
      }}
    </Grid>
  );
}

function Pad({ n, grid, onNum, onErase }: { n: number; grid: number[]; onNum: (v: number) => void; onErase: () => void }) {
  const left = (v: number) => n - grid.filter((x) => x === v).length;
  return (
    <div className="grid gap-2 pb-[env(safe-area-inset-bottom)]" style={{ gridTemplateColumns: `repeat(${n + 1}, minmax(0, 1fr))` }} data-run-pad>
      {Array.from({ length: n }, (_, k) => k + 1).map((v) => (
        <button key={v} type="button" data-num={v} onClick={() => onNum(v)} disabled={left(v) <= 0} className="run-key">
          {v}
        </button>
      ))}
      <button type="button" onClick={onErase} aria-label="지우기" className="run-key run-key--erase">
        <Eraser className="h-5 w-5" />
      </button>
    </div>
  );
}
