// The placement test for teens and adults (13+): short one-move questions, from easy
// (how a knight moves) to harder (mate in one, a fork). Each question belongs to a part of
// the path. Parts are passed in order: a part counts only when all of its questions and all
// earlier parts are right. Passing part 2 also passes part 1 (the board).
import type { Goal } from '../learning/types';
import { checkReal, type Issue } from './index';

export interface PlacementQuestion {
  id: string;
  part: number;
  fen: string;
  goal: Goal;
  /** Teens and adults only, so one text (with gendered tokens). */
  text: string;
}

export const PLACEMENT: PlacementQuestion[] = [
  {
    id: 'pl-knight',
    part: 2,
    fen: '7k/8/4r3/3b4/3N4/8/6PP/7K w - - 0 1',
    goal: { kind: 'findBestMove', moves: ['d4e6'] },
    text: '{אכול|אכלי} את הצריח השחור עם הפרש.'
  },
  {
    id: 'pl-bishop',
    part: 2,
    fen: '7k/8/2r5/6n1/8/8/8/2B4K w - - 0 1',
    goal: { kind: 'findBestMove', moves: ['c1g5'] },
    text: '{אכול|אכלי} כלי שחור עם הרץ.'
  },
  {
    id: 'pl-value',
    part: 3,
    fen: '6k1/8/3p1q2/8/4N3/8/8/6K1 w - - 0 1',
    goal: { kind: 'findBestMove', moves: ['e4f6'] },
    text: 'הפרש יכול לאכול שני כלים. {בחר|בחרי} את האכילה הכי משתלמת.'
  },
  {
    id: 'pl-check',
    part: 4,
    fen: '6k1/8/8/4r3/8/6B1/8/4K3 w - - 0 1',
    goal: { kind: 'escapeCheck', ways: ['capture'] },
    text: 'המלך הלבן בשח מהצריח. {צא|צאי} מהשח בדרך שגם מרוויחה כלי.'
  },
  {
    id: 'pl-mate',
    part: 5,
    fen: '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1',
    goal: { kind: 'mateIn', n: 1 },
    text: '{תן|תני} מט במסע אחד.'
  },
  {
    id: 'pl-castle',
    part: 6,
    fen: '4k3/pppppppp/8/8/8/8/PPPPPPPP/RNBQK2R w KQ - 0 1',
    goal: { kind: 'findBestMove', moves: ['e1g1'] },
    text: '{הצרח|הצריחי} לצד המלך.'
  },
  {
    id: 'pl-fork',
    part: 7,
    fen: 'r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1',
    goal: { kind: 'findBestMove', moves: ['b5c7'] },
    text: '{מצא|מצאי} מסע פרש שתוקף שני כלים שחורים בבת אחת.'
  },
  {
    id: 'pl-opening',
    part: 8,
    fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
    goal: { kind: 'findBestMove', moves: ['g1f3', 'b1c3', 'f1c4', 'f1b5', 'd2d4'] },
    text: 'זו תחילת משחק. {בחר|בחרי} מסע טוב לפתיחה.'
  }
];

/**
 * The highest part passed: parts in order, each needs all its questions right.
 * `right` holds the ids of the questions answered right. Returns 0 when nothing is passed.
 */
export function passedPart(right: string[]): number {
  const parts = [...new Set(PLACEMENT.map((q) => q.part))].sort((a, b) => a - b);
  let passed = 0;
  for (const part of parts) {
    if (!PLACEMENT.filter((q) => q.part === part).every((q) => right.includes(q.id))) break;
    passed = part;
  }
  return passed;
}

/** A first computer level that fits the result (a beginner adult finds level 1 too easy). */
export function suggestedLevel(rightCount: number): number {
  if (rightCount <= 2) return 2;
  if (rightCount <= 4) return 3;
  if (rightCount <= 6) return 4;
  if (rightCount === 7) return 5;
  return 6;
}

export function checkPlacement(): string[] {
  const issues: Issue[] = [];
  for (const q of PLACEMENT) checkReal(q.fen, q.goal, `placement ${q.id}`, issues, true);
  return issues.filter((i) => i.level === 'error').map((i) => `${i.where}: ${i.message}`);
}
