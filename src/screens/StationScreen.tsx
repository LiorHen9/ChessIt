import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { PieceSymbol, Square } from 'chess.js';
import { Board, type BoardMarks, type BoardPosition, type LastMove } from '../components/Board';
import { Confetti } from '../components/Confetti';
import { RichText } from '../components/RichText';
import { StarRow } from '../components/StarRow';
import { PIECE_GLYPH } from '../chess/rules';
import { findStation, WORLDS } from '../content/index';
import { demoFrames } from '../learning/demo';
import { movesFrom, sq as makeSquare, type DMove, type Pieces } from '../learning/drill';
import { illegalReason } from '../learning/feedback';
import { captureTargets, isDone, isLegal, solve, startState, step, type DrillState } from '../learning/goals';
import { isUnlocked, nextStationId, recordStation, starsFor, type Stars } from '../learning/progress';
import { gendered, say } from '../learning/text';
import type { Station, World } from '../learning/types';
import type { Profile, Progress } from '../profiles/profiles';

interface Props {
  profile: Profile;
  stationId: string;
  progress: Progress | null;
  onExit: () => void;
  onOpen: (stationId: string) => void;
  onProgress: (p: Progress) => void;
}

export function StationScreen(props: Props) {
  const found = findStation(props.stationId);
  if (!found) {
    return (
      <main class="screen">
        <p>התחנה לא נמצאה.</p>
        <button class="btn btn-primary" onClick={props.onExit}>
          למפה
        </button>
      </main>
    );
  }
  return <StationRun key={props.stationId} {...props} world={found.world} station={found.station} index={found.index} />;
}

/** The board shows drill pieces; only the learner's pieces can be picked up. */
function drillPosition(pieces: Pieces, learner: 'w' | 'b' | null): BoardPosition {
  return {
    get: (s) => pieces.get(s),
    canPick: (s) => learner !== null && pieces.get(s)?.color === learner,
    movesFrom: (s) =>
      learner !== null && pieces.get(s)?.color === learner
        ? movesFrom(pieces, s).map((m) => ({ to: m.to, captured: !!m.captured, promotion: m.promotion }))
        : []
  };
}

const GOAL_ICON: Record<Station['goal']['kind'], string> = {
  collectStars: '⭐',
  captureAll: '😋',
  reachSquare: '🚩',
  promote: '👑',
  tapSquares: '👆'
};

const GOOD_WORDS = ['יפה!', 'נכון!', 'מצוין!', 'יש!', 'בדיוק!'];

type Phase = 'intro' | 'play' | 'done';
type Tone = 'info' | 'good' | 'bad';

interface RunProps extends Props {
  world: World;
  station: Station;
  index: number;
}

