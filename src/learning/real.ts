// Goals on real positions: chess.js with two kings, check and every rule.
//
// The drills of worlds 1–2 run on learning/drill.ts (only the learner moves). From world 3 on,
// positions are real chess: the learner can be in check, pieces can be pinned, and the other
// side answers. Pure functions, so the app, the content check and the tests share them.
//
// Opponent replies are computed, not written in the content (see ARCHITECTURE.md):
// - mateIn: the reply that delays mate the longest (exact search, n ≤ 3).
// - findBestMove with `line`: the scripted reply.
// - playOut: "defender" (a lone king that runs to the middle and grabs loose pieces) or a
//   computer level, handled by the screen.
import { Chess, type Color, type Move, type PieceSymbol, type Square } from 'chess.js';
import { PIECE_NAME, PIECE_VALUE } from '../chess/rules';
import { movesFrom as drillMovesFrom, parseFen } from './drill';
import type { EscapeWay, Goal } from './types';

export const uciOf = (m: Move): string => m.lan;

/** A copy of the game that keeps the starting FEN (chess.js copies lose history otherwise). */
export function clone(chess: Chess): Chess {
  return new Chess(chess.fen());
}

/** Play a UCI move ("e2e4", "e7e8q"). Returns the move, or null when it is not legal. */
export function playUci(chess: Chess, uci: string): Move | null {
  try {
    return chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined });
  } catch {
    return null;
  }
}

/** Does the learner's move match a move from the content? "e7e8" (no piece) matches any promotion. */
export function sameMove(played: string, wanted: string): boolean {
  return wanted.length === 4 ? played.slice(0, 4) === wanted : played === wanted;
}

// ---------------------------------------------------------------------------------------------
// Position checks (content validation)

/** Why a FEN cannot be used for a real-position goal, or null when it is fine. */
export function realFenProblem(fen: string): string | null {
  let chess: Chess;
  try {
    chess = new Chess(fen);
  } catch (e) {
    return String((e as Error).message ?? e);
  }
  const pieces = chess.board().flat().filter((p) => !!p);
  for (const c of ['w', 'b'] as Color[]) {
    const kings = pieces.filter((p) => p!.type === 'k' && p!.color === c).length;
    if (kings !== 1) return `needs exactly one ${c} king`;
  }
  if (pieces.some((p) => p!.type === 'p' && (p!.square[1] === '1' || p!.square[1] === '8'))) return 'pawn on the first or last row';
  const them = chess.turn() === 'w' ? 'b' : 'w';
  const [theirKing] = chess.findPiece({ type: 'k', color: them });
  if (theirKing && chess.isAttacked(theirKing, chess.turn())) return 'the side not to move is in check';
  if (chess.isGameOver()) return 'the game is already over';
  return null;
}

// ---------------------------------------------------------------------------------------------
// Mate search

/** A learner move that forces mate within `n` moves, or null. Exact; keep n ≤ 3. */
export function mateMove(chess: Chess, n: number): Move | null {
  if (n < 1) return null;
  const moves = chess.moves({ verbose: true });
  // Checks first: mates are almost always found among them.
  moves.sort((a, b) => Number(b.san.includes('+') || b.san.includes('#')) - Number(a.san.includes('+') || a.san.includes('#')));
  for (const m of moves) {
    chess.move(m);
    let ok = false;
    if (chess.isCheckmate()) ok = true;
    else if (n > 1 && !chess.isGameOver()) ok = chess.moves({ verbose: true }).every((r) => {
      chess.move(r);
      const forced = mateMove(chess, n - 1) !== null;
      chess.undo();
      return forced;
    });
    chess.undo();
    if (ok) return m;
  }
  return null;
}

/** Shortest forced mate for the side to move, searching up to `max` moves. Null = none found. */
export function mateDistance(chess: Chess, max: number): number | null {
  for (let n = 1; n <= max; n++) if (mateMove(chess, n)) return n;
  return null;
}

/**
 * The defending side's reply in a mateIn drill: the move that delays mate the longest
 * (escaping mate entirely wins). Ties keep chess.js order, so the reply is repeatable.
 */
