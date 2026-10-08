// End-of-game summary: find the player's best move and biggest mistake with Stockfish,
// and describe them in words that fit the player's age group.

import { Chess, type Color, type Move, type PieceSymbol, type Square } from 'chess.js';
import { PIECE_NAME, PIECE_VALUE } from '../chess/rules';
import type { AgeGroup } from '../profiles/profiles';
import type { SearchResult } from '../engine/uci';

/** Lichess-style winning chances in [-1, 1] from centipawns; saturates when one side is far ahead. */
export function winChances(cp: number): number {
  return 2 / (1 + Math.exp(-0.00368208 * cp)) - 1;
}

/** Below this drop in winning chances a move is not called a mistake. */
export const MISTAKE_THRESHOLD = 0.15;
/** A "good move" may lose at most this much. */
const GOOD_MAX_LOSS = 0.06;

export interface ReviewedMove {
  ply: number;
  /** Position before the move. */
  fenBefore: string;
  move: Move;
  /** Stockfish's choice in that position. */
  best: Move | null;
  /** Evaluations in centipawns from the player's point of view. */
  before: number;
  after: number;
  /** Drop in winning chances (0 = as good as the best move). */
  loss: number;
}

export interface MistakeFacts {
  /** Piece the opponent can now win with their best reply (or did win with their actual reply). */
  hangs?: PieceSymbol;
  /** True if the opponent actually took it. */
  lost?: boolean;
  /** The opponent can mate right away. */
  allowsMate?: boolean;
  /** The better move would have mated. */
  missedMate?: boolean;
  /** The better move would have captured this piece. */
  missedCapture?: PieceSymbol;
}

export interface GameReview {
  good: ReviewedMove | null;
  /** True when no move qualified as clearly good and `good` is just the least bad one. */
  goodIsFallback: boolean;
  mistake: (ReviewedMove & { facts: MistakeFacts }) | null;
  playerMoves: number;
}

export type Evaluate = (fen: string) => Promise<SearchResult>;

function scoreForTerminal(chess: Chess): SearchResult | null {
  if (chess.isCheckmate()) return { best: '(none)', score: -10000, mate: 0 };
  if (chess.isDraw() || chess.isStalemate()) return { best: '(none)', score: 0 };
  return null;
}

function moveFromUci(chess: Chess, uci: string): Move | null {
  if (!uci || uci === '(none)') return null;
  try {
    const c = new Chess(chess.fen());
    return c.move({ from: uci.slice(0, 2) as Square, to: uci.slice(2, 4) as Square, promotion: uci[4] as PieceSymbol | undefined });
  } catch {
    return null;
  }
}

/**
 * Evaluate every position the player moved from and into. `onProgress(done, total)` drives the progress bar.
 */
