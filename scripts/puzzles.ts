// Builds the puzzle files in src/content/puzzles/ from the Lichess puzzle database (CC0).
//
//   1. Download https://database.lichess.org/lichess_db_puzzle.csv.zst (about 250MB).
//   2. Unpack it:            zstd -d lichess_db_puzzle.csv.zst
//   3. Build the files:      bun scripts/puzzles.ts lichess_db_puzzle.csv
//      (or: npx tsx scripts/puzzles.ts lichess_db_puzzle.csv; needs `npm install` for chess.js)
//   4. Check them:           bun tests/content/check.ts
//
// Options: --max N (puzzles per theme, default 80), --min-rating, --max-rating,
//          --min-popularity (default 80), --min-plays (default 200).
// Any CSV with the same header works, e.g. a small sample of the database.
//
// Each puzzle is checked with chess.js (every move legal; mate themes end in mate) and the
// easiest ones are kept, spread over the rating range so there is always a next step.
// CSV columns: PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,OpeningTags
// Note: in the database, the first move is the opponent's. The puzzle starts after it.
import { createReadStream, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { Chess } from 'chess.js';

/** Theme → output file, with the limits that suit beginners. */
const THEMES: Record<string, { maxMoves: number; maxRating: number }> = {
  mateIn1: { maxMoves: 2, maxRating: 1500 },
  mateIn2: { maxMoves: 4, maxRating: 1700 },
  backRankMate: { maxMoves: 4, maxRating: 1700 },
  hangingPiece: { maxMoves: 4, maxRating: 1700 },
  fork: { maxMoves: 4, maxRating: 1800 },
  pin: { maxMoves: 6, maxRating: 1900 },
  discoveredAttack: { maxMoves: 4, maxRating: 1800 }
};

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? Number(process.argv[i + 1]) : fallback;
}

const input = process.argv[2];
if (!input || input.startsWith('--')) {
  console.error('usage: bun scripts/puzzles.ts <lichess_db_puzzle.csv> [--max 80]');
  process.exit(1);
}
const MAX = arg('max', 80);
const MIN_RATING = arg('min-rating', 0);
const MAX_RATING = arg('max-rating', 9999);
const MIN_POP = arg('min-popularity', 80);
const MIN_PLAYS = arg('min-plays', 200);
const OUT = new URL('../src/content/puzzles/', import.meta.url);

interface Puzzle {
  id: string;
  fen: string;
  moves: string;
  rating: number;
}

function valid(p: Puzzle, mate: boolean): boolean {
  try {
    const c = new Chess(p.fen);
    for (const u of p.moves.split(' ')) c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || undefined });
    return !mate || c.isCheckmate();
  } catch {
    return false;
  }
}

const found: Record<string, Puzzle[]> = Object.fromEntries(Object.keys(THEMES).map((t) => [t, []]));
let rows = 0;
const lines = createInterface({ input: createReadStream(input), crlfDelay: Infinity });
for await (const line of lines) {
  if (!line || line.startsWith('PuzzleId')) continue;
  rows++;
  const [id, fen, moves, rating, , popularity, plays, themes] = line.split(',');
  const r = Number(rating);
  if (r < MIN_RATING || r > MAX_RATING) continue;
  if (Number(popularity) < MIN_POP || Number(plays) < MIN_PLAYS) continue;
  const tags = themes.split(' ');
  const n = moves.split(' ').length;
  for (const [theme, rule] of Object.entries(THEMES)) {
    if (!tags.includes(theme) || n > rule.maxMoves || r > rule.maxRating) continue;
    const p = { id, fen, moves, rating: r };
    if (valid(p, tags.includes('mate'))) found[theme].push(p);
  }
}

for (const [theme, list] of Object.entries(found)) {
  list.sort((a, b) => a.rating - b.rating);
  // Keep MAX puzzles spread evenly over the sorted list: easy ones first, a few harder ones later.
  const keep = list.length <= MAX ? list : Array.from({ length: MAX }, (_, i) => list[Math.floor((i * list.length) / MAX)]);
  const file = { theme, source: 'Lichess puzzle database (CC0), https://database.lichess.org/#puzzles', puzzles: keep };
  writeFileSync(new URL(`${theme}.json`, OUT), JSON.stringify(file) + '\n');
  console.log(`${theme}: ${keep.length} of ${list.length} (ratings ${keep[0]?.rating ?? '-'}–${keep.at(-1)?.rating ?? '-'})`);
}
console.log(`${rows} rows read`);
