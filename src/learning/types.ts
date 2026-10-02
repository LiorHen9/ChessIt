// Types for the learning path content (src/content/worlds/*.json).
// The JSON files are plain data; src/content/index.ts validates them at load time.
import type { PieceSymbol, Square } from 'chess.js';
import type { AgeGroup } from '../profiles/profiles';

/**
 * One text per age group. Gendered words use `{male|female}` or `{male|female|neutral}`
 * and are resolved with byGender for the active profile (see learning/text.ts).
 */
export type AgeText = Record<AgeGroup, string>;

export type Goal =
  /** Land the learner's piece on every star square. */
  | { kind: 'collectStars'; squares: Square[] }
  /** Capture every opponent piece (or only the ones on `targets`). The opponent never moves. */
  | { kind: 'captureAll'; targets?: Square[] }
  /** Bring a learner piece to a square, marked with a flag and named in the text. */
  | { kind: 'reachSquare'; square: Square }
  /** Walk a pawn to the last row and promote it. */
  | { kind: 'promote' }
  /** Board lessons: tap the right squares. `ordered` asks for them one by one, by name. */
  | { kind: 'tapSquares'; squares: Square[]; ordered?: boolean; area?: Square[] };

export type GoalKind = Goal['kind'];

/**
 * One frame of a lesson demo. Fields are applied in order: `fen` replaces the position,
 * `move` slides a piece ("a1a8"), and the mark fields replace the marks of the previous frame.
 */
export interface DemoStep {
  fen?: string;
  move?: string;
  highlight?: Square[];
  /** A second highlight colour, e.g. a row and a column that cross. */
  highlightAlt?: Square[];
  arrows?: [Square, Square][];
  dots?: Square[];
  /** Show the legal-move dots of the piece on this square. */
  showMoves?: Square;
  /** Write the square names on these squares. */
  labels?: Square[];
  /** A few words under the board for this frame (same for every age; keep it short). */
  caption?: string;
  /** How long this frame stays, in ms (default 1200). */
  ms?: number;
}

export interface StarRule {
  /** Most moves (or mistakes, for tapSquares) that still earn 3 stars. */
  '3': number;
  /** Most moves (or mistakes) that still earn 2 stars. Anything more earns 1. */
  '2': number;
}

export interface Station {
  id: string;
  type: 'lesson' | 'minigame';
  /** Short title for the map and the top bar. */
  title: string;
  /** Emoji shown on the map node. */
  icon?: string;
  /** Placement + side to move. The side to move is the learner; the other side never moves. */
  fen: string;
  goal: Goal;
  stars: StarRule;
  /** Lesson: the explanation. Minigame: the task. */
  text: AgeText;
  /** Lesson only: the practice task after the demo. */
  task?: AgeText;
  /** Lesson only: the animated demo. Starts from `demoFen` (or `fen`). */
  demo?: DemoStep[];
  demoFen?: string;
}

export interface Character {
  name: string;
  piece: PieceSymbol;
  /** Short opening line, shown on the first lesson and on the map. */
  hello: AgeText;
}

export interface World {
  id: string;
  /** Part of the path: 1 = the board, 2 = the pieces. */
  part: number;
  title: string;
  icon: string;
  character?: Character;
  stations: Station[];
}
