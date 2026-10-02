import { useEffect, useRef, useState } from 'preact/hooks';
import type { Color, PieceSymbol, Square } from 'chess.js';
import { PIECE_NAME } from '../chess/rules';
import { PieceIcon, PieceUse } from './Piece';
import { playSound } from '../audio/sound';

const S = 100; // one square in SVG units; the board is 800×800
const PAD = 4; // space around a piece inside its square
const FILES = 'abcdefgh';

export interface LastMove {
  from: Square;
  to: Square;
  /** Slide the piece in. False when the player dragged it there already. */
  animate: boolean;
  /** Changes with every move so the animation replays. */
  id: number;
}

export interface BoardPiece {
  type: PieceSymbol;
  color: Color;
}

export interface BoardMove {
  to: Square;
  captured?: boolean;
  promotion?: boolean;
}

/**
 * What the board needs to know about a position. The two-player game wraps chess.js
 * (chessPosition in chess/rules.ts); learning drills use their own simple move rules.
 */
export interface BoardPosition {
  get(sq: Square): BoardPiece | undefined;
  /** Can the player pick up the piece on this square? */
  canPick(sq: Square): boolean;
  movesFrom(sq: Square): BoardMove[];
}

/** Extra drawings for lessons and minigames. */
export interface BoardMarks {
  /** Stars to collect. */
  stars?: Square[];
  /** A flag on the target square (reachSquare). */
  flag?: Square;
  /** Rings around pieces to capture. */
  rings?: Square[];
  highlight?: Square[];
  highlightAlt?: Square[];
  /** A soft outlined zone, e.g. the row a task is about. */
  area?: Square[];
  good?: Square[];
  bad?: Square[];
  /** Pulsing rings for a hint. */
  hint?: Square[];
  arrows?: [Square, Square][];
  /** Green arrows: a good move, or the better move in the game summary. */
  arrowsGood?: [Square, Square][];
  /** Red arrows: the mistake in the game summary. */
  arrowsBad?: [Square, Square][];
  dots?: Square[];
  /** Write the square name on these squares. */
  labels?: Square[];
  /** A short burst of sparkles (a star was collected). `id` replays it. */
  burst?: { sq: Square; id: number };
}

interface BoardProps {
  position: BoardPosition;
  orientation: Color;
  /** False freezes the board (game over, demo playing). */
  interactive: boolean;
  showHints: boolean;
  lastMove: LastMove | null;
  checkSquare?: Square | null;
  onMove: (from: Square, to: Square, promotion?: PieceSymbol, dragged?: boolean) => void;
  marks?: BoardMarks;
  /** Tap mode: every tap reports a square, and pieces cannot be moved. */
  onSquareTap?: (sq: Square) => void;
  /** The player tried to move the selected piece somewhere it cannot go. */
  onIllegal?: (from: Square, to: Square) => void;
  /** No move / capture / check sounds (demos, small boards). */
  quiet?: boolean;
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

/** Five-pointed star path centred on (0,0). */
const STAR_PATH = (() => {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? 34 : 15;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    pts.push(`${(Math.cos(a) * rad).toFixed(1)},${(Math.sin(a) * rad).toFixed(1)}`);
  }
  return `M${pts.join('L')}Z`;
})();

