'use client';
// 런 모드 화면 — 타임어택·서바이벌·대각선. 규칙은 전부 lib/mini/run.ts(순수)가 정하고 여기는 그리기·입력만 한다.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Eraser, Maximize } from 'lucide-react';
import confetti from 'canvas-confetti';
import { cn } from '@/lib/utils/cn';
import { createRun, place, erase, tick, runRecord, type RunKind, type RunState } from '@/lib/mini/run';
import { boxShape, isDiagCell } from '@/lib/mini/engine';
import { getBest, putBest, bestLabel } from '@/lib/mini/records';
import { startWithTicket, hasTicket, finishTicket, leaveTicket, bindFullscreen, preloadHub } from '@/lib/hub/gb';
import { soundManager } from '@/lib/audio/soundManager';
import { useUserStore } from '@/lib/store/userStore';

export const RUN_META: Record<RunKind, { emoji: string; label: string; how: string }> = {
  time: { emoji: '⏱️', label: '타임어택', how: '90초 · 판을 끝내면 +12초 · 틀리면 −5초' },
  survival: { emoji: '❤️', label: '서바이벌', how: '하트 3개 · 판마다 커져요 · 힌트 없음' },
  rule: { emoji: '✖️', label: '대각선', how: '두 대각선에도 같은 숫자가 들어가면 안 돼요' },
};

