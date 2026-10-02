// KidEngine: a small, friendly opponent for levels 1–2. No libraries beyond chess.js.
// Level 1 plays almost at random: it likes captures and often misses threats and mates.
// Level 2 looks one move ahead with material counting and some randomness.
// Pure functions, so they run the same in the worker, in tests and in the terminal.

import { Chess, type Move, type PieceSymbol } from 'chess.js';
import { PIECE_VALUE } from '../chess/rules';
import type { Rng } from './random';

/** Level 1 tuning (see tests/engine/sim.ts). */
export const CAPTURE_CHANCE_L1 = 0.15;
export const MATE_CHANCE_L1 = 0.3;
/** Level 2: how often it looks at the reply, and how much noise (in pawns) it adds. */
export const LOOKAHEAD_L2 = 0.65;
export const NOISE_L2 = 1.8;

function pick<T>(list: T[], rng: Rng): T {
  return list[Math.floor(rng() * list.length)];
}

const value = (p: PieceSymbol | undefined) => (p ? PIECE_VALUE[p] : 0);

function uci(m: Move): string {
  return m.from + m.to + (m.promotion ?? '');
}

/** Material of one side, in pawns (kings count 0). */
function materialOf(chess: Chess, color: 'w' | 'b'): number {
  let sum = 0;
  for (const row of chess.board()) for (const sq of row) if (sq && sq.color === color) sum += PIECE_VALUE[sq.type];
  return sum;
}

function level1(moves: Move[], rng: Rng): Move {
  const mates = moves.filter((m) => m.san.endsWith('#'));
  if (mates.length && rng() < MATE_CHANCE_L1) return pick(mates, rng);
  const captures = moves.filter((m) => m.captured);
  if (captures.length && rng() < CAPTURE_CHANCE_L1) return pick(captures, rng);
  // Otherwise a quiet move: level 1 leaves most hanging pieces alone, so a child keeps
  // what they win and gets the chance to finish the game.
  const quiet = moves.filter((m) => !m.captured);
  const move = pick(quiet.length ? quiet : moves, rng);
  // Promotions are rare here; keep them mostly queens so they are not silly.
  if (move.promotion && move.promotion !== 'q' && rng() < 0.7) {
    return moves.find((m) => m.from === move.from && m.to === move.to && m.promotion === 'q') ?? move;
  }
  return move;
}

function level2(chess: Chess, moves: Move[], rng: Rng): Move {
  const me = chess.turn();
  const them = me === 'w' ? 'b' : 'w';
  let best: Move = moves[0];
  let bestScore = -Infinity;
  for (const m of moves) {
    let score = value(m.captured) + (m.promotion ? value(m.promotion) - 1 : 0);
    chess.move(m);
    if (chess.isCheckmate()) {
      score += 1000;
    } else if (chess.isDraw()) {
      // A draw is fine when behind and bad when ahead.
      const lead = materialOf(chess, me) - materialOf(chess, them);
      score += lead > 2 ? -20 : lead < -2 ? 5 : 0;
    } else if (rng() < LOOKAHEAD_L2) {
      // One move ahead: what is the worst thing the opponent can do right back?
      // Sometimes the engine "forgets" to look, which keeps it beatable.
      let threat = 0;
      for (const r of chess.moves({ verbose: true })) {
        if (r.san.endsWith('#')) {
          threat = Math.max(threat, rng() < 0.6 ? 500 : 0);
          continue;
        }
        if (!r.captured) continue;
        let loss = value(r.captured);
        // Can we take back on that square? Then the trade costs them their piece too.
        if (chess.isAttacked(r.to, me)) loss -= value(r.piece);
        threat = Math.max(threat, loss);
      }
      score -= threat;
    }
    chess.undo();
    score += rng() * NOISE_L2;
    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  }
  return best;
}

/** Choose a move for the side to move. Returns UCI, e.g. "e2e4" or "e7e8q". */
export function kidMove(fen: string, level: number, rng: Rng): string {
  const chess = new Chess(fen);
  const moves = chess.moves({ verbose: true });
  if (moves.length === 0) throw new Error('no legal moves');
  return uci(level <= 1 ? level1(moves, rng) : level2(chess, moves, rng));
}
