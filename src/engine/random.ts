// Small seeded random numbers, so engine games can be replayed in tests.

export type Rng = () => number;

/** mulberry32: fast, good enough for picking moves. Returns numbers in [0, 1). */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a hash of a string, for mixing a fixed seed with the position. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * The `?seed=` URL parameter, used only by tests to make the computer's moves repeatable.
 * Returns undefined in normal use.
 */
export function testSeed(): number | undefined {
  try {
    const raw = new URLSearchParams(globalThis.location?.search ?? '').get('seed');
    if (raw === null || raw === '') return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : hashString(raw);
  } catch {
    return undefined;
  }
}
