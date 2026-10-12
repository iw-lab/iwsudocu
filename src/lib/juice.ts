// 반응(주스) 키트 배선 — 클래식 스도쿠(gameStore.ts)와 런 모드(RunGame.tsx)가 공유하는 단일 J 인스턴스.
// 정본 키트 = ~/.claude/skills/game-builder/kit/juice/juice.js(내용 수정 금지) → juice-kit.js 로 그대로 복사했다.
// 2026-10-12 사용자 «사용자의 행동에 반응을 과하게 하라. 대단한 일을 하고 있는 것처럼. 전부 붙여».
import { createJuice } from './juice-kit.js';
import { soundManager } from './audio/soundManager';
import { isHapticEnabled } from './utils/haptic';

type SoundName = Parameters<typeof soundManager.play>[0];

// 행동 → 반응 갈래(≥3·'sfx' 필수). 게이트(tools/check-juice.mjs)가 이 이름(JUICE)을 읽는다.
// slowmo·hitstop·burst·kick 은 뺐다 — 이 앱엔 그 효과를 받을 rAF 게임루프·파티클·카메라가 없다(표는 «실제로 일어나는 것»만).
export const JUICE = {
  correct: ['sfx', 'combo', 'pop', 'punch'],
  wrong: ['sfx', 'flash', 'punch'],
  unitComplete: ['sfx', 'pop', 'banner', 'flash'],
  puzzleComplete: ['sfx', 'banner', 'flash', 'haptic'],
  powerup: ['sfx', 'flash', 'punch'],
};

export type JuiceAction = 'correct' | 'wrong' | 'unitComplete' | 'puzzleComplete' | 'powerup';

let instance: ReturnType<typeof createJuice> | null = null;

/** 서버·최초 호출 전엔 null — 호출부는 항상 ?. 로 건다. */
export function getJuice() {
  if (instance) return instance;
  if (typeof document === 'undefined') return null;
  instance = createJuice({
    table: JUICE,
    host: document.body,
    sfx: (name, opts) => soundManager.play(name as SoundName, opts.rate),
    haptics: () => isHapticEnabled(),
  });
  return instance;
}

/** 셀렉터가 가리키는 요소의 화면 중심 좌표 — pop·punch 가 그 자리에서 터지게. 못 찾으면 undefined(가운데로 대신한다). */
export function elementCenter(sel: string): { x: number; y: number } | undefined {
  if (typeof document === 'undefined') return undefined;
  const el = document.querySelector(sel);
  if (!el) return undefined;
  const r = (el as HTMLElement).getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return undefined;
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}
