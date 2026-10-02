// The eight computer levels: names for the setup screen, and how each one plays.
// Levels 1–2 use KidEngine. Levels 3–8 use Stockfish with a limited skill, depth and time,
// and sometimes play a KidEngine move instead so the lower ones stay beatable.
// Calibrated with tests/engine/sim.ts; the table is documented in docs/ARCHITECTURE.md.

export const MIN_LEVEL = 1;
export const MAX_LEVEL = 8;
/** Levels from here up need Stockfish. */
export const FIRST_STOCKFISH_LEVEL = 3;

export interface LevelInfo {
  level: number;
  name: string;
  icon: string;
  /** One short line for the setup screen. */
  blurb: string;
}

export const LEVELS: LevelInfo[] = [
  { level: 1, name: 'אפרוח', icon: '🐣', blurb: 'משחק בשביל הכיף, טועה הרבה' },
  { level: 2, name: 'גור', icon: '🐶', blurb: 'שם לב לכלים שאפשר לאכול' },
  { level: 3, name: 'צב', icon: '🐢', blurb: 'חושב קצת, עדיין מפספס' },
  { level: 4, name: 'חתול', icon: '🐱', blurb: 'זהיר יותר עם הכלים שלו' },
  { level: 5, name: 'שועל', icon: '🦊', blurb: 'מחפש מלכודות' },
  { level: 6, name: 'ינשוף', icon: '🦉', blurb: 'חושב כמה מסעים קדימה' },
  { level: 7, name: 'נמר', icon: '🐯', blurb: 'יריב רציני' },
  { level: 8, name: 'דרקון', icon: '🐲', blurb: 'האתגר הגדול' }
];

export function levelInfo(level: number): LevelInfo {
  return LEVELS[clampLevel(level) - 1];
}

export function clampLevel(level: number): number {
  if (!Number.isFinite(level)) return MIN_LEVEL;
  return Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, Math.round(level)));
}

export function usesStockfish(level: number): boolean {
  return clampLevel(level) >= FIRST_STOCKFISH_LEVEL;
}

export interface StockfishLevel {
  /** UCI "Skill Level", 0–20. */
  skill: number;
  /** Maximum search depth. */
  depth: number;
  /** Maximum thinking time in ms (whichever comes first). */
  movetime: number;
  /** Chance of playing a KidEngine level-2 move instead, so low levels make human mistakes. */
  kidMove: number;
}

export const STOCKFISH_LEVELS: Record<number, StockfishLevel> = {
  3: { skill: 0, depth: 1, movetime: 50, kidMove: 0.5 },
  4: { skill: 0, depth: 2, movetime: 80, kidMove: 0.3 },
  5: { skill: 1, depth: 3, movetime: 120, kidMove: 0.2 },
  6: { skill: 2, depth: 4, movetime: 160, kidMove: 0.1 },
  7: { skill: 3, depth: 5, movetime: 220, kidMove: 0.05 },
  8: { skill: 5, depth: 6, movetime: 300, kidMove: 0 }
};

/** Depth used for the end-of-game summary (full strength). */
export const ANALYSIS_DEPTH = 10;
/** …but never more than this per position, so a long game on a slow phone still finishes. */
export const ANALYSIS_MAX_MS = 1500;
