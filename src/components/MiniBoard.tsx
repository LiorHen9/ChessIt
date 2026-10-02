// A small decorative board for the welcome screen.
// The real interactive board (drag, tap, legal-move highlights) arrives in phase 1.

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

// A few pieces in a friendly mid-game picture: square -> glyph.
const PIECES: Record<string, string> = {
  e1: '♔',
  d1: '♕',
  f3: '♘',
  c4: '♗',
  e4: '♙',
  d4: '♙',
  e8: '♚',
  c6: '♞',
  e5: '♟',
  d7: '♟',
  f8: '♝',
  a8: '♜'
};

export function MiniBoard() {
  const size = 40;
  const squares = [];

  for (let rank = 8; rank >= 1; rank--) {
    for (let f = 0; f < 8; f++) {
      const x = f * size;
      const y = (8 - rank) * size;
      const square = `${FILES[f]}${rank}`;
      // a1 is a dark square: file index + rank is odd on dark squares.
      const light = (f + rank) % 2 === 0;
      const glyph = PIECES[square];
      squares.push(
        <g key={square}>
          <rect x={x} y={y} width={size} height={size} class={light ? 'sq-light' : 'sq-dark'} />
          {glyph && (
            <text x={x + size / 2} y={y + size / 2 + 12} class="piece" text-anchor="middle">
              {/* ︎ keeps iOS from drawing the pawn as a colour emoji */}
              {glyph + '︎'}
            </text>
          )}
        </g>
      );
    }
  }

  return (
    // The board always reads left-to-right (files a–h), even inside the RTL page.
    <div class="board-wrap" dir="ltr">
      <svg viewBox={`0 0 ${size * 8} ${size * 8}`} class="board" role="img" aria-label="לוח שחמט לדוגמה">
        {squares}
      </svg>
    </div>
  );
}
