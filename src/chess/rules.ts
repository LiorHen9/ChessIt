import type { Chess, Color, Move, PieceSymbol, Square } from 'chess.js';
import type { BoardPosition } from '../components/Board';

/** One glyph per piece type; colour comes from fill + outline, so both sides share the solid set. */
export const PIECE_GLYPH: Record<PieceSymbol, string> = {
  k: '♚',
  q: '♛',
  r: '♜',
  b: '♝',
  n: '♞',
  p: '♟'
};

export const PIECE_NAME: Record<PieceSymbol, string> = {
  k: 'מלך',
  q: 'מלכה',
  r: 'צריח',
  b: 'רץ',
  n: 'פרש',
  p: 'רגלי'
};

export const PIECE_VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

export const COLOR_NAME: Record<Color, string> = { w: 'לבן', b: 'שחור' };

export function other(c: Color): Color {
  return c === 'w' ? 'b' : 'w';
}

/** Pieces each side has taken, sorted from most to least valuable. */
export function capturedBy(history: Move[]): Record<Color, PieceSymbol[]> {
  const out: Record<Color, PieceSymbol[]> = { w: [], b: [] };
  for (const m of history) {
    if (m.captured) out[m.color].push(m.captured);
  }
  const byValue = (a: PieceSymbol, b: PieceSymbol) => PIECE_VALUE[b] - PIECE_VALUE[a];
  out.w.sort(byValue);
  out.b.sort(byValue);
  return out;
}

/** Positive = white is ahead in material. */
export function materialBalance(captured: Record<Color, PieceSymbol[]>): number {
  const sum = (ps: PieceSymbol[]) => ps.reduce((n, p) => n + PIECE_VALUE[p], 0);
  return sum(captured.w) - sum(captured.b);
}

export type EndReason = 'checkmate' | 'stalemate' | 'insufficient' | 'threefold' | 'fifty' | 'resign';

export interface Outcome {
  reason: EndReason;
  /** null = draw */
  winner: Color | null;
}

export function outcomeOf(chess: Chess): Outcome | null {
  if (chess.isCheckmate()) return { reason: 'checkmate', winner: other(chess.turn()) };
  if (chess.isStalemate()) return { reason: 'stalemate', winner: null };
  if (chess.isInsufficientMaterial()) return { reason: 'insufficient', winner: null };
  if (chess.isThreefoldRepetition()) return { reason: 'threefold', winner: null };
  if (chess.isDrawByFiftyMoves()) return { reason: 'fifty', winner: null };
  return null;
}

export const END_REASON_TEXT: Record<EndReason, string> = {
  checkmate: 'מט!',
  stalemate: 'פט – למלך אין לאן לזוז, אבל הוא לא בשח. תיקו.',
  insufficient: 'לא נשארו מספיק כלים כדי לתת מט. תיקו.',
  threefold: 'אותה עמדה חזרה שלוש פעמים. תיקו.',
  fifty: '50 מסעים בלי הכאה ובלי מסע רגלי. תיקו.',
  resign: 'כניעה'
};

/** Square of the king of the side to move when it is in check. */
export function checkedKingSquare(chess: Chess): Square | null {
  if (!chess.inCheck()) return null;
  const [sq] = chess.findPiece({ type: 'k', color: chess.turn() });
  return sq ?? null;
}

/** Let the Board show a chess.js game: only the side to move can be picked up. */
export function chessPosition(chess: Chess): BoardPosition {
  return {
    get: (sq) => chess.get(sq),
    canPick: (sq) => chess.get(sq)?.color === chess.turn(),
    movesFrom: (sq) =>
      chess.moves({ square: sq, verbose: true }).map((m) => ({ to: m.to, captured: !!m.captured, promotion: !!m.promotion }))
  };
}
