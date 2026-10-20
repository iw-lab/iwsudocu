'use client';
// 학교 허브(game-builder 기본틀 키트) 연결 — 이용권 영수증을 판 하나에 묶어 두고 끝/나감에 정산한다.
// 키트 원본(src/gb)은 고치지 않는다. 여기만 칸채움 쪽 접착제다.
// 🔴 키트는 모듈 맨 위에서 document·addEventListener 를 만진다 → 정적 import 하면 Next 정적 내보내기(서버 렌더)가 죽는다.
//    그래서 화면이 뜨면 미리 불러 두고(preloadHub), 클릭 처리기에서는 «이미 불러 둔» 모듈을 동기로 쓴다(자동 전체화면은 제스처 안에서만 된다).
import toast from 'react-hot-toast';
import { soundManager } from '@/lib/audio/soundManager';

type School = typeof import('@/gb/gb-school.js');
type Fs = typeof import('@/gb/gb-fullscreen.js');
interface Kit { school: School; fs: Fs }

let kit: Kit | null = null;
let loading: Promise<Kit> | null = null;

export function preloadHub(): Promise<Kit> {
  if (kit) return Promise.resolve(kit);
  if (!loading) {
    loading = Promise.all([import('@/gb/hubnet.js'), import('@/gb/gb-school.js'), import('@/gb/gb-fullscreen.js')]).then(([net, school, fs]) => {
      net.configureHub({ key: 'kanchaeum.hub.v1', direct: 'https://kanchaeum-hub.simssijjang-a04.workers.dev' });   // 배포본 = 허브 워커 직결(daum Pages 함수 공용 한도와 무관 · 2026-10-20)
      school.configureSchool({ playWord: '판', sfx: { tick: () => soundManager.play('tap'), win: () => soundManager.play('levelUp') } });
      kit = { school, fs };
      return kit;
    });
  }
  return loading;
}

export type TicketKind = 'classic' | 'daily' | 'time' | 'survival' | 'rule';
interface Ticket { ref: string | null; kind: TicketKind; at: number }

const KEY = 'kanchaeum:ticket';
/** 받은 지 이만큼 지난 영수증은 쓰지 않는다(다른 날 남은 영수증으로 시작하는 일 방지) */
const TTL_MS = 30 * 60 * 1000;

function read(): Ticket | null {
  try {
    const t = JSON.parse(sessionStorage.getItem(KEY) || 'null') as Ticket | null;
    if (!t || Date.now() - t.at > TTL_MS) return null;
    return t;
  } catch {
    return null;
  }
}
function write(t: Ticket | null): void {
  try {
    if (t) sessionStorage.setItem(KEY, JSON.stringify(t));
    else sessionStorage.removeItem(KEY);
  } catch {
    // 저장소가 막힌 기기 — 이번 판 학교 점수만 빠진다
  }
}

/**
 * 판 시작 관문. 🔴 반드시 클릭 처리기 «안에서 바로» 부른다.
 * 허브가 죽었으면 ref=null 로 바로 go — 판은 하고 학교 점수만 없다.
 */
export function startWithTicket(kind: TicketKind, go: () => void): void {
  const run = (k: Kit) =>
    void k.school.gbGate((ref) => {
      write({ ref, kind, at: Date.now() });
      go();
    }, { kind });
  if (kit) {
    run(kit);
    return;
  }
  // 아직 못 불러왔으면 전체화면만 제스처 안에서 먼저 부르고, 관문은 불러온 뒤에
  try {
    const el = document.documentElement as HTMLElement & { requestFullscreen?: () => Promise<void> };
    if (!document.fullscreenElement && el.requestFullscreen) void el.requestFullscreen().catch(() => {});
  } catch {
    // 전체화면을 못 쓰는 기기
  }
  void preloadHub().then(run, () => go());
}

/** 그 종류의 영수증을 들고 있는가(홈에서 받아 온 채로 판 화면에 들어왔는가) */
export function hasTicket(kind: TicketKind): boolean {
  const t = read();
  return !!t && t.kind === kind;
}

/** 판 끝 — 영수증을 쓰고 학교 점수를 올린다. 영수증이 없으면 아무것도 안 한다 */
export async function finishTicket(cleared: boolean): Promise<void> {
  const t = read();
  write(null);
  if (!t || !t.ref) return;
  const k = await preloadHub();
  const r = await k.school.gbFinish(t.ref, cleared);
  if (r && r.added > 0 && r.school) toast(`🏫 ${k.school.shortSchool(r.school)} +${r.added}점`, { icon: '🎉', duration: 3000 });
}

/** 판 도중 나감 — 영수증 환불 */
export async function leaveTicket(): Promise<void> {
  const t = read();
  write(null);
  if (!t || !t.ref) return;
  const k = await preloadHub();
  await k.school.gbLeave(t.ref);
}

/** 첫 화면 «맨 위» 학교 순위 */
export async function mountRank(el: HTMLElement): Promise<void> {
  const k = await preloadHub();
  k.school.mountSchoolRank(el);
}

/** 전체화면 단추 */
export async function bindFullscreen(el: HTMLElement | null): Promise<void> {
  if (!el) return;
  const k = await preloadHub();
  k.fs.bindFullscreenButton(el);
}
