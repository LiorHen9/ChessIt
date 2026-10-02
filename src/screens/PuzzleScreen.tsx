// Solving puzzles from the Lichess database: one puzzle at a time, from a theme, the daily
// puzzle, a puzzle due for review, or a short set at the end of a world.
import { useEffect, useState } from 'preact/hooks';
import { Confetti } from '../components/Confetti';
import { RealTask, type RealResult } from '../components/RealTask';
import { mistakesLine, TopBar } from '../components/StationParts';
import { COLOR_NAME } from '../chess/rules';
import { dailyPuzzle, loadTheme, localDay, themeInfo, type Puzzle } from '../content/puzzles/index';
import { recordPuzzle } from '../learning/progress';
import { byGender, type Profile, type Progress } from '../profiles/profiles';
import { Chess } from 'chess.js';

export type PuzzleMode =
  | { kind: 'theme'; theme: string }
  | { kind: 'daily' }
  | { kind: 'one'; theme: string; id: string }
  | { kind: 'set'; theme: string; count: number; title: string };

interface Props {
  profile: Profile;
  progress: Progress | null;
  mode: PuzzleMode;
  onExit: () => void;
  exitLabel?: string;
  onProgress: (p: Progress) => void;
}

/** Where a profile starts in a theme sorted by rating: kids at the easiest, adults a bit higher. */
const START_RATING: Record<Profile['ageGroup'], number> = { kids5_7: 0, kids8_12: 0, teenAdult: 1000 };

/** The next unsolved puzzle of a theme for this profile (wraps around when all are solved). */
export function nextPuzzle(list: Puzzle[], theme: string, progress: Progress | null, profile: Profile, skip: string[] = []): Puzzle | null {
  const solved = (p: Puzzle) => !!progress?.puzzles[`${theme}:${p.id}`] || skip.includes(p.id);
  const start = Math.max(0, list.findIndex((p) => p.rating >= START_RATING[profile.ageGroup]));
  const order = [...list.slice(start), ...list.slice(0, start)];
  return order.find((p) => !solved(p)) ?? order.find((p) => !skip.includes(p.id)) ?? null;
}

