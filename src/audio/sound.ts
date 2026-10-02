// Short sounds made with Web Audio oscillators – no audio files to download.
// The active theme colours them (wave shape, pitch). Off when the profile turned sounds off,
// and silent until the first touch: browsers block audio before it, and nobody wants an app
// that beeps on its own. On iPhone the "ambient" audio session follows the silent switch.
import { currentTheme } from '../themes/index';

export type SoundName = 'move' | 'capture' | 'check' | 'wrong' | 'star' | 'done' | 'win';

/** [frequency Hz, start s, length s, volume 0–1] */
type Note = [number, number, number, number];

const NOTES: Record<SoundName, Note[]> = {
  move: [[392, 0, 0.07, 0.35]],
  capture: [
    [330, 0, 0.06, 0.45],
    [220, 0.05, 0.1, 0.45]
  ],
  check: [
    [784, 0, 0.09, 0.35],
    [988, 0.1, 0.14, 0.35]
  ],
  wrong: [
    [196, 0, 0.12, 0.3],
    [165, 0.11, 0.18, 0.3]
  ],
  star: [
    [1047, 0, 0.08, 0.3],
    [1568, 0.07, 0.14, 0.25]
  ],
  done: [
    [523, 0, 0.12, 0.3],
    [659, 0.11, 0.12, 0.3],
    [784, 0.22, 0.12, 0.3],
    [1047, 0.33, 0.3, 0.3]
  ],
  win: [
    [523, 0, 0.14, 0.3],
    [659, 0.14, 0.14, 0.3],
    [784, 0.28, 0.14, 0.3],
    [1047, 0.42, 0.22, 0.32],
    [784, 0.66, 0.12, 0.28],
    [1047, 0.8, 0.45, 0.32]
  ]
};

let enabled = true;
let touched = false;
let ctx: AudioContext | null = null;
/** For tests: every sound that was asked for while enabled, in order. */
export const soundLog: SoundName[] = [];

export function setSoundEnabled(on: boolean): void {
  enabled = on;
}

export function soundEnabled(): boolean {
  return enabled;
}

if (typeof window !== 'undefined') {
  const unlock = () => {
    touched = true;
    window.removeEventListener('pointerdown', unlock, true);
    window.removeEventListener('keydown', unlock, true);
  };
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);
  (window as unknown as { __chessitSounds: SoundName[] }).__chessitSounds = soundLog;
}

function audio(): AudioContext | null {
  if (ctx) return ctx;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  try {
    // Safari 16.4+: "ambient" mixes with other audio and respects the ring/silent switch.
    const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
    if (session) session.type = 'ambient';
    ctx = new AC();
  } catch {
    ctx = null;
  }
  return ctx;
}

export function playSound(name: SoundName): void {
  if (!enabled || !touched) return;
  soundLog.push(name);
  if (soundLog.length > 40) soundLog.shift();
  const ac = audio();
  if (!ac) return;
  if (ac.state === 'suspended') void ac.resume().catch(() => {});
  const style = currentTheme().sound;
  const t0 = ac.currentTime + 0.01;
  const master = ac.createGain();
  // Square waves are much louder than sine waves at the same gain.
  master.gain.value = style.wave === 'square' ? 0.07 : style.wave === 'sine' ? 0.22 : 0.16;
  master.connect(ac.destination);
  for (const [freq, start, len, vol] of NOTES[name]) {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = style.wave;
    const f = freq * style.pitch;
    osc.frequency.setValueAtTime(style.glide ? f * 0.85 : f, t0 + start);
    if (style.glide) osc.frequency.exponentialRampToValueAtTime(f, t0 + start + Math.min(0.06, len));
    g.gain.setValueAtTime(0.0001, t0 + start);
    g.gain.exponentialRampToValueAtTime(vol, t0 + start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + start + len);
    osc.connect(g).connect(master);
    osc.start(t0 + start);
    osc.stop(t0 + start + len + 0.02);
  }
}
