import { useEffect, useState } from 'preact/hooks';
import { Chess } from 'chess.js';
import { Board, type BoardMarks } from '../components/Board';
import { RichText } from '../components/RichText';
import { chessPosition, END_REASON_TEXT } from '../chess/rules';
import { stockfishEngine } from '../engine/engine';
import { levelInfo } from '../engine/levels';
import {
  explainGood,
  explainMistake,
  LTR_END,
  LTR_START,
  reviewGame,
  type Explanation,
  type GameReview,
  type ReviewedMove
} from '../game/analysis';
import type { FinishedGame } from './GameScreen';

interface Props {
  game: FinishedGame;
  onExit: () => void;
  onRematch: () => void;
}

type Phase = 'analyzing' | 'done' | 'unavailable' | 'tooShort';

/** Fewer player moves than this: nothing worth summarising. */
const MIN_PLAYER_MOVES = 3;

/** Text from analysis.ts: LTR runs become <bdi dir="ltr">, the rest goes through RichText. */
function Words({ text }: { text: string }) {
  const parts = text.split(new RegExp(`${LTR_START}(.*?)${LTR_END}`, 'g'));
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <bdi key={i} dir="ltr" class="san">
            {p}
          </bdi>
        ) : (
          <RichText key={i} text={p} />
        )
      )}
    </>
  );
}

function ReviewCard({
  kind,
  r,
  expl,
  game
}: {
  kind: 'good' | 'mistake';
  r: ReviewedMove;
  expl: Explanation;
  game: FinishedGame;
}) {
  const marks: BoardMarks =
    kind === 'good'
      ? { arrowsGood: [[r.move.from, r.move.to]] }
      : {
          arrowsBad: [[r.move.from, r.move.to]],
          arrowsGood: r.best && r.best.lan !== r.move.lan ? [[r.best.from, r.best.to]] : undefined
        };
  const moveNo = Math.floor(new Chess(r.fenBefore).moveNumber());
  return (
    <article class={`card review review-${kind}`} data-review={kind}>
      <header class="review-head">
        <h2 class="review-title">
          <span aria-hidden="true">{kind === 'good' ? '⭐' : '💡'}</span> {expl.title}
        </h2>
        <span class="review-move">
          מסע <bdi dir="ltr">{moveNo}</bdi>
        </span>
      </header>
      <div class="review-board">
        <Board
          position={chessPosition(new Chess(r.fenBefore))}
          orientation={game.human}
          interactive={false}
          showHints={false}
          lastMove={null}
          onMove={() => undefined}
          marks={marks}
        />
      </div>
      <p class="review-text">
        <Words text={expl.text} />
      </p>
      {expl.detail && (
        <p class="review-detail">
          <Words text={expl.detail} />
        </p>
      )}
      {kind === 'mistake' && marks.arrowsGood && (
        <p class="review-legend">
          <span class="legend-bad">אדום</span>: מה ששוחק · <span class="legend-good">ירוק</span>: מה שהיה עדיף
        </p>
      )}
    </article>
  );
}

export function GameSummary({ game, onExit, onRematch }: Props) {
  const firstToMove = new Chess(game.startFen).turn();
  const playerMoves = game.moves.filter((_, i) => (i % 2 === 0) === (firstToMove === game.human)).length;
  const [phase, setPhase] = useState<Phase>(playerMoves < MIN_PLAYER_MOVES ? 'tooShort' : 'analyzing');
  const [progress, setProgress] = useState({ done: 0, total: 1 });
  const [review, setReview] = useState<GameReview | null>(null);
  const age = game.profile.ageGroup;
  const info = levelInfo(game.level);

  useEffect(() => {
    if (phase !== 'analyzing') return;
    let alive = true;
    const sf = stockfishEngine();
    sf.init()
      .then(() =>
        reviewGame(game.startFen, game.moves, game.human, (fen) => sf.evaluate(fen), (done, total) => {
          if (alive) setProgress({ done, total });
        })
      )
      .then(
        (r) => {
          if (!alive) return;
          setReview(r);
          setPhase('done');
        },
        () => alive && setPhase('unavailable')
      );
    return () => {
      alive = false;
    };
  }, []);

  const o = game.outcome;
  const won = o.winner === game.human;
  const title = o.winner === null ? 'תיקו' : won ? `ניצחת את ${info.name}!` : `${info.name} ניצח הפעם`;
  const pct = Math.round((progress.done / Math.max(1, progress.total)) * 100);

  return (
    <main class="screen summary">
      <header class="topbar">
        <button class="btn btn-ghost btn-back" onClick={onExit}>
          → בית
        </button>
        <span class="topbar-title">סיכום המשחק</span>
        <span />
      </header>

      <section class="summary-head">
        <span class="summary-emoji" aria-hidden="true">
          {o.winner === null ? '🤝' : won ? '🏆' : info.icon}
        </span>
        <div>
          <p class="summary-title">{title}</p>
          <p class="summary-sub">
            {o.reason === 'resign' ? 'כניעה' : END_REASON_TEXT[o.reason]} · רמה <bdi dir="ltr">{game.level}</bdi> ({info.name})
          </p>
        </div>
      </section>

      {phase === 'analyzing' && (
        <section class="card analyzing" aria-live="polite">
          <p class="analyzing-text">🔍 המחשב עובר על המשחק…</p>
          <div class="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
            <span style={`width:${pct}%`} />
          </div>
          <p class="fineprint">
            <bdi dir="ltr">{progress.done}</bdi> מתוך <bdi dir="ltr">{progress.total}</bdi> עמדות
          </p>
        </section>
      )}

      {phase === 'tooShort' && (
        <section class="card summary-note">
          <p>המשחק היה קצר מדי בשביל סיכום. בפעם הבאה!</p>
        </section>
      )}

      {phase === 'unavailable' && (
        <section class="card summary-note" role="status">
          <p>😴 הפעם אין סיכום.</p>
          <p class="fineprint">בשביל הסיכום המחשב צריך חיבור לאינטרנט בפעם הראשונה. בפעם הבאה שיהיה אינטרנט, זה יעבוד.</p>
        </section>
      )}

      {phase === 'done' && review && (
        <>
          {review.good && <ReviewCard kind="good" r={review.good} expl={explainGood(review.good, review.goodIsFallback, age)} game={game} />}
          {review.mistake ? (
            <ReviewCard kind="mistake" r={review.mistake} expl={explainMistake(review.mistake, age)} game={game} />
          ) : (
            <section class="card review review-clean" data-review="clean">
              <p class="review-text">💪 לא היו טעויות גדולות במשחק הזה. כל הכבוד!</p>
            </section>
          )}
        </>
      )}

      <div class="row">
        <button class="btn btn-primary" onClick={onRematch}>
          משחק חוזר
        </button>
        <button class="btn btn-secondary" onClick={onExit}>
          לבית
        </button>
      </div>
    </main>
  );
}
