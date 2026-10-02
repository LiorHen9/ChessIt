// Reading text aloud in Hebrew with the Web Speech API (for ages 5–7, who may not read yet).
// Only a Hebrew voice is used: another language's voice reads Hebrew as gibberish, so without one
// the 🔊 button is hidden and the parent gets a one-time note on how to install a Hebrew voice.
import { useEffect, useState } from 'preact/hooks';

let voice: SpeechSynthesisVoice | null = null;
let narration = false;
const listeners = new Set<() => void>();

function synth(): SpeechSynthesis | null {
  return typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
}

function pickVoice(): void {
  const s = synth();
  if (!s) return;
  const voices = s.getVoices();
  // "iw" is the old code for Hebrew, still used by some Android voices.
  const he = voices.filter((v) => /^(he|iw)([-_]|$)/i.test(v.lang));
  const next = he.find((v) => /^(he|iw)[-_]IL$/i.test(v.lang) && v.localService) ?? he.find((v) => /IL$/i.test(v.lang)) ?? he[0] ?? null;
  if (next !== voice) {
    voice = next;
    listeners.forEach((f) => f());
  }
}

const s0 = synth();
if (s0) {
  pickVoice();
  // Voices often arrive later (Chrome loads them asynchronously).
  s0.addEventListener?.('voiceschanged', pickVoice);
}

export function hasHebrewVoice(): boolean {
  return !!voice;
}

/** Re-renders when a Hebrew voice appears (or disappears). */
export function useHebrewVoice(): boolean {
  const [has, setHas] = useState(!!voice);
  useEffect(() => {
    const f = () => setHas(!!voice);
    listeners.add(f);
    f();
    return () => void listeners.delete(f);
  }, []);
  return has;
}

/** Read new tasks aloud by themselves (a per-profile setting). */
export function setNarration(on: boolean): void {
  narration = on;
  if (!on) stopSpeaking();
}

export function narrationOn(): boolean {
  return narration;
}

/**
 * How squares are said. "e4" read by a Hebrew voice comes out as an English letter or nothing,
 * so the letter is written the way Israelis say it ("אִי 4"). Niqqud helps the voice pick the
 * right vowel. If a letter sounds wrong on a real phone, change it here.
 */
const LETTER: Record<string, string> = {
  a: 'אֵי',
  b: 'בִּי',
  c: 'סִי',
  d: 'דִּי',
  e: 'אִי',
  f: 'אֶף',
  g: "גִ'י",
  h: "אֵייץ'"
};

/** Text for the voice: no emoji, piece symbols or arrows, squares spelled out. */
export function cleanForSpeech(text: string): string {
  return (
    text
      .replace(/[\uFE0E\uFE0F\u200D]/g, '')
      .replace(/[♔-♟]/g, '')
      .replace(/\p{Extended_Pictographic}/gu, '')
      .replace(/[\u2190-\u21FF\u2300-\u23FF\u25A0-\u27BF\u2B00-\u2BFF]/g, '')
      // No lookbehind: older iPhones (Safari < 16.4) cannot parse it.
      .replace(/(^|[^A-Za-z])([a-h])([1-8])(?![A-Za-z0-9])/g, (_m, pre: string, f: string, r: string) => `${pre}${LETTER[f]} ${r}`)
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/** Read text aloud now (stopping anything already being read). False when there is no Hebrew voice. */
export function speak(text: string): boolean {
  const s = synth();
  const clean = cleanForSpeech(text);
  if (!s || !voice || !clean) return false;
  s.cancel();
  const u = new SpeechSynthesisUtterance(clean);
  u.lang = 'he-IL';
  try {
    u.voice = voice;
  } catch {
    // Some engines reject voices from another realm; lang alone still picks a Hebrew voice.
  }
  u.rate = 0.92;
  s.speak(u);
  return true;
}

/** Read aloud only when the profile has narration on. */
export function autoSpeak(text: string): void {
  if (narration) speak(text);
}

export function stopSpeaking(): void {
  synth()?.cancel();
}
