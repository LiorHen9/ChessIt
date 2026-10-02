// The coach for guided games (playOut with `coach`): a short comment on every learner move,
// and a suggested move for the hint button. Simple rules a beginner can follow:
// - in the opening: pawns to the middle, knights and bishops out, castle early,
//   keep the queen home, don't move the same piece twice, don't walk the king;
// - always: don't leave pieces where they can be taken, take free pieces, and see mate in one.
import { Chess, type Color, type Move } from 'chess.js';
import { PIECE_NAME } from '../chess/rules';
import { clone, loosePieces, mateMove, value } from './real';

export type CoachTone = 'good' | 'ok' | 'bad';

export interface CoachNote {
  tone: CoachTone;
  /** Beginner words. Gendered tokens ({male|female}) are resolved by the screen. */
  text: string;
}

/** How many of the learner's moves count as "the opening". */
export const OPENING_MOVES = 10;

const CENTER = ['d4', 'e4', 'd5', 'e5'];
const BACK_RANK: Record<Color, string> = { w: '1', b: '8' };

/** Knights and bishops still on their starting squares. */
function undeveloped(chess: Chess, color: Color): number {
  const starts = color === 'w' ? ['b1', 'g1', 'c1', 'f1'] : ['b8', 'g8', 'c8', 'f8'];
  return starts.filter((sq) => {
    const p = chess.get(sq as never);
    return !!p && p.color === color && (p.type === 'n' || p.type === 'b');
  }).length;
}

/** The best free capture: takes a piece that is not protected (or worth more than the taker). */
function freeCapture(chess: Chess): Move | null {
  let best: Move | null = null;
  let gain = 0;
  for (const m of chess.moves({ verbose: true })) {
    if (!m.captured) continue;
    chess.move(m);
    const defended = chess.isAttacked(m.to, chess.turn());
    chess.undo();
    const g = defended ? value(m.captured) - value(m.piece) : value(m.captured);
    if (g > gain) {
      gain = g;
      best = m;
    }
  }
  return gain >= 2 ? best : null;
}

/** Opening points for a move (positive = follows the principles). */
function openingScore(before: Chess, m: Move, history: Move[]): number {
  const me = m.color;
  let s = 0;
  if (m.san.startsWith('O-O')) s += 6;
  else if (m.piece === 'k') s -= 5;
  if (m.piece === 'p' && CENTER.includes(m.to)) s += 4;
  else if (m.piece === 'p' && ['c', 'd', 'e', 'f'].includes(m.to[0]) && m.to[1] === (me === 'w' ? '3' : '6')) s += 1;
  else if (m.piece === 'p' && ['a', 'h'].includes(m.to[0])) s -= 1;
  if ((m.piece === 'n' || m.piece === 'b') && m.from[1] === BACK_RANK[me]) s += 4;
  if (m.piece === 'n' && ['a', 'h'].includes(m.to[0])) s -= 2;
  if (m.piece === 'q' && undeveloped(before, me) >= 2) s -= 4;
  if (m.piece === 'r' && !m.san.startsWith('O-O') && undeveloped(before, me) >= 2) s -= 2;
  const movedBefore = history.some((h) => h.color === me && h.to === m.from);
  if (movedBefore && !m.captured && m.piece !== 'p' && undeveloped(before, me) >= 2) s -= 2;
  return s;
}

/** A move for the hint button: mate, a free piece, then the opening principles, never a loose piece. */
export function coachMove(chess: Chess, history: Move[]): Move {
  const mate = mateMove(clone(chess), 1);
  if (mate) return mate;
  const me = chess.turn();
  const opening = history.filter((h) => h.color === me).length < OPENING_MOVES;
  let best = chess.moves({ verbose: true })[0];
  let bestScore = -Infinity;
  for (const m of chess.moves({ verbose: true })) {
    let s = opening ? openingScore(chess, m, history) : 0;
    chess.move(m);
    if (chess.isStalemate()) s -= 50;
    const loose = loosePieces(chess, me);
    if (loose.length) s -= value(chess.get(loose[0])?.type) * 5;
    chess.undo();
    if (m.captured) {
      chess.move(m);
      const defended = chess.isAttacked(m.to, chess.turn());
      chess.undo();
      s += (defended ? value(m.captured) - value(m.piece) : value(m.captured)) * 4;
    }
    if (s > bestScore) {
      bestScore = s;
      best = m;
    }
  }
  return best;
}

