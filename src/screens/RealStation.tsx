// A station on real positions (worlds 3–8): lesson intro with demo, then one or more rounds
// played with RealTask, then the result card.
import { useEffect, useRef, useState } from 'preact/hooks';
import { RichText } from '../components/RichText';
import { RealTask, type RealResult } from '../components/RealTask';
import { DoneDialog, LessonDemo, mistakesLine, TopBar } from '../components/StationParts';
import { PIECE_GLYPH } from '../chess/rules';
import { findStation, WORLDS } from '../content/index';
import { isUnlocked, nextStationId, recordStation, starsFor, type Stars } from '../learning/progress';
import { say } from '../learning/text';
import type { Goal, Round, Station, World } from '../learning/types';
import type { Progress } from '../profiles/profiles';
import type { StationProps } from './StationScreen';

interface Props extends StationProps {
  world: World;
  station: Station;
  index: number;
}

const GOAL_ICON: Partial<Record<Goal['kind'], string>> = {
  mateIn: '👑',
  escapeCheck: '🛡️',
  defend: '🛟',
  findBestMove: '🎯',
  playOut: '🏁'
};

/** Stars count mistakes, except endgames without a coach, where they count moves. */
export function countsMoves(goal: Goal): boolean {
  return goal.kind === 'playOut' && !goal.coach && goal.until === 'mate';
}

type Phase = 'intro' | 'play' | 'done';

export function RealStation({ profile, progress, onExit, onOpen, onProgress, world, station, index, fromReview }: Props) {
  const rounds: Round[] = [{ fen: station.fen, goal: station.goal, lastMove: station.lastMove }, ...(station.more ?? [])];
  const hasDemo = station.type === 'lesson' && !!station.demo?.length;
  const [phase, setPhase] = useState<Phase>(hasDemo ? 'intro' : 'play');
  const [round, setRound] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [mistakesSoFar, setMistakesSoFar] = useState(0);
  const [live, setLive] = useState(0); // mistakes in the current round
  const total = useRef<RealResult>({ mistakes: 0, moves: 0, hints: 0 });
  const [result, setResult] = useState<{ stars: Stars; count: number; hints: number } | null>(null);
  const [savedProgress, setSavedProgress] = useState<Progress | null>(progress);
  const [between, setBetween] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [phase]);

  const byMoves = countsMoves(station.goal);

  function onRoundDone(r: RealResult) {
    const t = total.current;
    total.current = { mistakes: t.mistakes + r.mistakes, moves: t.moves + r.moves, hints: t.hints + r.hints };
    if (round + 1 < rounds.length) {
      setMistakesSoFar(total.current.mistakes);
      setLive(0);
      setBetween(true);
      window.setTimeout(() => {
        setBetween(false);
        setRound(round + 1);
      }, 700);
      return;
    }
    const sum = total.current;
    const count = byMoves ? sum.moves : sum.mistakes;
    const stars = starsFor(station, count, sum.hints);
    setResult({ stars, count, hints: sum.hints });
    setPhase('done');
    void recordStation(profile.id, station.id, stars).then((p) => {
      setSavedProgress(p);
      onProgress(p);
    });
  }

  function again() {
    total.current = { mistakes: 0, moves: 0, hints: 0 };
    setMistakesSoFar(0);
    setLive(0);
    setRound(0);
    setResult(null);
    setAttempt((a) => a + 1);
    setPhase('play');
  }

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

  const r = rounds[Math.min(round, rounds.length - 1)];
  const taskText = say(r.text ?? (station.type === 'lesson' && station.task ? station.task : station.text), profile);
  const mistakes = mistakesSoFar + live;
  const next = nextStationId(WORLDS, station.id);
  const nextFound = next ? findStation(next) : null;
  const nextIsNewWorld = !!nextFound && nextFound.world.id !== world.id;
  const nextOpen = !!next && isUnlocked(WORLDS, savedProgress, next);
  const g = station.goal;

  return (
    <main class="screen station" style={`--w:var(--world-${world.id})`}>
      <TopBar title={station.title} onExit={onExit} />

      <section class="card task">
        {avatar}
        <div class="task-body">
          <p class="task-text">
            <span class="task-icon" aria-hidden="true">
              {GOAL_ICON[r.goal.kind] ?? '🎯'}
            </span>{' '}
            <RichText text={taskText} />
          </p>
        </div>
      </section>

      <div class="drill-status">
        {rounds.length > 1 && (
          <span class="chip chip-progress">
            לוח <bdi dir="ltr">{round + 1}/{rounds.length}</bdi>
          </span>
        )}
        {!byMoves && <span class="chip">טעויות: {mistakes}</span>}
        <span class="chip chip-goal">
          <span aria-hidden="true">★★★</span>{' '}
          {byMoves ? (
            <>
              עד <bdi dir="ltr">{station.stars['3']}</bdi> מסעים
            </>
          ) : station.stars['3'] === 0 ? (
            'בלי טעויות'
          ) : (
            <>
              עד <bdi dir="ltr">{station.stars['3']}</bdi> טעויות
            </>
          )}
        </span>
      </div>

      {!between && (
        <RealTask
          key={`${attempt}-${round}`}
          task={{ fen: r.fen, goal: r.goal, lastMove: r.lastMove }}
          profile={profile}
          wrongText={station.wrong ? say(station.wrong, profile) : undefined}
          onDone={onRoundDone}
          onMistake={setLive}
        />
      )}
      {between && <p class="feedback is-good round-next">✓ ללוח הבא…</p>}

      {hasDemo && (
        <button class="btn btn-ghost demo-again" onClick={() => setPhase('intro')}>
          👀 לראות שוב את ההסבר
        </button>
      )}

      {phase === 'done' && result && (
        <DoneDialog
          stars={result.stars}
          line={
            byMoves ? (
              <>
                ניצחת ב-<bdi dir="ltr">{result.count}</bdi> מסעים.
              </>
            ) : g.kind === 'playOut' && g.coach ? (
              result.count === 0 ? (
                'בלי אף מסע חלש!'
              ) : (
                <>
                  מסעים חלשים: <bdi dir="ltr">{result.count}</bdi>.
                </>
              )
            ) : (
              mistakesLine(result.count)
            )
          }
          tip={
            result.stars < 3 &&
            (result.hints > 0
              ? 'רמז עולה כוכב. בלי רמזים אפשר לקבל שלושה!'
              : byMoves
                ? 'אפשר לנצח גם במסעים פחות. רוצה לנסות לשלושה כוכבים?'
                : 'בלי טעויות מקבלים שלושה כוכבים. נחזור לזה בקרוב בחזרה.')
          }
          extra={
            fromReview ? null : nextIsNewWorld ? (
              <p class="done-world">🎊 סיימת את עולם {world.title}!</p>
            ) : !next ? (
              <p class="done-world">🎊 סיימת את כל המסלול! עכשיו אפשר לשחק נגד המחשב.</p>
            ) : null
          }
          next={
            !fromReview && next && nextOpen
              ? { label: nextIsNewWorld ? `לעולם הבא: ${nextFound!.world.title}` : 'לתחנה הבאה', onClick: () => onOpen(next) }
              : null
          }
          onAgain={again}
          onExit={onExit}
          exitLabel={fromReview ? '🔁 לחזרה' : undefined}
        />
      )}
    </main>
  );
}