export async function reviewGame(
  startFen: string,
  moves: string[],
  human: Color,
  evaluate: Evaluate,
  onProgress?: (done: number, total: number) => void
): Promise<GameReview> {
  const chess = new Chess(startFen);
  const fens: string[] = [chess.fen()];
  const played: Move[] = [];
  for (const lan of moves) {
    played.push(chess.move({ from: lan.slice(0, 2) as Square, to: lan.slice(2, 4) as Square, promotion: lan[4] as PieceSymbol | undefined }));
    fens.push(chess.fen());
  }

  // Which positions matter: before and after each of the player's moves.
  const needed = new Set<number>();
  played.forEach((m, i) => {
    if (m.color === human) {
      needed.add(i);
      needed.add(i + 1);
    }
  });
  const order = [...needed].sort((a, b) => a - b);
  const evals = new Map<number, SearchResult>();
  let done = 0;
  onProgress?.(0, order.length);
  for (const i of order) {
    const terminal = scoreForTerminal(new Chess(fens[i]));
    evals.set(i, terminal ?? (await evaluate(fens[i])));
    onProgress?.(++done, order.length);
  }

  // Score from the player's side: positions where the opponent is to move are flipped.
  const forPlayer = (i: number) => {
    const e = evals.get(i)!;
    const turn = new Chess(fens[i]).turn();
    return turn === human ? e.score : -e.score;
  };

  const reviewed: ReviewedMove[] = [];
  played.forEach((m, i) => {
    if (m.color !== human) return;
    const before = forPlayer(i);
    const after = forPlayer(i + 1);
    reviewed.push({
      ply: i,
      fenBefore: fens[i],
      move: m,
      best: moveFromUci(new Chess(fens[i]), evals.get(i)!.best),
      before,
      after,
      loss: Math.max(0, winChances(before) - winChances(after))
    });
  });

  // Biggest mistake.
  let mistake: GameReview['mistake'] = null;
  const worst = reviewed.reduce<ReviewedMove | null>((w, r) => (!w || r.loss > w.loss ? r : w), null);
  if (worst && worst.loss >= MISTAKE_THRESHOLD) {
    const facts: MistakeFacts = {};
    const afterEval = evals.get(worst.ply + 1)!;
    const afterPos = new Chess(fens[worst.ply + 1]);
    const reply = moveFromUci(afterPos, afterEval.best);
    const actual = played[worst.ply + 1];
    if (afterEval.mate === 1) facts.allowsMate = true;
    else if (actual?.captured) {
      facts.hangs = actual.captured;
      facts.lost = true;
    } else if (reply?.captured) facts.hangs = reply.captured;
    if (worst.best) {
      if (worst.best.san.endsWith('#')) facts.missedMate = true;
      else if (worst.best.captured) facts.missedCapture = worst.best.captured;
    }
    mistake = { ...worst, facts };
  }

  // Best move: nearly as good as Stockfish's choice, and seizing the most: a mate, a capture,
  // or a chance the opponent just gave away.
  let good: ReviewedMove | null = null;
  let goodScore = -Infinity;
  let prevAfter = reviewed.length ? reviewed[0].before : 0;
  for (const r of reviewed) {
    if (r.loss <= GOOD_MAX_LOSS && r.ply !== mistake?.ply) {
      const isBest = !!r.best && r.best.lan === r.move.lan;
      const mate = r.move.san.endsWith('#');
      const gain = (r.move.captured ? PIECE_VALUE[r.move.captured] : 0) + (r.move.promotion ? PIECE_VALUE[r.move.promotion] - 1 : 0);
      const opportunity = Math.max(0, winChances(r.before) - winChances(prevAfter));
      const score = (mate ? 3 : 0) + gain * 0.12 + opportunity + (isBest ? 0.15 : 0) + (r.move.san.includes('+') ? 0.05 : 0);
      if (score > goodScore) {
        goodScore = score;
        good = r;
      }
    }
    prevAfter = r.after;
  }
  let goodIsFallback = false;
  if (!good && reviewed.length) {
    good = reviewed.filter((r) => r.ply !== mistake?.ply).sort((a, b) => a.loss - b.loss)[0] ?? null;
    goodIsFallback = true;
  }

  return { good, goodIsFallback, mistake, playerMoves: reviewed.length };
}

// ---------- Words ----------

const the = (p: PieceSymbol) => `ה${PIECE_NAME[p]}`;

/** Keep a left-to-right run (move notation, "+1.5") intact inside Hebrew. The summary renders it as <bdi dir="ltr">. */
export const LTR_START = '\u2066';
export const LTR_END = '\u2069';
const ltr = (s: string) => `${LTR_START}${s}${LTR_END}`;

/** "הפרש ל-f3" */
function describeMove(m: Move): string {
  return `${the(m.piece)} ל-${m.to}`;
}

/** Evaluation in pawns for teens and adults, e.g. "+1.5". */
export function pawns(cp: number): string {
  if (Math.abs(cp) >= 9000) return cp > 0 ? 'מט' : 'מט ליריב';
  const v = Math.abs(cp / 100).toFixed(1);
  return cp > 0 ? `+${v}` : cp < 0 ? `\u2212${v}` : v;
}

export interface Explanation {
  title: string;
  text: string;
  /** Extra line with technical terms (13+ only). */
  detail?: string;
}

