type SoundName = 'tap' | 'place' | 'correct' | 'wrong' | 'combo1' | 'combo2' | 'combo3' | 'comboMax' | 'comboBreak' | 'hint' | 'undo' | 'complete' | 'levelUp' | 'achievement' | 'streak' | 'dailyComplete' | 'powerup';

// 효과음 파일(game-builder gen-sfx.py 오프라인 렌더 · public/sfx) — 이름 → 파일. 못 불러오면 아래 합성음으로 대신 운다.
const FILES: Partial<Record<SoundName, string>> = {
  tap: 'click', place: 'select', correct: 'point', wrong: 'error', combo1: 'coin', combo2: 'coin', combo3: 'coin',
  comboMax: 'gauge_full', comboBreak: 'lose', hint: 'powerup', undo: 'swoosh', complete: 'win', levelUp: 'gauge_full',
  achievement: 'special', streak: 'coin', dailyComplete: 'win', powerup: 'powerup',
};
const VOLUME: Partial<Record<SoundName, number>> = { tap: 0.35, place: 0.5, undo: 0.4 };

class SoundManager {
  private audioContext: AudioContext | null = null;
  private enabled = true;
  private buffers = new Map<string, AudioBuffer>();
  private loading = false;
  private unlockBound = false;

  /** 첫 사용자 입력에서 AudioContext 를 깨운다(안 하면 배포 후 무음 1순위) + 효과음 파일 미리 받기 */
  bindUnlock() {
    if (this.unlockBound || typeof window === 'undefined') return;
    this.unlockBound = true;
    const wake = () => {
      try {
        const ctx = this.getContext();
        if (ctx.state === 'suspended') void ctx.resume();
        void this.preload();
      } catch {
        // 오디오를 못 쓰는 기기
      }
    };
    window.addEventListener('pointerdown', wake, { capture: true });
    window.addEventListener('keydown', wake, { capture: true });
  }

  private async preload() {
    if (this.loading) return;
    this.loading = true;
    const ctx = this.getContext();
    const names = [...new Set(Object.values(FILES))] as string[];
    await Promise.all(names.map(async (n) => {
      try {
        const res = await fetch(`/sfx/${n}.web.mp3`);
        if (!res.ok) return;
        this.buffers.set(n, await ctx.decodeAudioData(await res.arrayBuffer()));
      } catch {
        // 파일 실패 — 합성음 폴백
      }
    }));
  }

  /** 파일로 울렸으면 true */
  private playFile(sound: SoundName): boolean {
    const name = FILES[sound];
    const buf = name ? this.buffers.get(name) : undefined;
    if (!buf) return false;
    try {
      const ctx = this.getContext();
      const src = ctx.createBufferSource();
      const g = ctx.createGain();
      g.gain.value = VOLUME[sound] ?? 0.7;
      src.buffer = buf;
      src.connect(g);
      g.connect(ctx.destination);
      src.start();
      return true;
    } catch {
      return false;
    }
  }

  /** e2e 용: 지금 몇 개 파일이 준비됐나·컨텍스트 상태 */
  status() {
    return { files: this.buffers.size, state: this.audioContext?.state ?? 'none' };
  }

  private getContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    }
    return this.audioContext;
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }

  private playTone(frequency: number, duration: number, type: OscillatorType = 'sine', volume: number = 0.3) {
    if (!this.enabled) return;
    try {
      const ctx = this.getContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(frequency, ctx.currentTime);
      gain.gain.setValueAtTime(volume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + duration);
    } catch {
      // Audio context not available
    }
  }

  private playChord(frequencies: number[], duration: number, _type: OscillatorType = 'sine', volume: number = 0.15) {
    frequencies.forEach(f => this.playTone(f, duration, _type, volume));
  }

  play(sound: SoundName) {
    if (!this.enabled) return;
    if (this.playFile(sound)) return;

    switch (sound) {
      case 'tap':
        this.playTone(800, 0.05, 'sine', 0.1);
        break;
      case 'place':
        this.playTone(523, 0.1, 'sine', 0.2);
        break;
      case 'correct':
        this.playTone(523, 0.1, 'sine', 0.2);
        setTimeout(() => this.playTone(659, 0.15, 'sine', 0.2), 80);
        break;
      case 'wrong':
        this.playTone(200, 0.15, 'square', 0.15);
        setTimeout(() => this.playTone(180, 0.2, 'square', 0.1), 100);
        break;
      case 'combo1':
        this.playChord([523, 659, 784], 0.2);
        break;
      case 'combo2':
        this.playChord([587, 740, 880], 0.25);
        break;
      case 'combo3':
        this.playChord([659, 831, 988], 0.3);
        break;
      case 'comboMax':
        [0, 80, 160, 240].forEach((delay, i) => {
          setTimeout(() => this.playTone(523 + i * 100, 0.3, 'sine', 0.2), delay);
        });
        break;
      case 'comboBreak':
        this.playTone(300, 0.3, 'sawtooth', 0.1);
        break;
      case 'hint':
        this.playTone(880, 0.1, 'sine', 0.15);
        setTimeout(() => this.playTone(660, 0.1, 'sine', 0.15), 100);
        break;
      case 'undo':
        this.playTone(400, 0.08, 'triangle', 0.15);
        break;
      case 'complete':
        [523, 587, 659, 784, 880, 1047].forEach((freq, i) => {
          setTimeout(() => this.playTone(freq, 0.3, 'sine', 0.2), i * 100);
        });
        break;
      case 'levelUp':
        [523, 659, 784, 1047].forEach((freq, i) => {
          setTimeout(() => this.playTone(freq, 0.4, 'sine', 0.2), i * 150);
        });
        break;
      case 'achievement':
        this.playChord([523, 659, 784], 0.3);
        setTimeout(() => this.playChord([659, 784, 988], 0.4), 200);
        break;
      case 'streak':
        [440, 554, 659, 880].forEach((freq, i) => {
          setTimeout(() => this.playTone(freq, 0.2, 'triangle', 0.15), i * 100);
        });
        break;
      case 'dailyComplete':
        [523, 659, 784, 1047, 784, 1047].forEach((freq, i) => {
          setTimeout(() => this.playTone(freq, 0.25, 'sine', 0.2), i * 120);
        });
        break;
      case 'powerup':
        this.playTone(440, 0.1, 'sine', 0.2);
        setTimeout(() => this.playTone(660, 0.1, 'sine', 0.2), 60);
        setTimeout(() => this.playTone(880, 0.2, 'sine', 0.2), 120);
        break;
    }
  }
}

export const soundManager = new SoundManager();
