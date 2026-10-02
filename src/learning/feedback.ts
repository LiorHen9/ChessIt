// Short, beginner-friendly explanations for a move that is not allowed.
import type { Square } from 'chess.js';
import { fileOf, rankOf, type Pieces } from './drill';

const RULE: Record<string, string> = {
  r: 'הצריח זז רק ישר: למעלה, למטה או הצידה.',
  b: 'הרץ זז רק באלכסון.',
  q: 'המלכה זזה ישר או באלכסון.',
  k: 'המלך זז רק צעד אחד.',
  n: 'הפרש זז רק בצורת L: שתיים ישר ואחת הצידה.',
  p: 'הרגלי זז רק קדימה, ואוכל רק באלכסון.'
};

export function illegalReason(pieces: Pieces, from: Square, to: Square): string {
  const piece = pieces.get(from);
  if (!piece) return 'אי אפשר לזוז לשם.';
  const there = pieces.get(to);
  if (there && there.color === piece.color) return 'שם כבר עומד כלי שלך.';

  const df = fileOf(to) - fileOf(from);
  const dr = rankOf(to) - rankOf(from);
  const straight = df === 0 || dr === 0;
  const diagonal = Math.abs(df) === Math.abs(dr);
  const slides =
    (piece.type === 'r' && straight) || (piece.type === 'b' && diagonal) || (piece.type === 'q' && (straight || diagonal));
  if (slides) return 'יש כלי בדרך, ואי אפשר לקפוץ מעליו.';

  if (piece.type === 'p') {
    const forward = piece.color === 'w' ? 1 : -1;
    if (df === 0 && dr === forward && there) return 'הרגלי לא אוכל ישר – רק באלכסון.';
    if (df === 0 && dr === 2 * forward) return 'צעד כפול מותר רק במסע הראשון של הרגלי, ורק כשהדרך פנויה.';
    if (Math.abs(df) === 1 && dr === forward && !there) return 'באלכסון הרגלי זז רק כשהוא אוכל כלי.';
    if (dr * forward < 0) return 'הרגלי אף פעם לא זז אחורה.';
  }
  return RULE[piece.type];
}