export function explainGood(r: ReviewedMove, fallback: boolean, age: AgeGroup): Explanation {
  const m = r.move;
  const mate = m.san.endsWith('#');
  const isBest = !!r.best && r.best.lan === m.lan;
  const title = fallback ? 'המסע הכי טוב שלך' : 'מסע טוב';
  if (age === 'kids5_7') {
    if (mate) return { title, text: 'מט! ניצחת! 🎉' };
    if (m.captured) return { title, text: `כאן אכלת את ${the(m.captured)}! כל הכבוד!` };
    if (m.promotion) return { title, text: `החייל שלך הפך ל${PIECE_NAME[m.promotion]}!` };
    return { title, text: isBest ? 'מסע מצוין! בדיוק מה שהמחשב היה עושה.' : 'מסע חכם!' };
  }
  if (age === 'kids8_12') {
    if (mate) return { title, text: 'מט! למלך של היריב כבר אין לאן לברוח.' };
    if (m.captured) return { title, text: `אכלת את ${the(m.captured)} של היריב. ${isBest ? 'זה גם המסע שהמחשב היה בוחר!' : 'יופי של מסע!'}` };
    if (m.promotion) return { title, text: `הבאת חייל עד הסוף והוא הפך ל${PIECE_NAME[m.promotion]}.` };
    return { title, text: isBest ? `${describeMove(m)}: בדיוק המסע שהמחשב היה בוחר.` : `${describeMove(m)}: מסע טוב ששומר על העמדה.` };
  }
  const detail = `הערכה אחרי המסע: ${ltr(pawns(r.after))}`;
  if (mate) return { title, text: `${ltr(m.san)} – מט. סיום מושלם.` };
  if (m.captured) return { title, text: `${ltr(m.san)}: זכית ב${PIECE_NAME[m.captured]} (שווה ${PIECE_VALUE[m.captured]}).`, detail };
  if (isBest) return { title, text: `${ltr(m.san)} – המסע הטוב ביותר בעמדה, לפי המחשב.`, detail };
  return { title, text: `${ltr(m.san)} – מסע מדויק, כמעט כמו הבחירה של המחשב.`, detail };
}

export function explainMistake(r: ReviewedMove & { facts: MistakeFacts }, age: AgeGroup): Explanation {
  const f = r.facts;
  const title = 'מסע לשיפור';
  const better = r.best ? describeMove(r.best) : null;
  if (age === 'kids5_7') {
    if (f.allowsMate) return { title, text: 'כאן היריב יכול היה לתת לך מט!' };
    if (f.missedMate) return { title, text: 'כאן היה אפשר לתת מט!' };
    if (f.hangs) return { title, text: f.lost ? `כאן איבדת את ${the(f.hangs)}!` : `כאן ${the(f.hangs)} שלך היה בסכנה!` };
    if (f.missedCapture) return { title, text: `כאן היה אפשר לאכול את ${the(f.missedCapture)}!` };
    return { title, text: 'כאן היה מסע טוב יותר. החץ הירוק מראה אותו.' };
  }
  if (age === 'kids8_12') {
    let main: string;
    if (f.allowsMate) main = 'אחרי המסע הזה היריב יכול היה לתת מט.';
    else if (f.missedMate) main = 'כאן היה מט במסע אחד!';
    else if (f.hangs) main = f.lost ? `אחרי המסע הזה היריב אכל את ${the(f.hangs)} שלך.` : `אחרי המסע הזה היריב יכול היה לאכול את ${the(f.hangs)} שלך.`;
    else if (f.missedCapture) main = `כאן היה אפשר לאכול את ${the(f.missedCapture)} של היריב.`;
    else main = 'המסע הזה החליש את העמדה שלך.';
    return { title, text: better ? `${main} עדיף היה ${better}.` : main };
  }
  let main: string;
  if (f.allowsMate) main = `${ltr(r.move.san)} מאפשר ליריב מט במסע אחד.`;
  else if (f.missedMate) main = `${ltr(r.move.san)} מפספס מט: ${ltr(r.best?.san ?? '')}.`;
  else if (f.hangs) main = `${ltr(r.move.san)} משאיר את ${the(f.hangs)} בלי הגנה, והיריב זוכה בחומר.`;
  else if (f.missedCapture) main = `${ltr(r.move.san)} מפספס זכייה ב${PIECE_NAME[f.missedCapture]}.`;
  else main = `${ltr(r.move.san)} מחליש את העמדה.`;
  return {
    title,
    text: r.best && !f.missedMate ? `${main} עדיף היה ${ltr(r.best.san)}.` : main,
    detail: `הערכה לפני המסע: ${ltr(pawns(r.before))}, אחריו: ${ltr(pawns(r.after))}`
  };
}
