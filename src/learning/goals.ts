// Goal checking for drills: apply a move, decide when the goal is met,
// and find the shortest solution (for hints and for checking content).
import type { Color, PieceSymbol, Square } from 'chess.js';
import { applyMove, movesFrom, parseFen, piecesKey, type DMove, type Pieces } from './drill';
import type { Goal } from './types';

/** The state of a move-based drill (every goal kind except tapSquares). */
export interface DrillState {
  pieces: Pieces;
  learner: Color;
  /** Star squares already reached (collectStars). */
  collected: Square[];
  promoted: boolean;
  moves: number;
}

export function startState(fen: string): DrillState | null {
  const parsed = parseFen(fen);
  if (!parsed) return null;
  return { pieces: parsed.pieces, learner: parsed.turn, collected: [], promoted: false, moves: 0 };
}

/** Squares whose opponent pieces must be captured (captureAll). */
export function captureTargets(goal: Goal, start: DrillState): Square[] {
  if (goal.kind !== 'captureAll') return [];
  if (goal.targets) return goal.targets;
  return [...start.pieces.entries()].filter(([, p]) => p.color !== start.learner).map(([s]) => s);
}

/** Every move the learner can make now. */
export function learnerMoves(state: DrillState): DMove[] {
  const out: DMove[] = [];
  for (const [s, p] of state.pieces) if (p.color === state.learner) out.push(...movesFrom(state.pieces, s));
  return out;
}

export function isLegal(state: DrillState, from: Square, to: Square): DMove | null {
  const p = state.pieces.get(from);
  if (!p || p.color !== state.learner) return null;
  return movesFrom(state.pieces, from).find((m) => m.to === to) ?? null;
}

export function step(goal: Goal, state: DrillState, move: DMove, promotion: PieceSymbol = 'q'): DrillState {
  const collected =
    goal.kind === 'collectStars' && goal.squares.includes(move.to) && !state.collected.includes(move.to)
      ? [...state.collected, move.to]
      : state.collected;
  return {
    pieces: applyMove(state.pieces, move, promotion),
    learner: state.learner,
    collected,
    promoted: state.promoted || !!move.promotion,
    moves: state.moves + 1
  };
}

/** `targets` must come from captureTargets on the start state (the opponent never moves). */
export function isDone(goal: Goal, state: DrillState, targets: Square[]): boolean {
  switch (goal.kind) {
    case 'collectStars':
      return goal.squares.every((s) => state.collected.includes(s));
    case 'captureAll':
      return targets.every((s) => {
        const p = state.pieces.get(s);
        return !p || p.color === state.learner;
      });
    case 'reachSquare':
      return state.pieces.get(goal.square)?.color === state.learner;
    case 'promote':
      return state.promoted;
    case 'tapSquares':
      return false; // handled by the screen, not by moves
  }
}

const MAX_DEPTH = 16;
const MAX_STATES = 60000;

/**
 * Shortest list of moves that meets the goal, by breadth-first search.
 * Returns null when there is no solution within the search limits.
 */
export function solve(goal: Goal, state: DrillState, targets: Square[]): DMove[] | null {
  if (goal.kind === 'tapSquares') return null;
  if (isDone(goal, state, targets)) return [];
  const key = (s: DrillState) => `${piecesKey(s.pieces)}|${[...s.collected].sort().join('')}|${s.promoted ? 1 : 0}`;
  const seen = new Set<string>([key(state)]);
  let frontier: { state: DrillState; path: DMove[] }[] = [{ state, path: [] }];
  for (let depth = 0; depth < MAX_DEPTH && frontier.length > 0; depth++) {
    const next: typeof frontier = [];
    for (const node of frontier) {
      for (const m of learnerMoves(node.state)) {
        const s = step(goal, node.state, m);
        const path = [...node.path, m];
        if (isDone(goal, s, targets)) return path;
        const k = key(s);
        if (seen.has(k)) continue;
        seen.add(k);
        if (seen.size > MAX_STATES) return null;
        next.push({ state: s, path });
      }
    }
    frontier = next;
  }
  return null;
}