export function bestDefence(chess: Chess, maxMate: number): Move {
  const replies = chess.moves({ verbose: true });
  let best = replies[0];
  let bestScore = -1;
  for (const r of replies) {
    chess.move(r);
    const d = mateDistance(chess, maxMate);
    chess.undo();
    const score = d === null ? 99 : d;
    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------------------------
// Safety of pieces

export const value = (p: PieceSymbol | undefined) => (p ? PIECE_VALUE[p] : 0);

/** The same position with the other side to move (no en passant). For "what could they do?" questions. */
export function flipped(chess: Chess): Chess {
  const parts = chess.fen().split(' ');
  parts[1] = parts[1] === 'w' ? 'b' : 'w';
  parts[3] = '-';
  try {
    return new Chess(parts.join(' '));
  } catch {
    return new Chess(chess.fen());
  }
}

/**
 * Is the piece on `square` safe from the other side right now? (It is the other side's move.)
 * Unsafe = it can be taken for free, or by something worth less than it.
 */
export function isSafe(chess: Chess, square: Square): boolean {
  const piece = chess.get(square);
  if (!piece) return true;
  if (piece.color === chess.turn()) chess = flipped(chess);
  for (const m of chess.moves({ verbose: true })) {
    if (m.to !== square || !m.captured) continue;
    chess.move(m);
    const defended = chess.isAttacked(square, piece.color);
    chess.undo();
    if (!defended || value(m.piece) < value(piece.type)) return false;
  }
  return true;
}

/** Pieces of `color` that the side to move (the other side) can win right now. Most valuable first. */
export function loosePieces(chess: Chess, color: Color): Square[] {
  const out: Square[] = [];
  for (const row of chess.board()) {
    for (const p of row) {
      if (p && p.color === color && p.type !== 'k' && !isSafe(chess, p.square)) out.push(p.square);
    }
  }
  return out.sort((a, b) => value(chess.get(b)?.type) - value(chess.get(a)?.type));
}

// ---------------------------------------------------------------------------------------------
// Escaping check

/** How a move gets out of check: taking the checking piece, moving the king, or blocking. */
export function escapeWay(chessBefore: Chess, m: Move): EscapeWay {
  const [king] = chessBefore.findPiece({ type: 'k', color: chessBefore.turn() });
  const them = chessBefore.turn() === 'w' ? 'b' : 'w';
  const checkers = king ? chessBefore.attackers(king, them) : [];
  if (m.captured && checkers.includes(m.to)) return 'capture';
  if (m.piece === 'k') return 'move';
  return 'block';
}

// ---------------------------------------------------------------------------------------------
// Feedback for a move the board refused

/**
 * Why a move is not allowed in a real position, in beginner words.
 * Returns null when the piece cannot move like that at all (then the drill feedback explains the piece).
 */
export function checkReason(chess: Chess, from: Square, to: Square): string | null {
  const piece = chess.get(from);
  if (!piece || piece.color !== chess.turn()) return null;
  const parsed = parseFen(chess.fen());
  // Castling: the king moves two squares.
  if (piece.type === 'k' && from[1] === to[1] && Math.abs(from.charCodeAt(0) - to.charCodeAt(0)) === 2) {
    if (chess.inCheck()) return 'אי אפשר להצריח כשהמלך בשח.';
    return 'אי אפשר להצריח עכשיו: המלך או הצריח כבר זזו, יש כלי בדרך, או שהמלך יעבור במשבצת מותקפת.';
  }
  const pseudo = parsed ? drillMovesFrom(parsed.pieces, from).some((m) => m.to === to) : false;
  if (!pseudo) return null;
  if (chess.inCheck()) return 'המלך שלך בשח! קודם צריך להציל אותו.';
  if (piece.type === 'k') return 'המלך לא יכול ללכת למשבצת שמותקפת – זה היה שח.';
  return `ה${PIECE_NAME[piece.type]} מגן על המלך: אם יזוז, המלך יהיה בשח.`;
}

// ---------------------------------------------------------------------------------------------
// Lone-king defender (playOut against "defender")

function centerDistance(sq: Square): number {
  const f = sq.charCodeAt(0) - 97;
  const r = Number(sq[1]) - 1;
  return Math.max(Math.abs(f - 3.5), Math.abs(r - 3.5));
}

/** Legal moves of the side NOT to move, as if it were its turn (no check against it assumed). */
function mobilityOf(chess: Chess): number {
  return flipped(chess).moves().length;
}

/**
 * The defending side's move in an endgame drill: grab a loose piece if there is one,
 * otherwise keep as much room as possible and stay near the middle. Deterministic.
 */
export function defenderMove(chess: Chess): Move {
  const moves = chess.moves({ verbose: true });
  const me = chess.turn();
  let best = moves[0];
  let bestScore = -Infinity;
  for (const m of moves) {
    let score = 0;
    if (m.captured) {
      chess.move(m);
      const defended = chess.isAttacked(m.to, me === 'w' ? 'b' : 'w');
      chess.undo();
      score += defended ? -50 : 100 + value(m.captured);
    }
    chess.move(m);
    if (chess.isCheckmate()) score += 1000;
    score += mobilityOf(chess) * 3 - centerDistance(m.to) * 2;
    chess.undo();
    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------------------------
// Winning a simple endgame (hints for playOut, and the content check)

function kingSquare(chess: Chess, c: Color): Square {
  return chess.findPiece({ type: 'k', color: c })[0];
}

function distance(a: Square, b: Square): number {
  return Math.max(Math.abs(a.charCodeAt(0) - b.charCodeAt(0)), Math.abs(Number(a[1]) - Number(b[1])));
}

/** Score for the attacker after the defender's reply (attacker to move). */
function squeezeScore(chess: Chess, attacker: Color): number {
  if (chess.isCheckmate()) return -1e6; // attacker is mated (should not happen)
  if (chess.isDraw()) return -1e5;
  if (mateMove(chess, 1)) return 1e5;
  const defender = attacker === 'w' ? 'b' : 'w';
  const dk = kingSquare(chess, defender);
  const ak = kingSquare(chess, attacker);
  let score = 0;
  // Pieces the defender is attacking and could take next turn count heavily.
  for (const sq of loosePiecesFor(chess, attacker)) score -= value(chess.get(sq)?.type) * 200;
  score -= mobilityOf2(chess, defender) * 12;
  score += centerDistance(dk) * 20;
  score -= distance(ak, dk) * 6;
  return score;
}

/** Attacker pieces (attacker to move) that the defender attacks and nobody defends. */
function loosePiecesFor(chess: Chess, attacker: Color): Square[] {
  const defender = attacker === 'w' ? 'b' : 'w';
  const out: Square[] = [];
  for (const row of chess.board()) {
    for (const p of row) {
      if (!p || p.color !== attacker || p.type === 'k') continue;
      if (chess.isAttacked(p.square, defender) && !defendedBy(chess, p.square, attacker)) out.push(p.square);
    }
  }
  return out;
}

/** Is `square` (holding a piece of `color`) protected by another piece of `color`? */
function defendedBy(chess: Chess, square: Square, color: Color): boolean {
  // chess.js attack detection ignores what stands on the square itself.
  return chess.isAttacked(square, color);
}

function mobilityOf2(chess: Chess, side: Color): number {
  return chess.turn() === side ? chess.moves().length : mobilityOf(chess);
}

/**
 * A good move for the attacking side (to move) in a simple won endgame:
 * mate when possible, otherwise squeeze the lone king while keeping every piece safe.
 */
export function squeezeMove(chess: Chess): Move {
  const me = chess.turn();
  const mate = mateMove(chess, 1);
  if (mate) return mate;
  let best: Move | null = null;
  let bestScore = -Infinity;
  for (const m of chess.moves({ verbose: true })) {
    chess.move(m);
    let worst = Infinity;
    if (chess.isStalemate() || chess.isDraw()) worst = -1e5;
    else {
      for (const r of chess.moves({ verbose: true })) {
        chess.move(r);
        worst = Math.min(worst, squeezeScore(chess, me));
        chess.undo();
        if (worst < bestScore) break;
      }
    }
    chess.undo();
    if (worst > bestScore) {
      bestScore = worst;
      best = m;
    }
  }
  return best ?? chess.moves({ verbose: true })[0];
}

/**
 * Play the learner with squeezeMove against defenderMove. Returns the number of learner moves
 * to mate, or null if it did not win within `limit` moves. Used by the content check.
 */
export function simulateDefender(fen: string, limit = 60): number | null {
  const chess = new Chess(fen);
  for (let n = 1; n <= limit; n++) {
    chess.move(squeezeMove(chess));
    if (chess.isCheckmate()) return n;
    if (chess.isGameOver()) return null;
    chess.move(defenderMove(chess));
    if (chess.isGameOver()) return null;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Checking a single learner move against the goal

export type Verdict =
  | { ok: true; done: boolean; way?: EscapeWay }
  | { ok: false; reason: WrongReason; way?: EscapeWay; piece?: PieceSymbol; square?: Square };

export type WrongReason =
  | 'stalemate'
  | 'checkNotMate'
  | 'notMate'
  | 'noForcedMate'
  | 'wrongWay'
  | 'sameWay'
  | 'stillInDanger'
  | 'hangs'
  | 'notCheck'
  | 'wrongMove';

/**
 * Judge a learner move for single-move goals (and each learner move of mateIn).
 * `chess` is the position before the move; it is left unchanged.
 * `found` lists escape ways already found (escapeCheck with findAll).
 * `movesLeft` = learner moves left including this one (mateIn).
 */
export function judge(chess: Chess, goal: Goal, uci: string, opts: { found?: EscapeWay[]; movesLeft?: number } = {}): Verdict {
  const before = clone(chess);
  const after = clone(chess);
  const m = playUci(after, uci);
  if (!m) return { ok: false, reason: 'wrongMove' };

  switch (goal.kind) {
    case 'mateIn': {
      if (after.isCheckmate()) return { ok: true, done: true };
      if (after.isStalemate()) return { ok: false, reason: 'stalemate' };
      const left = (opts.movesLeft ?? goal.n) - 1;
      if (left >= 1 && mateDistanceAfterReplies(after, left)) return { ok: true, done: false };
      return { ok: false, reason: left >= 1 ? 'noForcedMate' : after.inCheck() ? 'checkNotMate' : 'notMate' };
    }
    case 'escapeCheck': {
      const way = escapeWay(before, m);
      const ways = goal.ways ?? ['move', 'block', 'capture'];
      if (!ways.includes(way)) return { ok: false, reason: 'wrongWay', way };
      if (goal.findAll && opts.found?.includes(way)) return { ok: false, reason: 'sameWay', way };
      const found = [...(opts.found ?? []), way];
      const done = !goal.findAll || ways.every((w) => found.includes(w));
      return { ok: true, done, way };
    }
    case 'defend': {
      const target = m.from === goal.square ? m.to : goal.square;
      const piece = after.get(target);
      if (!piece || !isSafe(after, target)) return { ok: false, reason: 'stillInDanger', piece: piece?.type, square: target };
      const loose = loosePieces(after, before.turn());
      if (loose.length && value(after.get(loose[0])?.type) >= value(piece.type))
        return { ok: false, reason: 'hangs', piece: after.get(loose[0])?.type, square: loose[0] };
      return { ok: true, done: true };
    }
    case 'findBestMove': {
      if (goal.accept === 'check') return after.inCheck() ? { ok: true, done: true } : { ok: false, reason: 'notCheck' };
      if (goal.moves?.some((w) => sameMove(uci, w))) return { ok: true, done: true };
      const loose = loosePieces(after, before.turn());
      if (loose.length && !loosePieces(before, before.turn()).length)
        return { ok: false, reason: 'hangs', piece: after.get(loose[0])?.type, square: loose[0] };
      return { ok: false, reason: 'wrongMove' };
    }
    default:
      return { ok: true, done: false };
  }
}

/** After a learner move (other side to move): does a forced mate in `left` learner moves remain? */
function mateDistanceAfterReplies(after: Chess, left: number): boolean {
  if (after.isGameOver()) return false;
  return after.moves({ verbose: true }).every((r) => {
    after.move(r);
    const ok = mateMove(after, left) !== null;
    after.undo();
    return ok;
  });
}

/** A move that solves a single-move goal (or the next step of mateIn), for hints and checks. */
export function solution(chess: Chess, goal: Goal, opts: { found?: EscapeWay[]; movesLeft?: number } = {}): Move | null {
  if (goal.kind === 'mateIn') return mateMove(clone(chess), opts.movesLeft ?? goal.n);
  if (goal.kind === 'findBestMove' && goal.moves?.length) {
    return playUci(clone(chess), goal.moves[0]);
  }
  if (goal.kind === 'playOut') return null;
  for (const m of chess.moves({ verbose: true })) {
    const v = judge(chess, goal, uciOf(m), opts);
    if (v.ok) return m;
  }
  return null;
}

/** Squares the checked king could step to if it were not attacked there (for "check, not mate" hints). */
export function kingEscapes(chess: Chess): Square[] {
  const [k] = chess.findPiece({ type: 'k', color: chess.turn() });
  if (!k) return [];
  return chess.moves({ square: k, verbose: true }).map((m) => m.to);
}