export function PuzzleScreen({ profile, progress, mode, onExit, exitLabel, onProgress }: Props) {
  const [theme, setTheme] = useState(mode.kind === 'daily' ? '' : mode.theme);
  const [list, setList] = useState<Puzzle[] | null>(null);
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [error, setError] = useState(false);
  const [solvedHere, setSolvedHere] = useState<string[]>([]);
  const [result, setResult] = useState<RealResult | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [prog, setProg] = useState<Progress | null>(progress);

  useEffect(() => {
    void (async () => {
      try {
        if (mode.kind === 'daily') {
          const d = await dailyPuzzle();
          setTheme(d.theme);
          setPuzzle(d.puzzle);
          return;
        }
        const file = await loadTheme(mode.theme);
        setList(file.puzzles);
        if (mode.kind === 'one') setPuzzle(file.puzzles.find((p) => p.id === mode.id) ?? null);
        else setPuzzle(nextPuzzle(file.puzzles, mode.theme, prog, profile));
      } catch {
        setError(true);
      }
    })();
  }, []);

  const info = themeInfo(theme);
  const title = mode.kind === 'daily' ? 'החידה היומית' : mode.kind === 'set' ? mode.title : (info?.title ?? 'חידות');

  function solved(r: RealResult) {
    if (!puzzle) return;
    setResult(r);
    setSolvedHere((s) => [...s, puzzle.id]);
    const clean = r.mistakes === 0 && r.hints === 0;
    void recordPuzzle(profile.id, theme, puzzle.id, clean, mode.kind === 'daily' ? localDay() : undefined).then((p) => {
      setProg(p);
      onProgress(p);
    });
  }

  function next() {
    if (!list) return;
    setResult(null);
    setPuzzle(nextPuzzle(list, theme, prog, profile, [...solvedHere]));
    setAttempt((a) => a + 1);
  }

  if (error) {
    return (
      <main class="screen puzzle">
        <TopBar title={title} onExit={onExit} back="→ חזרה" backLabel="חזרה" />
        <p class="card">לא הצלחנו לטעון את החידות. {byGender(profile, 'נסה', 'נסי', 'נסו')} שוב כשיש אינטרנט.</p>
      </main>
    );
  }
  if (!puzzle) {
    return (
      <main class="screen puzzle" aria-busy="true">
        <TopBar title={title} onExit={onExit} back="→ חזרה" backLabel="חזרה" />
        <p class="feedback">טוען חידה…</p>
      </main>
    );
  }

  const start = new Chess(puzzle.fen);
  const side = start.turn() === 'w' ? 'b' : 'w'; // the learner plays after the opponent's first move
  const learnerMoves = puzzle.moves.split(' ').length / 2;
  const setDone = mode.kind === 'set' && solvedHere.length >= mode.count;
  const isMate = theme.startsWith('mate') || theme.endsWith('Mate');

  return (
    <main class="screen puzzle station" style="--w:var(--world-tactics)">
      <TopBar title={title} onExit={onExit} back="→ חזרה" backLabel="חזרה" />
      <section class="card task">
        <span class="char-avatar" aria-hidden="true">
          {info?.icon ?? '🧩'}
        </span>
        <div class="task-body">
          <p class="task-text">
            {byGender(profile, 'אתה משחק', 'את משחקת', 'משחקים')} ב<strong>{COLOR_NAME[side]}</strong>.{' '}
            {isMate
              ? learnerMoves === 1
                ? byGender(profile, 'תן מט במסע אחד!', 'תני מט במסע אחד!', 'מט במסע אחד!')
                : `מט ב-${learnerMoves} מסעים!`
              : byGender(profile, 'מצא את המסע הכי טוב.', 'מצאי את המסע הכי טוב.', 'מוצאים את המסע הכי טוב.')}
          </p>
          <p class="puzzle-meta">
            {info ? `${info.icon} ${info.title}` : ''} · דירוג <bdi dir="ltr">{puzzle.rating}</bdi>
            {mode.kind === 'set' && (
              <>
                {' '}
                · <bdi dir="ltr">{Math.min(solvedHere.length + (result ? 0 : 1), mode.count)}/{mode.count}</bdi>
              </>
            )}
          </p>
        </div>
      </section>

      <RealTask
        key={`${puzzle.id}-${attempt}`}
        task={{ fen: puzzle.fen, intro: puzzle.moves.split(' ')[0], goal: { kind: 'findBestMove', line: puzzle.moves.split(' ').slice(1) } }}
        profile={profile}
        onDone={solved}
      />

      {result && (
        <div class="done-backdrop">
          <section class="card done" role="dialog" aria-label="החידה נפתרה">
            <Confetti />
            <div class="done-emoji" aria-hidden="true">
              {result.mistakes === 0 && result.hints === 0 ? '🏆' : '🧩'}
            </div>
            <h2 class="done-title">{setDone ? 'סיימת את כל החידות!' : 'פתרת!'}</h2>
            <p class="done-line">{mistakesLine(result.mistakes)}</p>
            {(result.mistakes > 0 || result.hints > 0) && <p class="done-tip">החידה תחזור בעוד יום בחזרה, כדי לתרגל אותה שוב.</p>}
            <p class="done-tip puzzle-credit">החידה מתוך מאגר החידות הפתוח של Lichess.</p>
            <div class="done-actions">
              {(mode.kind === 'theme' || (mode.kind === 'set' && !setDone)) && list && (
                <button class="btn btn-primary btn-big" onClick={next}>
                  לחידה הבאה ←
                </button>
              )}
              <div class="row">
                <button class="btn btn-secondary" onClick={() => { setResult(null); setAttempt((a) => a + 1); }}>
                  ↺ שוב
                </button>
                <button class="btn btn-secondary" onClick={onExit}>
                  {exitLabel ?? 'סיום'}
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
