// SVG chess pieces. The shapes are defined once, as <symbol>s in a hidden sprite (PieceSprite,
// rendered once by the App); every piece on screen is a small <use>. Colours come from the
// theme's --pc-* variables, so switching theme recolours every piece without re-rendering.
import type { Color, PieceSymbol } from 'chess.js';
import { PIECE_NAME } from '../chess/rules';
import { CBURNETT } from '../themes/pieceSprite';

/** Symbol id, e.g. "pc-wN". */
export function pieceId(color: Color, type: PieceSymbol): string {
  return `pc-${color}${type.toUpperCase()}`;
}

export function PieceSprite() {
  return (
    <svg class="piece-sprite" width="0" height="0" aria-hidden="true" focusable="false">
      <defs dangerouslySetInnerHTML={{ __html: CBURNETT }} />
    </svg>
  );
}

/** A piece inside the board's SVG, filling a `size` square at (x, y). */
export function PieceUse({ color, type, x, y, size }: { color: Color; type: PieceSymbol; x: number; y: number; size: number }) {
  return <use href={`#${pieceId(color, type)}`} x={x} y={y} width={size} height={size} />;
}

/** A piece as an inline icon in HTML (player bar, promotion, characters). Size via CSS (1em by default). */
export function PieceIcon({ color, type, class: cls = '', label }: { color: Color; type: PieceSymbol; class?: string; label?: boolean }) {
  return (
    <svg
      class={`pc ${cls}`}
      viewBox="0 0 45 45"
      data-piece={`${color}${type.toUpperCase()}`}
      role={label ? 'img' : undefined}
      aria-label={label ? PIECE_NAME[type] : undefined}
      aria-hidden={label ? undefined : 'true'}
    >
      <use href={`#${pieceId(color, type)}`} />
    </svg>
  );
}
