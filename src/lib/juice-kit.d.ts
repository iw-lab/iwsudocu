// juice-kit.js 의 손 타입 — TS 가 allowJs 교차 추론으로 구조분해 기본값을 놓쳐(table 등이 사라짐) 직접 선언한다.
// 정본은 juice-kit.js(복사본, 내용 수정 금지) — 이 파일은 그 모양만 설명한다.
export const CHANNELS: string[];

export function validateJuiceTable(table: Record<string, string[]>): string[];

export interface JuiceFireOptions {
  x?: number;
  y?: number;
  n?: number;
  text?: string;
  color?: string;
  sfx?: string;
  vol?: number;
  comboColor?: string;
  big?: number;
  punch?: string | string[];
  flashColor?: string;
  flashAlpha?: number;
  slowSec?: number;
  stopSec?: number;
  title?: string;
  bannerSec?: number;
  vib?: number[];
}

export interface Juice {
  readonly combo: number;
  fire(action: string, o?: JuiceFireOptions): void;
  time(dt: number): number;
  pop(text: string, x: number, y: number, color?: string, big?: number): void;
  punch(sel: string | Element, big?: number): void;
  flash(color?: string, a?: number): void;
  banner(text: string, color?: string, sec?: number): void;
  destroy(): void;
}

export interface CreateJuiceOptions {
  table: Record<string, string[]>;
  host?: HTMLElement;
  sfx?: (name: string, opts: { rate: number; vol: number }) => void;
  burst?: (o: JuiceFireOptions & { action: string; mult: number }) => void;
  kick?: (o: JuiceFireOptions & { action: string; mult: number }) => void;
  punch?: Record<string, string | string[]>;
  haptics?: () => boolean;
  comboWindow?: number;
}

export function createJuice(opts: CreateJuiceOptions): Juice;
