// Piece movement for learning drills.
//
// Drills are not real games: only the learner moves, the opponent's pieces stand still,
// and there are no kings, checks, castling or en passant. chess.js insists on kings and
// alternating turns, so drills use this small move generator instead (see ARCHITECTURE.md).
import type { Color, PieceSymbol, Square } from 'chess.js';

export const FILES = 'abcdefgh';

export interface DPiece {
  type: PieceSymbol;
  color: Color;
}

/** Pieces by square. Treated as immutable: applyMove returns a new map. */
export type Pieces = Map<Square, DPiece>;

export interface DMove {
  from: Square;
  to: Square;
  captured?: PieceSymbol;
  /** The pawn reaches the last row on this move. */
  promotion?: boolean;
}

export function isSquare(s: unknown): s is Square {
  return typeof s === 'string' && /^[a-h][1-8]$/.test(s);
}

export function sq(file: number, rank: number): Square | null {
  if (file < 0 || file > 7 || rank < 1 || rank > 8) return null;
  return `${FILES[file]}${rank}` as Square;
}

export function fileOf(s: Square): number {
  return FILES.indexOf(s[0]);
}

export function rankOf(s: Square): number {
  return Number(s[1]);
}

/** Read the placement and side-to-move fields of a FEN. Returns null when malformed. */
export function parseFen(fen: string): { pieces: Pieces; turn: Color } | null {
  const [placement, turn = 'w'] = fen.trim().split(/\s+/);
  const rows = placement?.split('/');
  if (!rows || rows.length !== 8 || (turn !== 'w' && turn !== 'b')) return null;
  const pieces: Pieces = new Map();
  for (let i = 0; i < 8; i++) {
    let file = 0;
    for (const ch of rows[i]) {
      if (/[1-8]/.test(ch)) {
        file += Number(ch);
      } else if (/[kqrbnpKQRBNP]/.test(ch)) {
        const s = sq(file, 8 - i);
        if (!s) return null;
        pieces.set(s, { type: ch.toLowerCase() as PieceSymbol, color: ch === ch.toUpperCase() ? 'w' : 'b' });
        file += 1;
      } else {
        return null;
      }
    }
    if (file !== 8) return null;
  }
  return { pieces, turn };
}

const ROOK_DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1]
];
const BISHOP_DIRS = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1]
];
const KNIGHT_JUMPS = [
  [1, 2],
  [2, 1],
  [2, -1],
  [1, -2],
  [-1, -2],
  [-2, -1],
  [-2, 1],
  [-1, 2]
];

/** Every move the piece on `from` can make. Empty when the square is empty. */
export function movesFrom(pieces: Pieces, from: Square): DMove[] {
  const piece = pieces.get(from);
  if (!piece) return [];
  const f = fileOf(from);
  const r = rankOf(from);
  const out: DMove[] = [];

  const add = (to: Square | null, mode: 'any' | 'quiet' | 'capture' = 'any'): boolean => {
    if (!to) return false;
    const there = pieces.get(to);
    if (there && there.color === piece.color) return false;
    if (there && mode === 'quiet') return false;
    if (!there && mode === 'capture') return false;
    out.push({ from, to, captured: there?.type });
    return !there; // sliding continues only over empty squares
  };

  const slide = (dirs: number[][]) => {
    for (const [df, dr] of dirs) {
      for (let k = 1; k < 8; k++) {
        if (!add(sq(f + df * k, r + dr * k))) break;
      }
    }
  };

  switch (piece.type) {
    case 'r':
      slide(ROOK_DIRS);
      break;
    case 'b':
      slide(BISHOP_DIRS);
      break;
    case 'q':
      slide([...ROOK_DIRS, ...BISHOP_DIRS]);
      break;
    case 'k':
      for (const [df, dr] of [...ROOK_DIRS, ...BISHOP_DIRS]) add(sq(f + df, r + dr));
      break;
    case 'n':
      for (const [df, dr] of KNIGHT_JUMPS) add(sq(f + df, r + dr));
      break;
    case 'p': {
      const dir = piece.color === 'w' ? 1 : -1;
      const startRank = piece.color === 'w' ? 2 : 7;
      const one = sq(f, r + dir);
      if (one && !pieces.has(one)) {
        add(one, 'quiet');
        const two = sq(f, r + 2 * dir);
        if (r === startRank && two && !pieces.has(two)) add(two, 'quiet');
      }
      add(sq(f - 1, r + dir), 'capture');
      add(sq(f + 1, r + dir), 'capture');
      const lastRank = piece.color === 'w' ? 8 : 1;
      for (const m of out) if (rankOf(m.to) === lastRank) m.promotion = true;
      break;
    }
  }
  return out;
}

export function applyMove(pieces: Pieces, move: DMove, promotion: PieceSymbol = 'q'): Pieces {
  const next: Pieces = new Map(pieces);
  const piece = next.get(move.from);
  if (!piece) return next;
  next.delete(move.from);
  next.set(move.to, move.promotion ? { type: promotion, color: piece.color } : piece);
  return next;
}

/** A stable string for a position, used as a search key. */
export function piecesKey(pieces: Pieces): string {
  return [...pieces.entries()]
    .map(([s, p]) => `${s}${p.color === 'w' ? p.type.toUpperCase() : p.type}`)
    .sort()
    .join('');
}