export function Board({
  position,
  orientation,
  interactive,
  showHints,
  lastMove,
  checkSquare = null,
  onMove,
  marks = {},
  onSquareTap,
  onIllegal,
  quiet = false
}: BoardProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [selected, setSelected] = useState<Square | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [promotion, setPromotion] = useState<{ from: Square; to: Square; dragged: boolean; color: Color } | null>(null);

  // Sounds follow what the board shows: a new last move is a move, a capture (fewer pieces) or a
  // check. Take-backs and resets (more pieces, or no move) stay silent.
  let pieceCount = 0;
  for (const sq of ALL_SQUARES) if (position.get(sq)) pieceCount++;
  const heard = useRef<{ id: number | null; count: number }>({ id: lastMove?.id ?? null, count: pieceCount });
  useEffect(() => {
    const prev = heard.current;
    const id = lastMove?.id ?? null;
    heard.current = { id, count: pieceCount };
    if (quiet || id === null || id === prev.id || pieceCount > prev.count) return;
    playSound(checkSquare ? 'check' : pieceCount < prev.count ? 'capture' : 'move');
  }, [lastMove?.id, pieceCount]);

  function illegal(from: Square, to: Square) {
    if (!quiet) playSound('wrong');
    onIllegal?.(from, to);
  }

  const legal = selected ? position.movesFrom(selected) : [];
  const targets = new Map(legal.map((m) => [m.to, !!m.captured]));

  function toSvg(e: PointerEvent): { x: number; y: number } {
    const rect = svgRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * 8 * S, y: ((e.clientY - rect.top) / rect.height) * 8 * S };
  }

  function tryMove(from: Square, to: Square, dragged: boolean): boolean {
    const options = position.movesFrom(from).filter((m) => m.to === to);
    if (options.length === 0) {
      illegal(from, to);
      return false;
    }
    if (options.some((m) => m.promotion)) {
      setPromotion({ from, to, dragged, color: position.get(from)?.color ?? 'w' });
    } else {
      onMove(from, to, undefined, dragged);
    }
    setSelected(null);
    return true;
  }

  function onPointerDown(e: PointerEvent) {
    if (!interactive || promotion) return;
    const { x, y } = toSvg(e);
    const sq = squareAt(x, y, orientation);
    if (!sq) return;

    if (onSquareTap) {
      onSquareTap(sq);
      return;
    }
    if (selected && targets.has(sq)) {
      tryMove(selected, sq, false);
      return;
    }
    if (position.canPick(sq)) {
      svgRef.current!.setPointerCapture(e.pointerId);
      setDrag({ pointerId: e.pointerId, from: sq, x, y, startX: x, startY: y, moved: false, wasSelected: selected === sq });
      setSelected(sq);
    } else {
      if (selected) illegal(selected, sq);
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

  const has = (list: Square[] | undefined, sq: Square) => !!list && list.includes(sq);

  // Squares, highlights and coordinates.
  const squares = ALL_SQUARES.map((sq) => {
    const { x, y } = squareXY(sq, orientation);
    const f = FILES.indexOf(sq[0]);
    const r = Number(sq[1]);
    const light = (f + r) % 2 === 0;
    const isLast = lastMove && (lastMove.from === sq || lastMove.to === sq);
    const overlay = (cls: string) => <rect x={x} y={y} width={S} height={S} class={cls} />;
    return (
      <g key={sq}>
        <rect x={x} y={y} width={S} height={S} class={light ? 'sq-light' : 'sq-dark'} />
        {has(marks.area, sq) && overlay('sq-area')}
        {has(marks.highlight, sq) && overlay('sq-hl')}
        {has(marks.highlightAlt, sq) && overlay('sq-hl-alt')}
        {isLast && overlay('sq-last')}
        {has(marks.good, sq) && overlay('sq-good')}
        {has(marks.bad, sq) && overlay('sq-bad')}
        {selected === sq && overlay('sq-selected')}
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

  const center = (sq: Square) => {
    const { x, y } = squareXY(sq, orientation);
    return { cx: x + S / 2, cy: y + S / 2 };
  };

  const stars = (marks.stars ?? []).map((sq) => {
    const { cx, cy } = center(sq);
    return (
      <g key={`star-${sq}`} class="mark-star" transform={`translate(${cx} ${cy})`}>
        <path d={STAR_PATH} />
      </g>
    );
  });

  let flag = null;
  if (marks.flag) {
    const { cx, cy } = center(marks.flag);
    flag = (
      <g class="mark-flag" transform={`translate(${cx} ${cy})`}>
        <line x1={-14} y1={-34} x2={-14} y2={34} />
        <path d="M-12,-34 L30,-20 L-12,-6 Z" />
      </g>
    );
  }

  const rings = (marks.rings ?? []).map((sq) => {
    const { cx, cy } = center(sq);
    return <circle key={`ring-${sq}`} cx={cx} cy={cy} r={S * 0.45} class="mark-ring" />;
  });

  const hintRings = (marks.hint ?? []).map((sq) => {
    const { cx, cy } = center(sq);
    return <circle key={`hint-${sq}`} cx={cx} cy={cy} r={S * 0.42} class="mark-hint" />;
  });

  const dots = (marks.dots ?? []).map((sq) => {
    const { cx, cy } = center(sq);
    return <circle key={`dot-${sq}`} cx={cx} cy={cy} r={S * 0.17} class="mark-dot" />;
  });

  const drawArrows = (list: [Square, Square][] | undefined, tone: '' | '-good' | '-bad') =>
    (list ?? []).map(([from, to]) => {
      const a = center(from);
      const b = center(to);
      const len = Math.hypot(b.cx - a.cx, b.cy - a.cy) || 1;
      // Stop short of the target centre so the head sits inside the square.
      const ex = b.cx - ((b.cx - a.cx) / len) * 22;
      const ey = b.cy - ((b.cy - a.cy) / len) * 22;
      return (
        <line
          key={`arrow${tone}-${from}${to}`}
          x1={a.cx}
          y1={a.cy}
          x2={ex}
          y2={ey}
          class={`mark-arrow${tone}`}
          marker-end={`url(#arrowhead${tone})`}
        />
      );
    });
  const arrows = [...drawArrows(marks.arrows, ''), ...drawArrows(marks.arrowsBad, '-bad'), ...drawArrows(marks.arrowsGood, '-good')];

  const labels = (marks.labels ?? []).map((sq) => {
    const { cx, cy } = center(sq);
    return (
      <g key={`label-${sq}`} class="mark-label">
        <rect x={cx - 38} y={cy - 24} width={76} height={48} rx={14} />
        <text x={cx} y={cy + 1} text-anchor="middle" dominant-baseline="central">
          {sq}
        </text>
      </g>
    );
  });

  let burst = null;
  if (marks.burst) {
    const { cx, cy } = center(marks.burst.sq);
    burst = (
      <g key={`burst-${marks.burst.id}`} class="mark-burst" transform={`translate(${cx} ${cy})`}>
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <circle key={i} r={7} style={`--a:${i * 45}deg`} />
        ))}
      </g>
    );
  }

  const hints = showHints
    ? [...targets.entries()].map(([sq, capture]) => {
        const { cx, cy } = center(sq);
        return capture ? (
          <circle key={`h${sq}`} cx={cx} cy={cy} r={S * 0.44} class="hint-capture" />
        ) : (
          <circle key={`h${sq}`} cx={cx} cy={cy} r={S * 0.15} class="hint-move" />
        );
      })
    : [];

  const pieces = ALL_SQUARES.flatMap((sq) => {
    const p = position.get(sq);
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
      <g key={lastMove?.to === sq ? `${sq}-${lastMove.id}` : sq} class={cls} style={style} data-piece={`${p.color}${p.type.toUpperCase()}`}>
        <PieceUse color={p.color} type={p.type} x={x + PAD} y={y + PAD} size={S - 2 * PAD} />
      </g>
    ];
  });

  let dragged = null;
  if (drag?.moved) {
    const p = position.get(drag.from);
    if (p) {
      dragged = (
        <g class={`piece piece-${p.color} piece-dragging`}>
          <PieceUse color={p.color} type={p.type} x={drag.x - S * 0.6} y={drag.y - S * 0.35 - S * 0.6} size={S * 1.2} />
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
        data-orientation={orientation}
        role="img"
        aria-label="לוח שחמט"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        <defs>
          <marker id="arrowhead" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="3.2" markerHeight="3.2" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 Z" class="mark-arrowhead" />
          </marker>
          {marks.arrowsGood && (
            <marker id="arrowhead-good" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="3.2" markerHeight="3.2" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 Z" class="mark-arrowhead-good" />
            </marker>
          )}
          {marks.arrowsBad && (
            <marker id="arrowhead-bad" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="3.2" markerHeight="3.2" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 Z" class="mark-arrowhead-bad" />
            </marker>
          )}
        </defs>
        {squares}
        {coords}
        {stars}
        {flag}
        {rings}
        {pieces}
        {hints}
        {dots}
        {hintRings}
        {arrows}
        {labels}
        {burst}
        {dragged}
      </svg>

      {promotion && (
        <div class="promo" dir="rtl" role="dialog" aria-label="בחירת כלי להכתרה">
          <p class="promo-title">הרגלי הגיע לקצה! למה להפוך אותו?</p>
          <div class="promo-options">
            {(['q', 'r', 'b', 'n'] as PieceSymbol[]).map((t) => (
              <button key={t} class="promo-btn" onClick={() => choosePromotion(t)}>
                <PieceIcon color={promotion.color} type={t} class="promo-glyph" />
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
