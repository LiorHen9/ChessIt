// Puzzles from the Lichess puzzle database (CC0), filtered by scripts/puzzles.ts.
// Each theme is its own small JSON file, loaded only when needed (dynamic import).
//
// Lichess format: `moves` is a UCI list whose FIRST move is the opponent's. The board shows
// the position after it; then the learner and the opponent alternate. On the last learner
// move any checkmate is accepted, like on Lichess.
import { Chess } from 'chess.js';
import { playUci } from '../../learning/real';

export interface Puzzle {
  id: string;
  fen: string;
  moves: string;
  rating: number;
}

export interface PuzzleFile {
  theme: string;
  source: string;
  puzzles: Puzzle[];
}

export interface ThemeInfo {
  id: string;
  title: string;
  icon: string;
  /** The part of the path that teaches this theme; the theme opens when that part is done or passed. */
  part: number;
  /** One line for the puzzles screen. */
  about: string;
}

export const THEMES: ThemeInfo[] = [
  { id: 'hangingPiece', title: 'כלי לא שמור', icon: '🎁', part: 3, about: 'מוצאים כלי שאפשר לאכול בחינם' },
  { id: 'mateIn1', title: 'מט במסע אחד', icon: '👑', part: 5, about: 'מסע אחד – והמלך לא יכול לברוח' },
  { id: 'backRankMate', title: 'מט בשורה האחרונה', icon: '🧱', part: 5, about: 'המלך כלוא מאחורי הרגלים שלו' },
  { id: 'mateIn2', title: 'מט בשני מסעים', icon: '👑👑', part: 5, about: 'שני מסעים, והיריב לא יכול להינצל' },
  { id: 'fork', title: 'מזלג', icon: '🍴', part: 7, about: 'כלי אחד תוקף שני כלים בבת אחת' },
  { id: 'pin', title: 'סיכה', icon: '📌', part: 7, about: 'הכלי של היריב לא יכול לזוז' },
  { id: 'discoveredAttack', title: 'התקפה מגולה', icon: '🎭', part: 7, about: 'כלי זז, ומאחוריו נפתחת התקפה' }
];

export const PUZZLE_FILES: Record<string, () => Promise<PuzzleFile>> = {
  hangingPiece: () => import('./hangingPiece.json').then((m) => m.default as PuzzleFile),
  mateIn1: () => import('./mateIn1.json').then((m) => m.default as PuzzleFile),
  backRankMate: () => import('./backRankMate.json').then((m) => m.default as PuzzleFile),
  mateIn2: () => import('./mateIn2.json').then((m) => m.default as PuzzleFile),
  fork: () => import('./fork.json').then((m) => m.default as PuzzleFile),
  pin: () => import('./pin.json').then((m) => m.default as PuzzleFile),
  discoveredAttack: () => import('./discoveredAttack.json').then((m) => m.default as PuzzleFile)
};

const cache = new Map<string, Promise<PuzzleFile>>();

export function loadTheme(theme: string): Promise<PuzzleFile> {
  let p = cache.get(theme);
  if (!p) {
    const load = PUZZLE_FILES[theme];
    p = load ? load() : Promise.reject(new Error(`unknown theme ${theme}`));
    cache.set(theme, p);
  }
  return p;
}

export function themeInfo(id: string): ThemeInfo | undefined {
  return THEMES.find((t) => t.id === id);
}

/** Problems with a puzzle file: every move must be legal, and mate themes must end in mate. */
export function checkPuzzleFile(file: PuzzleFile): string[] {
  const out: string[] = [];
  const mate = file.theme.startsWith('mate') || file.theme.endsWith('Mate');
  for (const p of file.puzzles) {
    try {
      const c = new Chess(p.fen);
      const moves = p.moves.split(' ');
      if (moves.length < 2 || moves.length % 2 !== 0) out.push(`${p.id}: odd number of moves`);
      for (const u of moves) if (!playUci(c, u)) throw new Error(`illegal ${u}`);
      if (mate && !c.isCheckmate()) out.push(`${p.id}: does not end in mate`);
    } catch (e) {
      out.push(`${p.id}: ${(e as Error).message}`);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Daily puzzle: the same puzzle for every profile on the same local day.

/** Themes the daily puzzle comes from: short, and taught early in the path. */
export const DAILY_THEMES = ['mateIn1', 'hangingPiece', 'fork', 'mateIn2'];
const DAILY_MAX_RATING = 1300;

/** Local date as YYYY-MM-DD (not UTC: the day changes at the family's midnight). */
export function localDay(d = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function dayNumber(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}

/** The daily puzzle: rotates through the themes, then through each theme's easy puzzles. */
export async function dailyPuzzle(day = localDay()): Promise<{ theme: string; puzzle: Puzzle }> {
  const n = dayNumber(day);
  const theme = DAILY_THEMES[n % DAILY_THEMES.length];
  const file = await loadTheme(theme);
  const easy = file.puzzles.filter((p) => p.rating <= DAILY_MAX_RATING);
  const pool = easy.length ? easy : file.puzzles;
  // A fixed shuffle (multiplying by a number coprime with most sizes) so consecutive days differ.
  const index = (Math.floor(n / DAILY_THEMES.length) * 7919) % pool.length;
  return { theme, puzzle: pool[index] };
}
