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
  | { kind: 'tapSquares'; squares: Square[]; ordered?: boolean; area?: Square[] }
  // ----- Real positions (chess.js: two kings, check and every rule; see learning/real.ts) -----
  /** Checkmate within `n` learner moves. The other side answers with its best defence. */
  | { kind: 'mateIn'; n: number }
  /**
   * The learner is in check and must get out. `ways` limits how (default: any way).
   * With `findAll`, every way in `ways` must be found, one after another (the board resets).
   */
  | { kind: 'escapeCheck'; ways?: EscapeWay[]; findAll?: boolean }
  /** The learner piece on `square` is in danger: make it safe in one move. */
  | { kind: 'defend'; square: Square }
  /**
   * One right move (any of `moves`, in UCI: "e2e4", "e7e8q"), or any checking move with
   * `accept: "check"`. With `line`, a scripted sequence: learner, reply, learner, ...
   * (like a Lichess puzzle without the first move); a final mating move is always accepted.
   */
  | { kind: 'findBestMove'; moves?: string[]; accept?: 'check'; line?: string[] }
  /**
   * Play on against an opponent: `"defender"` (a lone king that runs to the middle and
   * grabs loose pieces) or a computer level 1–8. `until: "mate"` = win by checkmate;
   * a number = play that many moves. `coach` comments on every move (opening principles,
   * loose pieces) and counts weak moves as mistakes.
   */
  | { kind: 'playOut'; opponent: 'defender' | number; until: 'mate' | number; coach?: boolean };

export type GoalKind = Goal['kind'];

export type EscapeWay = 'move' | 'block' | 'capture';

/** Goals that run on chess.js with real positions. The others run on learning/drill.ts. */
export const REAL_GOALS: GoalKind[] = ['mateIn', 'escapeCheck', 'defend', 'findBestMove', 'playOut'];

export function isRealGoal(goal: Goal): boolean {
  return REAL_GOALS.includes(goal.kind);
}

/** An extra position in the same station (real goals only), played after the first one. */
export interface Round {
  fen: string;
  goal: Goal;
  /** The move the other side just played, highlighted on the board ("d7d5"). */
  lastMove?: string;
  /** Replaces the station task for this round. */
  text?: AgeText;
}

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
  /** Real goals: the move the other side just played, highlighted ("d7d5"). */
  lastMove?: string;
  /** Real goals: more positions in the same station. Mistakes add up over all rounds. */
  more?: Round[];
  /** Real goals: what to say after a wrong move (instead of the general "not this move"). */
  wrong?: AgeText;
}

export interface Character {
  name: string;
  piece: PieceSymbol;
  /** Short opening line, shown on the first lesson and on the map. */
  hello: AgeText;
}

export interface World {
  id: string;
  /** Part of the path: 1 = the board, 2 = the pieces, 3–8 = one world each. */
  part: number;
  title: string;
  icon: string;
  character?: Character;
  stations: Station[];
  /** Lichess puzzles offered after the last station (a bonus node; it never locks anything). */
  puzzles?: { theme: string; count: number };
}