/**
 * A comment on the learner's move. `before` is the position before it; `history` the moves
 * played so far (not including this one).
 */
export function judgeMove(before: Chess, m: Move, history: Move[]): CoachNote {
  const me = m.color;
  const after = clone(before);
  after.move({ from: m.from, to: m.to, promotion: m.promotion });
  if (after.isCheckmate()) return { tone: 'good', text: 'מט! ניצחת! 🏆' };

  const mate = mateMove(clone(before), 1);
  if (mate) return { tone: 'bad', text: `היה מט במסע אחד: ${mate.san}. {חפש|חפשי} אותו בפעם הבאה!` };

  // A piece left where it can be taken (and it was not already lost before the move).
  const looseAfter = loosePieces(after, me);
  const looseBefore = loosePieces(before, me);
  const newlyLoose = looseAfter.find((sq) => !looseBefore.includes(sq) || sq === m.to);
  if (newlyLoose) {
    const p = after.get(newlyLoose);
    if (p && value(p.type) >= 2) {
      return { tone: 'bad', text: `זהירות! ה${PIECE_NAME[p.type]} ב-${newlyLoose} יכול להיאכל. אפשר לבטל את המסע.` };
    }
  }
  if (looseBefore.length && looseAfter.includes(looseBefore[0]) && m.from !== looseBefore[0]) {
    const p = before.get(looseBefore[0]);
    if (p && value(p.type) >= 3)
      return { tone: 'bad', text: `ה${PIECE_NAME[p.type]} ב-${looseBefore[0]} עדיין בסכנה. אפשר לבטל ולהציל אותו.` };
  }

  const free = freeCapture(clone(before));
  if (free && !m.captured) {
    return { tone: 'ok', text: `אפשר היה לאכול ${PIECE_NAME[free.captured!]} בחינם (${free.san}).` };
  }
  if (m.captured) return { tone: 'good', text: `אכלת ${PIECE_NAME[m.captured]}! 😋` };

  const opening = history.filter((h) => h.color === me).length < OPENING_MOVES;
  if (opening) {
    if (m.san.startsWith('O-O')) return { tone: 'good', text: 'הצרחה! המלך במקום בטוח, והצריח יוצא למשחק. 🏰' };
    if (m.piece === 'k') return { tone: 'bad', text: 'בפתיחה עדיף לא להזיז את המלך – עדיף להצריח.' };
    if (m.piece === 'p' && CENTER.includes(m.to)) return { tone: 'good', text: 'יפה! רגלי למרכז. 🎯' };
    if ((m.piece === 'n' || m.piece === 'b') && m.from[1] === BACK_RANK[me]) {
      if (m.piece === 'n' && ['a', 'h'].includes(m.to[0])) return { tone: 'ok', text: 'פרש בצד רואה פחות משבצות. עדיף לכיוון המרכז.' };
      return { tone: 'good', text: `יפה! ה${PIECE_NAME[m.piece]} יצא לשחק. 🐴` };
    }
    if (m.piece === 'q' && undeveloped(before, me) >= 2)
      return { tone: 'bad', text: 'המלכה יצאה מוקדם מדי. קודם מוציאים פרשים ורצים.' };
    const movedBefore = history.some((h) => h.color === me && h.to === m.from);
    if (movedBefore && m.piece !== 'p' && undeveloped(before, me) >= 2)
      return { tone: 'ok', text: 'הכלי הזה כבר זז. בפתיחה עדיף להוציא כלי חדש.' };
    if (m.piece === 'p' && ['a', 'h'].includes(m.to[0])) return { tone: 'ok', text: 'רגלי בצד לא עוזר הרבה. עדיף לשלוט במרכז.' };
  }
  return { tone: 'ok', text: '' };
}