type Flash = { cell: number; kind: 'wrong' | 'ok'; key: number } | null;
type Float = { text: string; key: number; tone: 'good' | 'bad' } | null;

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
  const [boardKey, setBoardKey] = useState(0);
  const [result, setResult] = useState<{ value: number; best: boolean } | null>(null);
  const fsRef = useRef<HTMLButtonElement>(null);
  const keyN = useRef(0);

  const sfx = useCallback((name: Parameters<typeof soundManager.play>[0]) => {
    soundManager.setEnabled(sfxOn);
    soundManager.play(name);
  }, [sfxOn]);

  const firstEmpty = (s: RunState, from = 0) => {
    const total = s.grid.length;
    for (let k = 0; k < total; k++) {
      const i = (from + k) % total;
      if (!s.grid[i]) return i;
    }
    return -1;
  };

  const begin = useCallback(() => {
    const seed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
    const s = createRun(kind, seed);
    runRef.current = s;
    setRun(s);
    setSel(firstEmpty(s));
    setResult(null);
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

  // e2e 가 «정답을 아는 사람»처럼 진짜 칸·숫자 단추를 누르게 판 상태를 읽기 전용으로 비춘다(규칙은 그대로)
  useEffect(() => {
    (window as unknown as { __kcRun?: RunState | null }).__kcRun = run;
  }, [run]);

  // 판 도중 화면을 떠나면 이용권 환불(새로고침·탭 닫기는 키트의 pagehide 가 맡는다)
  useEffect(() => () => {
    const s = runRef.current;
    if (s && !s.over) void leaveTicket();
  }, []);

  // 타임어택 시계 — 탭이 숨으면 멈춘다(숨은 탭 타이머는 1초씩 뭉텅 흐른다)
  useEffect(() => {
    if (phase !== 'play' || kind !== 'time') return;
    let last = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      const dt = Math.min(250, now - last);
      last = now;
      if (document.visibilityState === 'hidden') return;
      const s = runRef.current;
      if (!s) return;
      if (tick(s, dt)) end();
      bump();
    }, 100);
    return () => clearInterval(id);
  }, [phase, kind, end, bump]);

  const input = useCallback((v: number) => {
    const s = runRef.current;
    if (!s || phase !== 'play' || sel < 0) return;
    const n = s.spec.n;
    const r = place(s, sel, v);
    const k = ++keyN.current;
    if (r === 'wrong' || r === 'over') {
      setFlash({ cell: sel, kind: 'wrong', key: k });
      sfx('wrong');
      if (kind === 'time') setFloat({ text: '−5초', key: k, tone: 'bad' });
      if (navigator.vibrate) navigator.vibrate(60);
      if (r === 'over') end();
    } else if (r === 'cleared') {
      sfx('complete');
      setFloat({ text: kind === 'time' ? `+12초 · +${n === 4 ? 10 : 30}점` : `${s.cleared}라운드 통과!`, key: k, tone: 'good' });
      confetti({ particleCount: 40, spread: 60, origin: { y: 0.45 }, disableForReducedMotion: true });
      setBoardKey((b) => b + 1);
      setSel(firstEmpty(s));
    } else if (r === 'ok') {
      setFlash({ cell: sel, kind: 'ok', key: k });
      sfx('place');
      const next = firstEmpty(s, sel + 1);
      if (next >= 0) setSel(next);
    }
    bump();
  }, [phase, sel, kind, sfx, end, bump]);

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
    <div className="flex h-dvh flex-col overflow-hidden safe-top" data-run={kind}>
      <header className="mx-auto flex w-full max-w-lg items-center gap-2 px-3 pt-2">
        <button type="button" onClick={goHome} aria-label="홈으로" className="grid h-11 w-11 place-items-center rounded-xl bg-white/10 text-white/80">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1 text-center">
          <p className="text-base font-bold text-white">{meta.emoji} {meta.label}</p>
        </div>
        <button ref={fsRef} type="button" data-gb="fullscreen" aria-label="전체화면" className="grid h-11 w-11 place-items-center rounded-xl bg-white/10 text-white/80">
          <Maximize className="h-5 w-5" />
        </button>
      </header>

      {phase === 'ready' && (
        <main className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
          <div className="text-6xl" aria-hidden>{meta.emoji}</div>
          <h1 className="text-2xl font-extrabold text-white">{meta.label}</h1>
          <p className="text-base text-slate-300">{meta.how}</p>
          {best && <p className="text-sm text-amber-300">{bestLabel(kind, best.value)}</p>}
          <button type="button" data-run-start onClick={again} className="h-14 w-full max-w-xs rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-600 text-lg font-bold text-white shadow-lg shadow-indigo-500/30">
            시작하기
          </button>
        </main>
      )}

      {phase !== 'ready' && s && (
        <main className="mx-auto flex w-full max-w-lg flex-1 flex-col px-3 pb-4 min-h-0">
          <RunBar s={s} kind={kind} />
          <div className="relative flex flex-1 items-center justify-center py-2 min-h-0">
            <Board key={boardKey} s={s} sel={sel} flash={flash} onPick={(i) => { setSel(i); sfx('tap'); }} />
            {float && (
              <div key={float.key} className={cn('run-float pointer-events-none absolute top-6 text-xl font-extrabold', float.tone === 'good' ? 'text-emerald-300' : 'text-rose-400')}>
                {float.text}
              </div>
            )}
          </div>
          <Pad n={s.spec.n} grid={s.grid} onNum={input} onErase={() => { if (erase(s, sel)) { sfx('undo'); bump(); } }} />
        </main>
      )}

      {phase === 'over' && result && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-6" role="dialog" aria-modal="true" data-run-result>
          <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-slate-900 p-6 text-center shadow-2xl">
            <div className="text-5xl" aria-hidden>{result.value > 0 ? '🏆' : '💪'}</div>
            <h2 className="mt-2 text-xl font-extrabold text-white">{kind === 'time' ? '시간 끝!' : '게임 끝!'}</h2>
            <p className="mt-3 text-4xl font-black text-white tabular-nums">{kind === 'time' ? `${result.value}점` : `${result.value}라운드`}</p>
            {result.best && result.value > 0 ? (
              <p className="mt-1 text-sm font-bold text-amber-300">🎉 새 최고 기록!</p>
            ) : (
              best && <p className="mt-1 text-sm text-slate-400">{bestLabel(kind, best.value)}</p>
            )}
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button type="button" onClick={() => router.push('/')} className="h-12 rounded-xl bg-white/10 font-semibold text-white/90">홈</button>
              <button type="button" data-run-again onClick={again} className="h-12 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 font-bold text-white">다시 하기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RunBar({ s, kind }: { s: RunState; kind: RunKind }) {
  if (kind === 'time') {
    const sec = Math.ceil(s.timeLeftMs / 1000);
    const urgent = s.timeLeftMs <= 10_000;
    return (
      <div className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-2" data-run-bar>
        <span className={cn('text-3xl font-black tabular-nums', urgent ? 'text-rose-400 animate-pulse' : 'text-white')} data-run-clock>
          {Math.floor(sec / 60)}:{String(sec % 60).padStart(2, '0')}
        </span>
        <span className="text-right">
          <span className="block text-2xl font-extrabold text-amber-300 tabular-nums" data-run-score>{s.score}점</span>
          <span className="text-xs text-slate-400">{s.spec.n}×{s.spec.n} · {s.cleared + 1}번째 판</span>
        </span>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-2" data-run-bar>
      <span className="text-2xl tracking-wider" aria-label={`하트 ${s.hearts}개`} data-run-hearts={s.hearts}>
        {Array.from({ length: 3 }, (_, i) => (i < s.hearts ? '❤️' : '🤍')).join('')}
      </span>
      <span className="text-right">
        <span className="block text-2xl font-extrabold text-white tabular-nums" data-run-round>{s.cleared + 1}라운드</span>
        <span className="text-xs text-slate-400">{s.spec.n}×{s.spec.n}{s.spec.diag ? ' · 대각선' : ''}</span>
      </span>
    </div>
  );
}

function Board({ s, sel, flash, onPick }: { s: RunState; sel: number; flash: Flash; onPick: (i: number) => void }) {
  const n = s.spec.n;
  const [bh, bw] = boxShape(n);
  const sr = sel >= 0 ? Math.floor(sel / n) : -1, sc = sel >= 0 ? sel % n : -1;
  const selVal = sel >= 0 ? s.grid[sel] : 0;
  const font = n === 4 ? 'text-4xl' : n === 6 ? 'text-3xl' : 'text-2xl';
  return (
    <div
      className="run-board grid aspect-square w-full max-w-[min(100%,62dvh)] overflow-hidden rounded-2xl border-2 border-slate-400/70 bg-slate-900"
      style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}
      data-run-board={n}
    >
      {s.grid.map((v, i) => {
        const r = Math.floor(i / n), c = i % n;
        const given = !!s.board.givens[i];
        const diag = s.spec.diag && isDiagCell(n, i);
        const same = sel >= 0 && i !== sel && (r === sr || c === sc || (Math.floor(r / bh) === Math.floor(sr / bh) && Math.floor(c / bw) === Math.floor(sc / bw)));
        const sameVal = selVal && v === selVal && i !== sel;
        const fl = flash && flash.cell === i ? flash : null;
        return (
          <button
            key={i}
            type="button"
            data-cell={i}
            onClick={() => onPick(i)}
            aria-label={`${r + 1}행 ${c + 1}열 ${v || '빈칸'}`}
            className={cn(
              'relative flex items-center justify-center font-bold select-none transition-colors duration-100',
              font,
              c % bw === bw - 1 && c !== n - 1 ? 'border-r-2 border-r-slate-400/70' : 'border-r border-r-slate-600/50',
              r % bh === bh - 1 && r !== n - 1 ? 'border-b-2 border-b-slate-400/70' : 'border-b border-b-slate-600/50',
              same && 'bg-indigo-400/15',
              sameVal && 'bg-indigo-400/30',
              i === sel && 'bg-indigo-500/60',
              given ? 'text-slate-300' : 'text-sky-200',
              fl?.kind === 'wrong' && 'run-shake bg-rose-500/50',
              fl?.kind === 'ok' && 'run-pop',
            )}
          >
            {/* 대각선 표시는 배경색이 아니라 따로 깐 층 — 선택·같은 줄 강조가 배경을 덮어도 대각선은 계속 보인다 */}
            {diag && <span data-diag aria-hidden className="pointer-events-none absolute inset-0 bg-violet-400/25 ring-1 ring-inset ring-violet-300/30" />}
            <span key={fl?.key ?? 0} className="relative">{v || ''}</span>
          </button>
        );
      })}
    </div>
  );
}

function Pad({ n, grid, onNum, onErase }: { n: number; grid: number[]; onNum: (v: number) => void; onErase: () => void }) {
  const left = (v: number) => n - grid.filter((x) => x === v).length;
  return (
    <div className="grid gap-1.5 pb-[env(safe-area-inset-bottom)]" style={{ gridTemplateColumns: `repeat(${n + 1}, 1fr)` }} data-run-pad>
      {Array.from({ length: n }, (_, k) => k + 1).map((v) => (
        <button
          key={v}
          type="button"
          data-num={v}
          onClick={() => onNum(v)}
          disabled={left(v) <= 0}
          className="flex h-14 flex-col items-center justify-center rounded-xl bg-white/10 text-2xl font-bold text-white active:scale-95 disabled:opacity-30"
        >
          {v}
        </button>
      ))}
      <button type="button" onClick={onErase} aria-label="지우기" className="flex h-14 items-center justify-center rounded-xl bg-white/10 text-white/80 active:scale-95">
        <Eraser className="h-6 w-6" />
      </button>
    </div>
  );
}