function StationRun({ profile, progress, onExit, onOpen, onProgress, world, station, index }: RunProps) {
  const g = (text: string) => gendered(text, profile);
  const goal = station.goal;
  const isTap = goal.kind === 'tapSquares';
  const hasDemo = station.type === 'lesson' && !!station.demo?.length;

  const start = useMemo(() => startState(station.fen)!, [station]);
  const targets = useMemo(() => captureTargets(goal, start), [station]);
  const best = useMemo(() => (isTap ? 0 : (solve(goal, start, targets)?.length ?? 0)), [station]);

  const [phase, setPhase] = useState<Phase>(hasDemo ? 'intro' : 'play');
  const [state, setState] = useState<DrillState>(start);
  const [lastMove, setLastMove] = useState<LastMove | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [hints, setHints] = useState(0);
  const [hintMove, setHintMove] = useState<DMove | null>(null);
  const [hintSquare, setHintSquare] = useState<Square | null>(null);
  const [tapped, setTapped] = useState<Square[]>([]);
  const [mistakes, setMistakes] = useState(0);
  const [bad, setBad] = useState<Square | null>(null);
  const [burst, setBurst] = useState<{ sq: Square; id: number } | null>(null);
  const [message, setMessage] = useState<{ text: string; tone: Tone; id: number } | null>(null);
  const [stuck, setStuck] = useState(false);
  const [result, setResult] = useState<{ stars: Stars; count: number } | null>(null);
  const [savedProgress, setSavedProgress] = useState<Progress | null>(progress);
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach((t) => clearTimeout(t)), []);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [phase]);

  function later(fn: () => void, ms: number) {
    timers.current.push(window.setTimeout(fn, ms));
  }

  const msgId = useRef(0);
  function notify(text: string, tone: Tone = 'info') {
    msgId.current += 1;
    setMessage({ text, tone, id: msgId.current });
  }

  function finish(count: number) {
    const stars = starsFor(station, count, hints);
    setResult({ stars, count });
    later(() => setPhase('done'), 550);
    void recordStation(profile.id, station.id, stars).then((p) => {
      setSavedProgress(p);
      onProgress(p);
    });
  }

  function reset() {
    timers.current.forEach((t) => clearTimeout(t));
    timers.current = [];
    setState(start);
    setLastMove(null);
    setAttempt((a) => a + 1);
    setHints(0);
    setHintMove(null);
    setHintSquare(null);
    setTapped([]);
    setMistakes(0);
    setBad(null);
    setBurst(null);
    setMessage(null);
    setStuck(false);
    setResult(null);
  }

  function handleMove(from: Square, to: Square, promotion?: PieceSymbol, dragged?: boolean) {
    if (result) return;
    const move = isLegal(state, from, to);
    if (!move) return;
    const next = step(goal, state, move, promotion ?? 'q');
    setState(next);
    setLastMove({ from, to, animate: !dragged, id: next.moves });
    setHintMove(null);

    if (next.collected.length > state.collected.length) {
      setBurst({ sq: to, id: next.moves });
      notify('⭐ ' + GOOD_WORDS[next.moves % GOOD_WORDS.length], 'good');
    } else if (move.captured) {
      notify('😋 ' + 'אכלת!', 'good');
    } else if (move.promotion) {
      notify('👑 ' + 'הכתרת!', 'good');
    } else {
      setMessage(null);
    }

    if (isDone(goal, next, targets)) {
      finish(next.moves);
    } else if (!solve(goal, next, targets)) {
      setStuck(true);
      notify(g('מכאן אי אפשר להצליח. {לחץ|לחצי} על "מההתחלה" ו{נסה|נסי} שוב.'), 'bad');
    }
  }

  function handleIllegal(from: Square, to: Square) {
    if (result) return;
    notify(illegalReason(state.pieces, from, to) + ' ' + g('הנקודות מראות לאן אפשר.'), 'bad');
  }

  function handleTap(sq: Square) {
    if (goal.kind !== 'tapSquares' || result) return;
    if (!goal.ordered && tapped.includes(sq)) return;
    const expected = goal.ordered ? goal.squares[tapped.length] : null;
    const ok = goal.ordered ? sq === expected : goal.squares.includes(sq);
    if (ok) {
      const now = [...tapped, sq];
      setTapped(now);
      setHintSquare(null);
      notify('✓ ' + GOOD_WORDS[now.length % GOOD_WORDS.length], 'good');
      if (now.length === goal.squares.length) finish(mistakes);
    } else {
      setMistakes((m) => m + 1);
      setBad(sq);
      later(() => setBad(null), 700);
      notify(
        expected ? `זו ${sq}. ${g('{חפש|חפשי}')} את ${expected}.` : `זו ${sq} – לא היא. ${g('{נסה|נסי}')} שוב!`,
        'bad'
      );
    }
  }

  function hint() {
    if (goal.kind === 'tapSquares') {
      const next = goal.ordered ? goal.squares[tapped.length] : goal.squares.find((s) => !tapped.includes(s));
      if (!next) return;
      setHintSquare(next);
    } else {
      const path = solve(goal, state, targets);
      if (!path || path.length === 0) {
        notify(g('מכאן אי אפשר להצליח. {לחץ|לחצי} על "מההתחלה".'), 'bad');
        return;
      }
      setHintMove(path[0]);
    }
    setHints((h) => h + 1);
    notify(isTap ? '💡 המשבצת המהבהבת' : g('💡 {עקוב|עקבי} אחרי החץ'), 'info');
  }

  // ----- Rendering -----

  const character = world.character;
  const avatar = (
    <span class="char-avatar" aria-hidden="true">
      {character ? PIECE_GLYPH[character.piece] + '︎' : world.icon}
    </span>
  );

  if (phase === 'intro' && hasDemo) {
    return (
      <main class="screen station" style={`--w:var(--world-${world.id})`}>
        <TopBar title={station.title} onExit={onExit} />
        <section class="card speech">
          {avatar}
          <div class="speech-body">
            {character && index === 0 && (
              <p class="speech-hello">
                <strong>{character.name}:</strong> <RichText text={say(character.hello, profile)} />
              </p>
            )}
            <p class="speech-text">
              <RichText text={say(station.text, profile)} />
            </p>
          </div>
        </section>
        <LessonDemo station={station} />
        <button class="btn btn-primary btn-big go-btn" onClick={() => setPhase('play')}>
          עכשיו תורך! ✋
        </button>
      </main>
    );
  }

  const taskText = say(station.type === 'lesson' && station.task ? station.task : station.text, profile);
  const learnerSquares = [...state.pieces.entries()].filter(([, p]) => p.color === state.learner).map(([s]) => s);

  const marks: BoardMarks = { burst: burst ?? undefined };
  if (goal.kind === 'collectStars') marks.stars = goal.squares.filter((s) => !state.collected.includes(s));
  if (goal.kind === 'captureAll')
    marks.rings = targets.filter((s) => {
      const p = state.pieces.get(s);
      return !!p && p.color !== state.learner;
    });
  if (goal.kind === 'reachSquare') marks.flag = goal.square;
  if (goal.kind === 'promote') {
    const lastRank = state.learner === 'w' ? 8 : 1;
    marks.area = [0, 1, 2, 3, 4, 5, 6, 7].map((f) => makeSquare(f, lastRank)!);
  }
  if (goal.kind === 'tapSquares') {
    marks.area = goal.area;
    marks.good = tapped;
    marks.bad = bad ? [bad] : undefined;
    if (hintSquare) marks.hint = [hintSquare];
  }
  if (hintMove) {
    marks.arrows = [[hintMove.from, hintMove.to]];
    marks.hint = [hintMove.from];
  }
  if (!isTap && state.moves === 0 && !hintMove) marks.highlight = learnerSquares;

  let progressChip = '';
  let total = 0;
  let doneCount = 0;
  if (goal.kind === 'collectStars') {
    total = goal.squares.length;
    doneCount = state.collected.length;
    progressChip = `⭐ ${doneCount}/${total}`;
  } else if (goal.kind === 'captureAll') {
    total = targets.length;
    doneCount = total - (marks.rings?.length ?? 0);
    progressChip = `😋 ${doneCount}/${total}`;
  } else if (goal.kind === 'tapSquares') {
    total = goal.squares.length;
    doneCount = tapped.length;
    progressChip = `👆 ${doneCount}/${total}`;
  }

  const ordered = goal.kind === 'tapSquares' && goal.ordered ? goal.squares[tapped.length] : null;
  const next = nextStationId(WORLDS, station.id);
  const nextFound = next ? findStation(next) : null;
  const nextIsNewWorld = !!nextFound && nextFound.world.id !== world.id;
  const nextOpen = !!next && isUnlocked(WORLDS, savedProgress, next);

  return (
    <main class="screen station" style={`--w:var(--world-${world.id})`}>
      <TopBar title={station.title} onExit={onExit} />

      <section class="card task">
        {avatar}
        <div class="task-body">
          <p class="task-text">
            <span class="task-icon" aria-hidden="true">
              {GOAL_ICON[goal.kind]}
            </span>{' '}
            <RichText text={taskText} />
          </p>
          {ordered && (
            <p class="task-target" aria-live="polite">
              <bdi dir="ltr">{ordered}</bdi>
            </p>
          )}
        </div>
      </section>

      <div class="drill-status">
        <span class="chip">{isTap ? `טעויות: ${mistakes}` : `מסעים: ${state.moves}`}</span>
        {progressChip && (
          <span class="chip chip-progress" dir="ltr">
            {progressChip}
          </span>
        )}
        <span class="chip chip-goal">
          <span aria-hidden="true">★★★</span>{' '}
          {isTap ? 'בלי טעויות' : <>עד <bdi dir="ltr">{station.stars['3']}</bdi> מסעים</>}
        </span>
      </div>

      <Board
        key={attempt}
        position={drillPosition(state.pieces, isTap || result ? null : state.learner)}
        orientation="w"
        interactive={!result}
        showHints={!isTap}
        lastMove={lastMove}
        marks={marks}
        onMove={handleMove}
        onSquareTap={isTap ? handleTap : undefined}
        onIllegal={handleIllegal}
      />

      <p class={`feedback ${message ? `is-${message.tone}` : ''}`} aria-live="polite" key={message?.id}>
        {message ? (
          <RichText text={message.text} />
        ) : !isTap && state.moves === 0 ? (
          <span class="feedback-how">{g('👆 {גע|געי} בכלי, ואז במשבצת שאליה הוא ילך')}</span>
        ) : (
          '\u00a0'
        )}
      </p>

      <div class="row drill-actions">
        <button class="btn btn-secondary" onClick={hint} disabled={!!result || stuck || !!hintMove || !!hintSquare}>
          💡 רמז
        </button>
        <button class={`btn ${stuck ? 'btn-primary' : 'btn-secondary'}`} onClick={reset} disabled={!!result}>
          ↺ מההתחלה
        </button>
      </div>
      {hasDemo && (
        <button class="btn btn-ghost demo-again" onClick={() => setPhase('intro')}>
          👀 לראות שוב את ההסבר
        </button>
      )}

      {phase === 'done' && result && (
        <div class="done-backdrop">
          <section class="card done" role="dialog" aria-label="סיום התחנה">
            <Confetti />
            <div class="done-emoji" aria-hidden="true">
              {result.stars === 3 ? '🏆' : '🎉'}
            </div>
            <StarRow stars={result.stars} animate size="lg" />
            <h2 class="done-title">{result.stars === 3 ? 'מושלם!' : 'כל הכבוד!'}</h2>
            <p class="done-line">
              {isTap ? (
                result.count === 0 ? (
                  'בלי אף טעות!'
                ) : (
                  result.count === 1 ? (
                    'עם טעות אחת.'
                  ) : (
                    <>
                      עם <bdi dir="ltr">{result.count}</bdi> טעויות.
                    </>
                  )
                )
              ) : (
                <>
                  עשית את זה ב-<bdi dir="ltr">{result.count}</bdi> {result.count === 1 ? 'מסע' : 'מסעים'}.
                </>
              )}
            </p>
            {result.stars < 3 && (
              <p class="done-tip">
                {hints > 0
                  ? 'רמז עולה כוכב. בלי רמזים אפשר לקבל שלושה!'
                  : isTap
                    ? 'בלי טעויות מקבלים שלושה כוכבים.'
                    : <>אפשר גם ב-<bdi dir="ltr">{best}</bdi> מסעים. רוצה לנסות לשלושה כוכבים?</>}
              </p>
            )}
            {nextIsNewWorld && <p class="done-world">🎊 סיימת את עולם {world.title}!</p>}
            {!next && <p class="done-world">🎊 סיימת את כל התחנות במסלול!</p>}
            <div class="done-actions">
              {next && nextOpen && (
                <button class="btn btn-primary btn-big" onClick={() => onOpen(next)}>
                  {nextIsNewWorld ? `לעולם הבא: ${nextFound!.world.title}` : 'לתחנה הבאה'} ←
                </button>
              )}
              <div class="row">
                <button class="btn btn-secondary" onClick={() => { reset(); setPhase('play'); }}>
                  ↺ שוב
                </button>
                <button class="btn btn-secondary" onClick={onExit}>
                  🗺️ למפה
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

function TopBar({ title, onExit }: { title: string; onExit: () => void }) {
  return (
    <header class="topbar">
      <button class="btn btn-ghost btn-back" onClick={onExit} aria-label="חזרה למפה">
        → מפה
      </button>
      <span class="topbar-title">{title}</span>
      <span />
    </header>
  );
}

/** Plays the lesson demo frame by frame, with a replay button. */
function LessonDemo({ station }: { station: Station }) {
  const frames = useMemo(() => demoFrames(station), [station]);
  const [i, setI] = useState(0);
  const [run, setRun] = useState(0);

  useEffect(() => {
    if (i >= frames.length - 1) return;
    const t = window.setTimeout(() => setI(i + 1), frames[i].ms);
    return () => clearTimeout(t);
  }, [i, run]);

  const f = frames[i];
  const ended = i >= frames.length - 1;
  return (
    <section class="demo" aria-label="הדגמה">
      <Board
        key={run}
        position={drillPosition(f.pieces, null)}
        orientation="w"
        interactive={false}
        showHints={false}
        lastMove={f.move ? { ...f.move, animate: true, id: i + 1 } : null}
        marks={f.marks}
        onMove={() => {}}
      />
      <div class="demo-bar">
        <p class="demo-caption" aria-live="polite">
          {f.caption ? <RichText text={f.caption} /> : ' '}
        </p>
        <div class="demo-steps" aria-hidden="true">
          {frames.map((_, n) => (
            <span key={n} class={n <= i ? 'is-on' : ''} />
          ))}
        </div>
        <button
          class="btn btn-secondary demo-replay"
          onClick={() => {
            setI(0);
            setRun((r) => r + 1);
          }}
          disabled={!ended}
        >
          ▶ שוב
        </button>
      </div>
    </section>
  );
}
