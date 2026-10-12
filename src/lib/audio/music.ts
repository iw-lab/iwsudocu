// 배경음악 — 파일 루프 2곡(gen-bgm.sh 로컬 생성): calm(홈·클래식·서바이벌·대각선) · rush(타임어택).
// 🔴 두 곡을 겹쳐 깔지 않는다 — 바꿀 땐 한 곡만 울리는 크로스페이드(game-builder 규칙).
// 🔴 <audio loop> 는 mp3 앞뒤 여백 때문에 이음새에서 «툭» 끊긴다 → Web Audio 버퍼 루프(샘플 단위로 이어진다).
// 🔴 브라우저는 첫 사용자 입력 전 재생을 막는다 → bind() 가 첫 탭에서 시작한다. 탭이 숨으면 멈춘다.
export type Track = 'calm' | 'rush';

const SRC: Record<Track, string> = { calm: '/bgm/bgm_calm.mp3', rush: '/bgm/bgm_rush.mp3' };
const VOL = 0.3;
const FADE_S = 0.9;

interface Voice { src: AudioBufferSourceNode; gain: GainNode; startedAt: number }

class Music {
  private ctx: AudioContext | null = null;
  private bufs: Partial<Record<Track, AudioBuffer>> = {};
  private loading: Partial<Record<Track, Promise<AudioBuffer | null>>> = {};
  private voice: Partial<Record<Track, Voice>> = {};
  private want: Track = 'calm';
  private on = true;
  private unlocked = false;
  private bound = false;

  private context(): AudioContext {
    if (!this.ctx) {
      const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new C();
    }
    return this.ctx;
  }

  private load(t: Track): Promise<AudioBuffer | null> {
    if (this.bufs[t]) return Promise.resolve(this.bufs[t]!);
    if (!this.loading[t]) {
      this.loading[t] = fetch(SRC[t])
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
        .then((ab) => this.context().decodeAudioData(ab))
        .then((b) => { this.bufs[t] = b; return b; })
        .catch(() => { this.loading[t] = undefined; return null; });
    }
    return this.loading[t]!;
  }

  private startVoice(t: Track, buf: AudioBuffer) {
    const ctx = this.context();
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(VOL, ctx.currentTime + FADE_S);
    gain.connect(ctx.destination);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(gain);
    src.start();
    this.voice[t] = { src, gain, startedAt: ctx.currentTime };
  }

  private stopVoice(t: Track) {
    const v = this.voice[t];
    if (!v || !this.ctx) return;
    const now = this.ctx.currentTime;
    v.gain.gain.cancelScheduledValues(now);
    v.gain.gain.setValueAtTime(v.gain.gain.value, now);
    v.gain.gain.linearRampToValueAtTime(0, now + FADE_S);
    try { v.src.stop(now + FADE_S + 0.05); } catch { /* 이미 멈춤 */ }
    this.voice[t] = undefined;
  }

  private apply() {
    if (typeof window === 'undefined' || !this.unlocked) return;
    const live = this.on && document.visibilityState !== 'hidden';
    const ctx = this.context();
    if (live && ctx.state === 'suspended') void ctx.resume();
    for (const t of Object.keys(SRC) as Track[]) {
      if (t === this.want && live) {
        if (this.voice[t]) continue;
        const want = t;
        void this.load(t).then((b) => {
          // 받는 동안 곡이 바뀌었거나 꺼졌으면 틀지 않는다
          if (!b || this.want !== want || !this.on || this.voice[want] || document.visibilityState === 'hidden') return;
          this.startVoice(want, b);
        });
      } else if (this.voice[t]) {
        this.stopVoice(t);
      }
    }
  }

  /** 첫 입력에서 시작 + 탭 숨김/복귀 처리. 여러 번 불러도 한 번만 건다 */
  bind() {
    if (this.bound || typeof window === 'undefined') return;
    this.bound = true;
    const wake = () => {
      if (this.unlocked) return;
      this.unlocked = true;
      this.apply();
    };
    window.addEventListener('pointerdown', wake, { capture: true });
    window.addEventListener('keydown', wake, { capture: true });
    document.addEventListener('visibilitychange', () => this.apply());
  }

  setEnabled(on: boolean) {
    this.on = on;
    this.apply();
  }

  track(t: Track) {
    if (this.want === t) return;
    this.want = t;
    this.apply();
  }

  /** e2e 용 — 지금 울리는 곡(버퍼가 실제로 돌고 있는 것만) */
  status() {
    const playing = (Object.keys(SRC) as Track[]).filter((t) => !!this.voice[t]);
    return { want: this.want, on: this.on, unlocked: this.unlocked, playing, ctx: this.ctx?.state ?? 'none' };
  }
}

export const music = new Music();
