// One real-position task on a chess.js board: a station round, a puzzle or a placement question.
// Handles the learner's moves, the other side's replies, feedback, hints, and (for guided games)
// the coach and undo. The parent shows the task text and the result card.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Chess, type Move, type PieceSymbol, type Square } from 'chess.js';
import { Board, type BoardMarks, type LastMove } from './Board';
import { Feedback, type Message, type Tone } from './Speak';
import { playSound } from '../audio/sound';
import { chessPosition, checkedKingSquare, PIECE_NAME } from '../chess/rules';
import { engineFor } from '../engine/engine';
import { kidMove } from '../engine/kid';
import { hashString, seededRng, testSeed } from '../engine/random';
import { usesStockfish } from '../engine/levels';
import { coachMove, judgeMove } from '../learning/coach';
import { illegalReason } from '../learning/feedback';
import { parseFen } from '../learning/drill';
import {
  bestDefence,
  checkReason,
  defenderMove,
  kingEscapes,
  judge,
  playUci,
  sameMove,
  solution,
  squeezeMove,
  uciOf,
  type Verdict
} from '../learning/real';
import { gendered } from '../learning/text';
import type { EscapeWay, Goal } from '../learning/types';
import type { Profile } from '../profiles/profiles';

export interface RealTaskSpec {
  fen: string;
  goal: Goal;
  /** The other side's move that was just played: highlighted on the board. */
  lastMove?: string;
  /** A move the other side plays first, with animation (Lichess puzzles). */
  intro?: string;
}

export interface RealResult {
  mistakes: number;
  /** Learner moves played (in the final, successful attempt for playOut). */
  moves: number;
  hints: number;
}

interface Props {
  task: RealTaskSpec;
  profile: Profile;
  /** "practice": a wrong move is taken back and counted. "test": one try, then onFail. */
  mode?: 'practice' | 'test';
  /** Text after a wrong move (instead of the general one). Gendered tokens allowed. */
  wrongText?: string;
  /** Show the hint button. */
  allowHints?: boolean;
  onDone: (r: RealResult) => void;
  onFail?: () => void;
  /** Report mistakes as they happen (for the status chips). */
  onMistake?: (total: number) => void;
}


const WAY_NAME: Record<EscapeWay, string> = { move: 'בריחה 🏃', block: 'חסימה 🧱', capture: 'אכילה 😋' };
const WAY_DO: Record<EscapeWay, string> = { move: 'להזיז את המלך', block: 'לחסום', capture: 'לאכול את התוקף' };
const GOOD_WORDS = ['יפה!', 'נכון!', 'מצוין!', 'יש!', 'בדיוק!'];

const REPLY_MS = 650;
const UNDO_MS = 1100;

function rngFor(fen: string): () => number {
  const seed = testSeed();
  return seed === undefined ? Math.random : seededRng(seed ^ hashString(fen));
}

