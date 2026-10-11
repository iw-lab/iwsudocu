// 모드별 최고 기록 — localStorage `kanchaeum:best` · {version, data} 래퍼(같은 도메인의 다른 게임과 키가 안 겹치게)
import type { RunKind } from './run';

const KEY = 'kanchaeum:best';
const VERSION = 1;

export interface RunBest {
  value: number;
  at: string;
}
type Data = Partial<Record<RunKind, RunBest>>;

function load(): Data {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null') as { version: number; data: Data } | null;
    if (!raw || raw.version !== VERSION || typeof raw.data !== 'object') return {};
    return raw.data;
  } catch {
    return {};
  }
}

export function getBest(kind: RunKind): RunBest | null {
  return load()[kind] ?? null;
}

/** 더 좋으면 저장하고 true */
export function putBest(kind: RunKind, value: number): boolean {
  const d = load();
  const old = d[kind];
  if (old && old.value >= value) return false;
  d[kind] = { value, at: new Date().toISOString() };
  try {
    localStorage.setItem(KEY, JSON.stringify({ version: VERSION, data: d }));
  } catch {
    // 저장소가 막힌 기기 — 기록만 안 남는다
  }
  return true;
}

export function bestLabel(kind: RunKind, v: number | undefined | null): string {
  if (v == null) return '';
  return kind === 'time' ? `최고 ${v}점` : `최고 ${v}라운드`;
}
