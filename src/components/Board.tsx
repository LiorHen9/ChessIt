import { useRef, useState } from 'preact/hooks';
import type { Chess, Color, PieceSymbol, Square } from 'chess.js';
import { PIECE_GLYPH, PIECE_NAME } from '../chess/rules';

const S = 100; // one square in SVG units; the board is 800×800
const FILES = 'abcdefgh';

export interface LastMove {
  from: Square;
  to: Square;
  /** Slide the piece in. False when the player dragged it there already. */
  animate: boolean;
  /** Changes with every move so the animation replays. */
  id: number;
}

interface BoardProps {
  chess: Chess;
  orientation: Color;
  /** Only the side to move can be picked up; false freezes the board (game over, not your turn). */
  interactive: boolean;
  showHints: boolean;
  lastMove: LastMove | null;
  checkSquare: Square | null;
  onMove: (from: Square, to: Square, promotion?: PieceSymbol, dragged?: boolean) => void;
}

interface Drag {
  pointerId: number;
  from: Square;
  x: number;
  y: number;
  startX: number;
  startY: number;
  moved: boolean;
  wasSelected: boolean;
}

function squareXY(sq: Square, orientation: Color): { x: number; y: number } {
  const f = FILES.indexOf(sq[0]);
  const r = Number(sq[1]);
  return orientation === 'w' ? { x: f * S, y: (8 - r) * S } : { x: (7 - f) * S, y: (r - 1) * S };
}

function squareAt(x: number, y: number, orientation: Color): Square | null {
  const col = Math.floor(x / S);
  const row = Math.floor(y / S);
  if (col < 0 || col > 7 || row < 0 || row > 7) return null;
  const f = orientation === 'w' ? col : 7 - col;
  const r = orientation === 'w' ? 8 - row : row + 1;
  return `${FILES[f]}${r}` as Square;
}

const ALL_SQUARES: Square[] = [];
for (let r = 8; r >= 1; r--) for (let f = 0; f < 8; f++) ALL_SQUARES.push(`${FILES[f]}${r}` as Square);