export function RealTask({ task, profile, mode = 'practice', wrongText, allowHints = true, onDone, onFail, onMistake }: Props) {
  const g = (t: string) => gendered(t, profile);
  const goal = task.goal;
  const line = goal.kind === 'findBestMove' ? goal.line : undefined;
  const learner = useMemo(() => {
    const c = new Chess(task.fen);
    if (task.intro) playUci(c, task.intro);
    return c.turn();
  }, [task]);

  const chess = useRef(new Chess(task.fen));
  const history = useRef<Move[]>([]);
  const [ply, setPly] = useState(0); // re-render after every change to chess.current
  const [lastMove, setLastMove] = useState<LastMove | null>(
    task.lastMove ? { from: task.lastMove.slice(0, 2) as Square, to: task.lastMove.slice(2, 4) as Square, animate: false, id: 0 } : null
  );
  const [busy, setBusy] = useState(!!task.intro);
  const [done, setDone] = useState(false);
  const [stuck, setStuck] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [mistakes, setMistakes] = useState(0);
  const [hints, setHints] = useState(0);
  const [learnerMoves, setLearnerMoves] = useState(0);
  const [hintMove, setHintMove] = useState<{ from: Square; to: Square } | null>(null);
  const [bad, setBad] = useState<Square[] | null>(null);
  const [dots, setDots] = useState<Square[] | null>(null);
  const [found, setFound] = useState<EscapeWay[]>([]);
  const [step, setStep] = useState(0); // index in `line` of the next learner move
  const [movesLeft, setMovesLeft] = useState(goal.kind === 'mateIn' ? goal.n : 0);
  const [canUndo, setCanUndo] = useState(false);
  const token = useRef(0);
  const timers = useRef<number[]>([]);
  const msgId = useRef(0);

  useEffect(() => () => timers.current.forEach((t) => clearTimeout(t)), []);

  function later(fn: () => void, ms: number) {
    timers.current.push(window.setTimeout(fn, ms));
  }

  function notify(text: string, tone: Tone = 'info') {
    msgId.current += 1;
    setMessage({ text: g(text), tone, id: msgId.current });
  }

  function refresh(m: Move | null, animate = true) {
    if (m) setLastMove({ from: m.from, to: m.to, animate, id: history.current.length + 1000 * token.current });
    setPly((n) => n + 1);
  }

  function addMistake() {
    setMistakes((n) => {
      onMistake?.(n + 1);
      return n + 1;
    });
  }

  // The opening move of a Lichess puzzle.
  useEffect(() => {
    if (!task.intro) return;
    later(() => {
      const m = playUci(chess.current, task.intro!);
      if (m) history.current.push(m);
      refresh(m);
      setBusy(false);
    }, 700);
  }, []);

  function finish(extra: Partial<RealResult> = {}) {
    setDone(true);
    setBusy(false);
    setHintMove(null);
    later(() => onDone({ mistakes, moves: learnerMoves + 1, hints, ...extra }), 450);
  }

  function restart() {
    timers.current.forEach((t) => clearTimeout(t));
    timers.current = [];
    token.current += 1;
    chess.current = new Chess(task.fen);
    history.current = [];
    if (task.intro) {
      const m = playUci(chess.current, task.intro);
      if (m) history.current.push(m);
    }
    setLastMove(null);
    setBusy(false);
    setStuck(false);
    setDone(false);
    setMessage(null);
    setHintMove(null);
    setBad(null);
    setDots(null);
    setFound([]);
    setStep(0);
    setMovesLeft(goal.kind === 'mateIn' ? goal.n : 0);
    setLearnerMoves(0);
    setCanUndo(false);
    setPly((n) => n + 1);
  }

  /** Show a wrong move for a moment, then take it back. */
  function showWrong(uci: string, text: string, extraMarks?: { dots?: Square[] }) {
    const m = playUci(chess.current, uci);
    refresh(m, false);
    setBusy(true);
    setBad([uci.slice(2, 4) as Square]);
    if (extraMarks?.dots) setDots(extraMarks.dots);
    later(() => playSound('wrong'), 160);
    notify(text, 'bad');
    if (mode === 'test') {
      later(() => onFail?.(), UNDO_MS);
      return;
    }
    addMistake();
    const t = token.current;
    later(() => {
      if (t !== token.current) return;
      chess.current.undo();
      const prev = history.current.at(-1);
      setLastMove(prev ? { from: prev.from, to: prev.to, animate: false, id: -history.current.length } : null);
      setBad(null);
      setDots(null);
      setBusy(false);
      setPly((n) => n + 1);
    }, UNDO_MS);
  }

  function wrongMessage(v: Extract<Verdict, { ok: false }>): string {
    switch (v.reason) {
      case 'stalemate':
        return 'זה פט! למלך השחור אין מסע, אבל הוא לא בשח – וזה תיקו. {נסה|נסי} מסע אחר.';
      case 'checkNotMate':
        return 'שח, אבל לא מט: למלך יש עוד לאן לברוח (הנקודות).';
      case 'notMate':
        return 'זה לא מט. {חפש|חפשי} שח שאין ממנו יציאה.';
      case 'noForcedMate':
        return 'אחרי המסע הזה היריב יכול להינצל. {נסה|נסי} מסע אחר.';
      case 'wrongWay': {
        const ways = (goal.kind === 'escapeCheck' && goal.ways) || [];
        return `יצאת מהשח, אבל ב${WAY_NAME[v.way!].split(' ')[0]}. הפעם צריך ${ways.map((w) => WAY_DO[w]).join(' או ')}.`;
      }
      case 'sameWay':
        return 'את הדרך הזו כבר מצאת! {חפש|חפשי} דרך אחרת.';
      case 'stillInDanger':
        return `ה${v.piece ? PIECE_NAME[v.piece] : 'כלי'} עדיין בסכנה. {נסה|נסי} שוב.`;
      case 'hangs':
        return `אחרי המסע הזה ה${v.piece ? PIECE_NAME[v.piece] : 'כלי'} ב-${v.square} יכול להיאכל.`;
      case 'notCheck':
        return wrongText ?? 'זה לא שח. {נסה|נסי} שוב.';
      default:
        return wrongText ?? 'לא זה. {נסה|נסי} שוב!';
    }
  }

  // ----- The other side -----

  async function opponentMove(): Promise<Move | null> {
    const c = chess.current;
    if (goal.kind === 'mateIn') return bestDefence(c, Math.max(1, movesLeft - 1));
    if (goal.kind === 'playOut') {
      if (goal.opponent === 'defender') return defenderMove(c);
      const level = goal.opponent;
      let uci: string;
      if (usesStockfish(level)) {
        try {
          uci = await engineFor(level).bestMove(c.fen(), level);
        } catch {
          uci = kidMove(c.fen(), 2, rngFor(c.fen()));
        }
      } else {
        uci = kidMove(c.fen(), level, rngFor(c.fen()));
      }
      return playUci(new Chess(c.fen()), uci) ? (c.moves({ verbose: true }).find((m) => uciOf(m) === uci) ?? null) : null;
    }
    return null;
  }

  function replyThen(after: () => void) {
    setBusy(true);
    const t = token.current;
    later(async () => {
      if (t !== token.current) return;
      const m = await opponentMove();
      if (t !== token.current || !m) return;
      chess.current.move(m);
      history.current.push(m);
      refresh(m);
      setBusy(false);
      after();
    }, REPLY_MS);
  }

  function scriptedReply(uci: string, after: () => void) {
    setBusy(true);
    const t = token.current;
    later(() => {
      if (t !== token.current) return;
      const m = playUci(chess.current, uci);
      if (m) history.current.push(m);
      refresh(m);
      setBusy(false);
      after();
    }, REPLY_MS);
  }

  // ----- The learner's move -----

  function handleMove(from: Square, to: Square, promotion?: PieceSymbol) {
    if (busy || done || stuck) return;
    const c = chess.current;
    const legal = c.moves({ square: from, verbose: true }).filter((m) => m.to === to);
    if (!legal.length) return;
    const uci = from + to + (legal[0].promotion ? (promotion ?? 'q') : '');
    setHintMove(null);
    setDots(null);

    // Scripted lines (findBestMove with `line`, Lichess puzzles).
    if (line) {
      const expected = line[step];
      const last = step === line.length - 1;
      const probe = new Chess(c.fen());
      playUci(probe, uci);
      const ok = sameMove(uci, expected) || (last && probe.isCheckmate()) || (step === 0 && !!goal.kind && goal.kind === 'findBestMove' && !!goal.moves?.some((w) => sameMove(uci, w)));
      if (!ok) {
        const v = judge(c, { kind: 'findBestMove', moves: [expected] }, uci);
        showWrong(uci, v.ok ? (wrongText ?? 'לא זה. {נסה|נסי} שוב!') : wrongMessage(v));
        return;
      }
      const m = playUci(c, uci)!;
      history.current.push(m);
      refresh(m, false);
      setLearnerMoves((n) => n + 1);
      if (last) {
        notify('✓ ' + GOOD_WORDS[step % GOOD_WORDS.length], 'good');
        finish({ moves: learnerMoves + 1 });
        return;
      }
      notify('✓ ' + GOOD_WORDS[step % GOOD_WORDS.length], 'good');
      scriptedReply(line[step + 1], () => setStep(step + 2));
      return;
    }

    // Guided games and endgames.
    if (goal.kind === 'playOut') {
      const before = new Chess(c.fen());
      const m = c.move({ from, to, promotion: uci[4] });
      const note = goal.coach ? judgeMove(before, m, history.current) : null;
      history.current.push(m);
      refresh(m, false);
      const n = learnerMoves + 1;
      setLearnerMoves(n);
      if (note?.tone === 'bad') addMistake();
      if (note?.text) notify(note.text, note.tone === 'ok' ? 'info' : note.tone);
      else setMessage(null);
      setCanUndo(true);
      if (c.isCheckmate()) {
        notify('מט! ניצחת! 🏆', 'good');
        finish({ moves: n, mistakes: mistakes + (note?.tone === 'bad' ? 1 : 0) });
        return;
      }
      if (c.isGameOver()) {
        setStuck(true);
        notify(c.isStalemate() ? 'פט! למלך השחור אין מסע והוא לא בשח – תיקו. {נסה|נסי} שוב.' : 'המשחק נגמר בתיקו. {נסה|נסי} שוב.', 'bad');
        return;
      }
      if (goal.until !== 'mate' && n >= goal.until) {
        finish({ moves: n, mistakes: mistakes + (note?.tone === 'bad' ? 1 : 0) });
        return;
      }
      if (goal.opponent === 'defender' && c.isInsufficientMaterial()) {
        setStuck(true);
        notify('לא נשארו מספיק כלים כדי לתת מט. {לחץ|לחצי} על "מההתחלה".', 'bad');
        return;
      }
      replyThen(() => {
        const cc = chess.current;
        if (cc.isCheckmate()) {
          setStuck(true);
          notify('אוי, היריב נתן מט. {נסה|נסי} שוב!', 'bad');
        } else if (cc.isGameOver()) {
          setStuck(true);
          notify(cc.isInsufficientMaterial() ? 'לא נשארו מספיק כלים כדי לתת מט – תיקו. {נסה|נסי} שוב.' : 'תיקו. {נסה|נסי} שוב.', 'bad');
        } else if (goal.opponent === 'defender' && history.current.at(-1)?.captured) {
          notify('היריב אכל כלי! {שמור|שמרי} על הכלים שלך.', 'bad');
        }
      });
      return;
    }

    // Single-move goals and mate in n.
    const v = judge(c, goal, uci, { found, movesLeft });
    if (!v.ok) {
      let extra: { dots?: Square[] } | undefined;
      if (v.reason === 'checkNotMate') {
        const probe = new Chess(c.fen());
        playUci(probe, uci);
        extra = { dots: kingEscapes(probe) };
      }
      showWrong(uci, wrongMessage(v), extra);
      return;
    }
    const m = playUci(c, uci)!;
    history.current.push(m);
    refresh(m, false);
    setLearnerMoves((n) => n + 1);

    if (goal.kind === 'escapeCheck' && goal.findAll && v.way) {
      const now = [...found, v.way];
      setFound(now);
      if (!v.done) {
        notify(`✓ ${WAY_NAME[v.way]}! עכשיו {מצא|מצאי} עוד דרך.`, 'good');
        setBusy(true);
        const t = token.current;
        later(() => {
          if (t !== token.current) return;
          chess.current = new Chess(task.fen);
          history.current = [];
          setLastMove(null);
          setBusy(false);
          setPly((n) => n + 1);
        }, 1300);
        return;
      }
      notify(`✓ ${WAY_NAME[v.way]}! מצאת את כל הדרכים.`, 'good');
      finish();
      return;
    }
    if (v.done) {
      notify(chess.current.isCheckmate() ? 'מט! 🏆' : '✓ ' + GOOD_WORDS[learnerMoves % GOOD_WORDS.length], 'good');
      finish();
      return;
    }
    // mateIn with moves left: the other side defends.
    notify('✓ ' + GOOD_WORDS[learnerMoves % GOOD_WORDS.length] + ' עכשיו היריב…', 'good');
    replyThen(() => setMovesLeft((n) => n - 1));
  }

  function handleIllegal(from: Square, to: Square) {
    if (busy || done) return;
    const c = chess.current;
    const reason = checkReason(c, from, to);
    if (reason) {
      notify(reason, 'bad');
      const [k] = c.inCheck() ? c.findPiece({ type: 'k', color: c.turn() }) : [];
      if (k) {
        setBad([k]);
        later(() => setBad(null), 900);
      }
      return;
    }
    const parsed = parseFen(c.fen());
    if (parsed && parsed.pieces.get(from)?.color === c.turn()) notify(illegalReason(parsed.pieces, from, to), 'bad');
  }

  /** The move the hint button would show (UCI-like: from + to + promotion). */
  function hintMoveNow(): { from: Square; to: Square; promotion?: string } | null {
    const c = chess.current;
    if (line) {
      const u = line[step];
      return { from: u.slice(0, 2) as Square, to: u.slice(2, 4) as Square, promotion: u[4] };
    }
    if (goal.kind === 'playOut') return goal.coach ? coachMove(new Chess(c.fen()), history.current) : squeezeMove(new Chess(c.fen()));
    return solution(c, goal, { found, movesLeft });
  }

  // Test hook (only with ?seed=, like the game screen): the position and the hint move.
  useEffect(() => {
    if (testSeed() === undefined) return;
    (window as unknown as { __chessitTask?: unknown }).__chessitTask = {
      fen: () => chess.current.fen(),
      busy: () => busy,
      hint: () => {
        const m = hintMoveNow();
        return m ? m.from + m.to + (m.promotion ?? '') : null;
      }
    };
  });

  function hint() {
    if (busy || done) return;
    const m = hintMoveNow();
    if (!m) return;
    setHintMove({ from: m.from, to: m.to });
    setHints((h) => h + 1);
    notify('💡 {עקוב|עקבי} אחרי החץ', 'info');
  }

  function undo() {
    if (goal.kind !== 'playOut' || done) return;
    token.current += 1;
    timers.current.forEach((t) => clearTimeout(t));
    timers.current = [];
    // Take back the opponent's reply (if it came) and the learner's move.
    const c = chess.current;
    if (history.current.length && c.turn() === learner) {
      c.undo();
      history.current.pop();
    }
    if (history.current.length && c.turn() !== learner) {
      c.undo();
      history.current.pop();
      setLearnerMoves((n) => Math.max(0, n - 1));
    }
    const prev = history.current.at(-1);
    setLastMove(prev ? { from: prev.from, to: prev.to, animate: false, id: -history.current.length - 1 } : null);
    setBusy(false);
    setStuck(false);
    setMessage(null);
    setHintMove(null);
    setCanUndo(history.current.length > 0);
    setPly((n) => n + 1);
  }

  // ----- Rendering -----

  const c = chess.current;
  void ply;
  const marks: BoardMarks = {};
  if (hintMove) {
    marks.arrows = [[hintMove.from, hintMove.to]];
    marks.hint = [hintMove.from];
  }
  if (bad) marks.bad = bad;
  if (dots) marks.dots = dots;
  const thinking = busy && !done && history.current.length > 0 && c.turn() !== learner;
  const status = done
    ? null
    : thinking
      ? 'היריב חושב…'
      : c.inCheck() && c.turn() === learner
        ? g('המלך שלך בשח!')
        : null;

  return (
    <div class="real-task">
      <Board
        position={chessPosition(c)}
        orientation={learner}
        interactive={!busy && !done && !stuck && c.turn() === learner}
        showHints
        lastMove={lastMove}
        checkSquare={checkedKingSquare(c)}
        marks={marks}
        onMove={handleMove}
        onIllegal={handleIllegal}
      />
      <Feedback message={message} idle={status ? <span class="feedback-how">{status}</span> : undefined} />
      {mode === 'practice' && (
        <div class="row drill-actions">
          {allowHints && (
            <button class="btn btn-secondary" onClick={hint} disabled={busy || done || stuck || !!hintMove}>
              💡 רמז
            </button>
          )}
          {goal.kind === 'playOut' && (
            <button class="btn btn-secondary" onClick={undo} disabled={done || !canUndo || history.current.length === 0}>
              ↶ בטל מסע
            </button>
          )}
          <button class={`btn ${stuck ? 'btn-primary' : 'btn-secondary'}`} onClick={restart} disabled={done}>
            ↺ מההתחלה
          </button>
        </div>
      )}
    </div>
  );
}
