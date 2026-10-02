// Parent-child mode: the stronger player starts without some pieces.
import { Chess, DEFAULT_POSITION, type Color, type PieceSymbol, type Square } from 'chess.js';

export type HandicapPiece = 'q' | 'ra' | 'rh' | 'nb' | 'ng' | 'bc' | 'bf';

export interface HandicapOption {
  id: HandicapPiece;
  type: PieceSymbol;
  /** File of the piece on its home row. */
  file: string;
}

export const HANDICAP_OPTIONS: HandicapOption[] = [
  { id: 'q', type: 'q', file: 'd' },
  { id: 'ra', type: 'r', file: 'a' },
  { id: 'rh', type: 'r', file: 'h' },
  { id: 'nb', type: 'n', file: 'b' },
  { id: 'ng', type: 'n', file: 'g' },
  { id: 'bc', type: 'b', file: 'c' },
  { id: 'bf', type: 'b', file: 'f' }
];

export { DEFAULT_POSITION };

/** The normal starting position without the chosen pieces of `side`. Castling rights follow the rooks. */
export function handicapFen(side: Color, remove: HandicapPiece[]): string {
  if (remove.length === 0) return DEFAULT_POSITION;
  const chess = new Chess();
  const rank = side === 'w' ? '1' : '8';
  for (const id of remove) {
    const opt = HANDICAP_OPTIONS.find((o) => o.id === id);
    if (opt) chess.remove(`${opt.file}${rank}` as Square);
  }
  return chess.fen();
}

export function isStandardStart(fen: string | undefined): boolean {
  return !fen || fen === DEFAULT_POSITION;
}
