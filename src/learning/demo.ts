// Turns a lesson's demo steps into frames the board can show one after another.
import type { Square } from 'chess.js';
import type { BoardMarks } from '../components/Board';
import { applyMove, movesFrom, parseFen, type Pieces } from './drill';
import type { Station } from './types';

export interface DemoFrame {
  pieces: Pieces;
  marks: BoardMarks;
  move: { from: Square; to: Square } | null;
  caption?: string;
  ms: number;
}

export function demoFrames(station: Station): DemoFrame[] {
  let pieces: Pieces = parseFen(station.demoFen ?? station.fen)?.pieces ?? new Map();
  const frames: DemoFrame[] = [];
  for (const step of station.demo ?? []) {
    if (step.fen) pieces = parseFen(step.fen)?.pieces ?? pieces;
    let move: DemoFrame['move'] = null;
    if (step.move) {
      const from = step.move.slice(0, 2) as Square;
      const to = step.move.slice(2, 4) as Square;
      // Use the real move when there is one, so a pawn reaching the end turns into a queen.
      const real = movesFrom(pieces, from).find((m) => m.to === to) ?? { from, to };
      const piece = pieces.get(from);
      const empty = !pieces.has(to);
      pieces = applyMove(pieces, real);
      // Castling: the king moves two squares, and the rook jumps over it.
      if (piece?.type === 'k' && from[1] === to[1] && Math.abs(from.charCodeAt(0) - to.charCodeAt(0)) === 2) {
        const kingSide = to[0] === 'g';
        const rookFrom = `${kingSide ? 'h' : 'a'}${from[1]}` as Square;
        const rookTo = `${kingSide ? 'f' : 'd'}${from[1]}` as Square;
        const rook = pieces.get(rookFrom);
        if (rook) pieces = applyMove(pieces, { from: rookFrom, to: rookTo });
      }
      // En passant: a pawn moves diagonally to an empty square and takes the pawn beside it.
      if (piece?.type === 'p' && from[0] !== to[0] && empty) {
        const passed = `${to[0]}${from[1]}` as Square;
        if (pieces.get(passed)?.type === 'p') {
          pieces = new Map(pieces);
          pieces.delete(passed);
        }
      }
      move = { from, to };
    }
    const marks: BoardMarks = {
      highlight: step.highlight,
      highlightAlt: step.highlightAlt,
      arrows: step.arrows,
      dots: step.dots,
      labels: step.labels
    };
    if (step.showMoves) {
      const moves = movesFrom(pieces, step.showMoves);
      marks.dots = [...(marks.dots ?? []), ...moves.filter((m) => !m.captured).map((m) => m.to)];
      marks.rings = moves.filter((m) => m.captured).map((m) => m.to);
      marks.highlight = [...(marks.highlight ?? []), step.showMoves];
    }
    frames.push({ pieces, marks, move, caption: step.caption, ms: step.ms ?? 1200 });
  }
  return frames;
}