export function Board({ chess, orientation, interactive, showHints, lastMove, checkSquare, onMove }: BoardProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [selected, setSelected] = useState<Square | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [promotion, setPromotion] = useState<{ from: Square; to: Square; dragged: boolean } | null>(null);

  const turn = chess.turn();
  const legal = selected ? chess.moves({ square: selected, verbose: true }) : [];
  const targets = new Map(legal.map((m) => [m.to, !!m.captured]));

  function toSvg(e: PointerEvent): { x: number; y: number } {
    const rect = svgRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * 8 * S, y: ((e.clientY - rect.top) / rect.height) * 8 * S };
  }

  function tryMove(from: Square, to: Square, dragged: boolean): boolean {
    const options = chess.moves({ square: from, verbose: true }).filter((m) => m.to === to);
    if (options.length === 0) return false;
    if (options.some((m) => m.promotion)) {
      setPromotion({ from, to, dragged });
    } else {
      onMove(from, to, undefined, dragged);
    }
    setSelected(null);
    return true;
  }

  function ownPiece(sq: Square): boolean {
    const p = chess.get(sq);
    return !!p && p.color === turn;
  }

  function onPointerDown(e: PointerEvent) {
    if (!interactive || promotion) return;
    const { x, y } = toSvg(e);
    const sq = squareAt(x, y, orientation);
    if (!sq) return;

    if (selected && targets.has(sq)) {
      tryMove(selected, sq, false);
      return;
    }
    if (ownPiece(sq)) {
      svgRef.current!.setPointerCapture(e.pointerId);
      setDrag({ pointerId: e.pointerId, from: sq, x, y, startX: x, startY: y, moved: false, wasSelected: selected === sq });
      setSelected(sq);
    } else {
      setSelected(null);
    }
  }

  function onPointerMove(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const { x, y } = toSvg(e);
    const moved = drag.moved || Math.hypot(x - drag.startX, y - drag.startY) > S * 0.15;
    setDrag({ ...drag, x, y, moved });
  }

  function onPointerUp(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const { x, y } = toSvg(e);
    const sq = squareAt(x, y, orientation);
    setDrag(null);
    if (drag.moved) {
      if (sq && sq !== drag.from) tryMove(drag.from, sq, true);
      // Dropped on an illegal square: the piece snaps back and stays selected.
    } else if (drag.wasSelected) {
      setSelected(null); // tapping a selected piece again puts it down
    }
  }

  function onPointerCancel() {
    setDrag(null);
  }

  function choosePromotion(piece: PieceSymbol) {
    if (!promotion) return;
    onMove(promotion.from, promotion.to, piece, promotion.dragged);
    setPromotion(null);
  }

  const board = chess.board();
  const pieceAt = (sq: Square) => {
    const f = FILES.indexOf(sq[0]);
    const r = Number(sq[1]);
    return board[8 - r][f];
  };

  // Squares, highlights and coordinates.
  const squares = ALL_SQUARES.map((sq) => {
    const { x, y } = squareXY(sq, orientation);
    const f = FILES.indexOf(sq[0]);
    const r = Number(sq[1]);
    const light = (f + r) % 2 === 0;
    const isLast = lastMove && (lastMove.from === sq || lastMove.to === sq);
    return (
      <g key={sq}>
        <rect x={x} y={y} width={S} height={S} class={light ? 'sq-light' : 'sq-dark'} />
        {isLast && <rect x={x} y={y} width={S} height={S} class="sq-last" />}
        {selected === sq && <rect x={x} y={y} width={S} height={S} class="sq-selected" />}
        {checkSquare === sq && <circle cx={x + S / 2} cy={y + S / 2} r={S * 0.48} class="sq-check" />}
      </g>
    );
  });

  const coords = [];
  for (let i = 0; i < 8; i++) {
    const file = orientation === 'w' ? FILES[i] : FILES[7 - i];
    const rank = orientation === 'w' ? 8 - i : i + 1;
    // Label colour contrasts with the square it sits on.
    const fileOnLight = (FILES.indexOf(file) + (orientation === 'w' ? 1 : 8)) % 2 === 0;
    const rankOnLight = ((orientation === 'w' ? 0 : 7) + rank) % 2 === 0;
    coords.push(
      <text key={`f${i}`} x={i * S + S - 6} y={8 * S - 6} class={`coord ${fileOnLight ? 'on-light' : 'on-dark'}`} text-anchor="end">
        {file}
      </text>,
      <text key={`r${i}`} x={6} y={i * S + 20} class={`coord ${rankOnLight ? 'on-light' : 'on-dark'}`}>
        {rank}
      </text>
    );
  }

  const hints = showHints
    ? [...targets.entries()].map(([sq, capture]) => {
        const { x, y } = squareXY(sq, orientation);
        return capture ? (
          <circle key={`h${sq}`} cx={x + S / 2} cy={y + S / 2} r={S * 0.44} class="hint-capture" />
        ) : (
          <circle key={`h${sq}`} cx={x + S / 2} cy={y + S / 2} r={S * 0.15} class="hint-move" />
        );
      })
    : [];

  const pieces = ALL_SQUARES.flatMap((sq) => {
    const p = pieceAt(sq);
    if (!p) return [];
    if (drag?.moved && drag.from === sq) return []; // drawn under the finger instead
    const { x, y } = squareXY(sq, orientation);
    let style: string | undefined;
    let cls = `piece piece-${p.color}`;
    if (lastMove?.animate && lastMove.to === sq) {
      const from = squareXY(lastMove.from, orientation);
      style = `--dx:${from.x - x}px;--dy:${from.y - y}px`;
      cls += ' piece-slide';
    }
    return [
      <g key={lastMove?.to === sq ? `${sq}-${lastMove.id}` : sq} class={cls} style={style}>
        <text x={x + S / 2} y={y + S / 2} text-anchor="middle" dominant-baseline="central">
          {PIECE_GLYPH[p.type] + '︎'}
        </text>
      </g>
    ];
  });

  let dragged = null;
  if (drag?.moved) {
    const p = chess.get(drag.from);
    if (p) {
      dragged = (
        <g class={`piece piece-${p.color} piece-dragging`}>
          <text x={drag.x} y={drag.y - S * 0.35} text-anchor="middle" dominant-baseline="central">
            {PIECE_GLYPH[p.type] + '︎'}
          </text>
        </g>
      );
    }
  }

  return (
    <div class="board-shell" dir="ltr">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${8 * S} ${8 * S}`}
        class={`board ${interactive ? 'is-live' : ''}`}
        role="img"
        aria-label="לוח שחמט"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        {squares}
        {coords}
        {pieces}
        {hints}
        {dragged}
      </svg>

      {promotion && (
        <div class="promo" dir="rtl" role="dialog" aria-label="בחירת כלי להכתרה">
          <p class="promo-title">הרגלי הגיע לקצה! למה להפוך אותו?</p>
          <div class="promo-options">
            {(['q', 'r', 'b', 'n'] as PieceSymbol[]).map((t) => (
              <button key={t} class="promo-btn" onClick={() => choosePromotion(t)}>
                <span class={`promo-glyph piece-${turn}`}>{PIECE_GLYPH[t] + '︎'}</span>
                <span>{PIECE_NAME[t]}</span>
              </button>
            ))}
          </div>
          <button class="btn btn-ghost" onClick={() => setPromotion(null)}>
            ביטול
          </button>
        </div>
      )}
    </div>
  );
}
