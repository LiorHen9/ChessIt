import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js';
import { Board, type LastMove } from '../components/Board';
import { PlayerBar } from '../components/PlayerBar';
import { Confetti } from '../components/Confetti';
import {
  capturedBy,
  checkedKingSquare,
  chessPosition,
  COLOR_NAME,
  END_REASON_TEXT,
  materialBalance,
  other,
  outcomeOf,
  type Outcome
} from '../chess/rules';
import {
  byGender,
  computerProfile,
  COMPUTER_ID,
  declineLevelOffer,
  recordComputerResult,
  recordGameResult,
  setEngineLevel,
  type GameResult,
  type LevelOffer,
  type Profile,
  type Progress
} from '../profiles/profiles';
import { clearSavedGame, saveGame, type ComputerOpponent, type GameOptions } from '../game/savedGame';
import { DEFAULT_POSITION } from '../chess/handicap';
import { engineFor, stockfishEngine } from '../engine/engine';
import { levelInfo, usesStockfish } from '../engine/levels';
import { testSeed } from '../engine/random';

export interface GameConfig {
  white: Profile;
  black: Profile;
  options: GameOptions;
  moves: string[];
  startedAt: number;
  /** Where the game starts; the normal position unless pieces were removed. */
  startFen: string;
  /** Set when one side is the computer. */
  computer?: ComputerOpponent;
}

/** What the summary screen needs after a game against the computer. */
export interface FinishedGame {
  startFen: string;
  moves: string[];
  human: Color;
  profile: Profile;
  level: number;
  outcome: Outcome;
  /** For "play again" from the summary. */
  rematch: GameConfig;
}

interface Props {
  config: GameConfig;
  onExit: () => void;
  onRematch: (config: GameConfig) => void;
  onSummary?: (game: FinishedGame) => void;
  onProgress?: (p: Progress) => void;
}

/** Even an instant answer waits this long, so the computer's move is easy to follow. */
const MIN_THINK_MS = 700;

function replay(startFen: string, moves: string[]): Chess {
  let chess: Chess;
  try {
    chess = new Chess(startFen);
  } catch {
    chess = new Chess(DEFAULT_POSITION);
  }
  for (const lan of moves) {
    try {
      chess.move({ from: lan.slice(0, 2), to: lan.slice(2, 4), promotion: lan[4] });
    } catch {
      break; // a corrupt saved move: keep the game up to that point
    }
  }
  return chess;
}

function lastMoveOf(chess: Chess): LastMove | null {
  const h = chess.history({ verbose: true });
  const m = h[h.length - 1];
  return m ? { from: m.from, to: m.to, animate: false, id: h.length } : null;
}

type EngineState = 'ready' | 'loading' | 'failed';

export function GameScreen({ config, onExit, onRematch, onSummary, onProgress }: Props) {
  const chessRef = useRef<Chess | null>(null);
  if (!chessRef.current) chessRef.current = replay(config.startFen, config.moves);
  const chess = chessRef.current;

  const comp = config.computer;
  const human: Color | null = comp ? other(comp.color) : null;
  const [level, setLevel] = useState(comp?.level ?? 1);
  const [engineState, setEngineState] = useState<EngineState>(() =>
    comp && usesStockfish(comp.level) && !stockfishEngine().isReady ? 'loading' : 'ready'
  );
  const [retry, setRetry] = useState(0);
  const [offer, setOffer] = useState<LevelOffer>(null);
  const [offerAnswer, setOfferAnswer] = useState<'accepted' | 'declined' | null>(null);
  /** Bumped to cancel a computer move that is still on its way (undo, leaving). */
  const tokenRef = useRef(0);

  const [, setVersion] = useState(0);
  const rerender = () => setVersion((v) => v + 1);
  const [lastMove, setLastMove] = useState<LastMove | null>(() => lastMoveOf(chess));
  const [flipped, setFlipped] = useState(false);
  const [resigned, setResigned] = useState<Color | null>(null);
  const [confirmResign, setConfirmResign] = useState(false);

  const history = chess.history({ verbose: true });
  const outcome: Outcome | null = resigned ? { reason: 'resign', winner: other(resigned) } : outcomeOf(chess);
  const turn = chess.turn();
  const players: Record<Color, Profile> = comp
    ? comp.color === 'w'
      ? { w: computerProfile(level), b: config.black }
      : { w: config.white, b: computerProfile(level) }
    : { w: config.white, b: config.black };
  const me = human ? players[human] : null;
  const info = levelInfo(level);
  const computerTurn = !!comp && !outcome && turn === comp.color;
  const showThinking = computerTurn && engineState !== 'failed';

  // Computer games: the player's colour at the bottom, no automatic turning.
  const baseOrientation: Color = human ?? (config.options.rotate && !outcome ? turn : 'w');
  const orientation: Color = flipped ? other(baseOrientation) : baseOrientation;
  const bottom = orientation;
  const top = other(orientation);

  const captured = useMemo(() => capturedBy(history), [history.length]);
  const balance = materialBalance(captured);

  // Tests (?seed=) can read the game.
  useEffect(() => {
    if (testSeed() === undefined) return;
    const w = window as unknown as Record<string, unknown>;
    w.__chessit = { fen: () => chess.fen(), Chess };
    return () => {
      delete w.__chessit;
    };
  }, []);

  // Leaving the screen cancels a computer move in flight.
  useEffect(
    () => () => {
      tokenRef.current++;
    },
    []
  );

  // Wake the engine (Stockfish loads its files the first time).
  useEffect(() => {
    if (!comp) return;
    let alive = true;
    if (usesStockfish(level) && !stockfishEngine().isReady) setEngineState('loading');
    engineFor(level)
      .init()
      .then(
        () => alive && setEngineState('ready'),
        () => alive && setEngineState('failed')
      );
    return () => {
      alive = false;
    };
  }, [level, retry]);

  // The computer's turn.
  useEffect(() => {
    if (!comp || outcome || turn !== comp.color || engineState !== 'ready') return;
    const token = ++tokenRef.current;
    const started = Date.now();
    engineFor(level)
      .bestMove(chess.fen(), level)
      .then(async (uci) => {
        const wait = MIN_THINK_MS - (Date.now() - started);
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        if (token !== tokenRef.current) return;
        applyMove(uci.slice(0, 2) as Square, uci.slice(2, 4) as Square, uci[4] as PieceSymbol | undefined, false);
      })
      .catch(() => {
        if (token !== tokenRef.current) return;
        setEngineState('failed');
      });
  }, [history.length, !!outcome, engineState, level]);

  function persist(lv = level) {
    const moves = chess.history({ verbose: true }).map((m) => m.lan);
    void saveGame({
      whiteId: comp?.color === 'w' ? COMPUTER_ID : config.white.id,
      blackId: comp?.color === 'b' ? COMPUTER_ID : config.black.id,
      moves,
      options: config.options,
      startedAt: config.startedAt,
      startFen: config.startFen,
      computer: comp ? { level: lv, color: comp.color } : undefined
    });
  }

  function finish(result: Outcome) {
    void clearSavedGame();
    if (comp && me) {
      const r: GameResult = result.winner === null ? 'draw' : result.winner === human ? 'win' : 'loss';
      void recordComputerResult(me.id, level, r).then(({ progress, offer }) => {
        setOffer(offer);
        onProgress?.(progress);
      });
      return;
    }
    const w = config.white.id;
    const b = config.black.id;
    if (result.winner === null) {
      void recordGameResult(w, 'draw');
      if (b !== w) void recordGameResult(b, 'draw');
    } else {
      const winner = result.winner === 'w' ? w : b;
      const loser = result.winner === 'w' ? b : w;
      void recordGameResult(winner, 'win');
      if (loser !== winner) void recordGameResult(loser, 'loss');
    }
  }

  function applyMove(from: Square, to: Square, promotion: PieceSymbol | undefined, dragged: boolean) {
    try {
      chess.move({ from, to, promotion });
    } catch {
      return;
    }
    setLastMove({ from, to, animate: !dragged, id: chess.history().length });
    if (!comp) setFlipped(false);
    const result = outcomeOf(chess);
    if (result) finish(result);
    else persist();
    rerender();
  }

  function handleMove(from: Square, to: Square, promotion?: PieceSymbol, dragged?: boolean) {
    if (computerTurn) return;
    applyMove(from, to, promotion, !!dragged);
  }

  // Against the computer, "undo" takes back the player's last move and the computer's answer.
  // While the computer is still thinking, it takes back only the player's move.
  const undoPlies = comp ? (turn === comp.color ? 1 : 2) : 1;
  const canUndo = !outcome && history.length >= undoPlies;

  function undo() {
    if (!canUndo) return;
    tokenRef.current++;
    for (let i = 0; i < undoPlies; i++) chess.undo();
    setLastMove(lastMoveOf(chess));
    persist();
    rerender();
  }

  function resign() {
    setConfirmResign(false);
    tokenRef.current++;
    const loser = human ?? turn;
    setResigned(loser);
    finish({ reason: 'resign', winner: other(loser) });
  }

  function switchToLevel2() {
    setLevel(2);
    setEngineState('ready');
    persist(2);
  }

  async function answerOffer(accept: boolean) {
    if (!offer || !me) return;
    setOfferAnswer(accept ? 'accepted' : 'declined');
    const p = accept ? await setEngineLevel(me.id, offer.level, true) : await declineLevelOffer(me.id);
    onProgress?.(p);
  }

  function rematchConfig(): GameConfig {
    if (comp && human && me) {
      const lv = offerAnswer === 'accepted' && offer ? offer.level : level;
      const cpu = computerProfile(lv);
      return {
        white: human === 'w' ? me : cpu,
        black: human === 'b' ? me : cpu,
        options: config.options,
        moves: [],
        startedAt: Date.now(),
        startFen: config.startFen,
        computer: { level: lv, color: comp.color }
      };
    }
    return {
      white: config.black,
      black: config.white,
      options: config.options,
      moves: [],
      startedAt: Date.now(),
      startFen: config.startFen
    };
  }

  function rematch() {
    onRematch(rematchConfig());
  }

  function openSummary() {
    if (!outcome || !human || !me) return;
    onSummary?.({
      startFen: config.startFen,
      moves: chess.history({ verbose: true }).map((m) => m.lan),
      human,
      profile: me,
      level,
      outcome,
      rematch: rematchConfig()
    });
  }

  let status: string;
  if (outcome) {
    if (comp && me) {
      status =
        outcome.winner === null ? 'תיקו!' : outcome.winner === human ? `ניצחת, ${me.name}!` : `${info.name} ניצח הפעם`;
    } else {
      status = outcome.winner ? `הניצחון של ${players[outcome.winner].name}!` : 'תיקו!';
    }
  } else if (comp && me) {
    if (computerTurn && engineState === 'failed') status = `${info.name} לא זמין כרגע`;
    else if (computerTurn && engineState === 'loading') status = 'המחשב מתכונן…';
    else if (computerTurn) status = `${info.name} חושב…`;
    else status = `תורך, ${me.name}`;
  } else {
    status = `התור של ${players[turn].name} (${COLOR_NAME[turn]})`;
  }

  const humanWon = !!comp && !!outcome && outcome.winner === human;
  const barBadge = (c: Color) => (comp && c === comp.color ? (engineState === 'loading' ? 'מתכונן…' : 'חושב…') : 'תורך');

  return (
    <main class="screen game">
      <header class="topbar">
        <button class="btn btn-ghost btn-back" onClick={onExit} aria-label="חזרה לבית">
          → בית
        </button>
        <span class="topbar-title">{comp ? 'נגד המחשב' : 'משחק לשניים'}</span>
        <button class="btn btn-ghost" onClick={() => setFlipped((f) => !f)} aria-label="סובב את הלוח">
          ⟲ סיבוב
        </button>
      </header>

      <PlayerBar
        profile={players[top]}
        color={top}
        captured={captured[top]}
        advantage={top === 'w' ? balance : -balance}
        active={!outcome && turn === top && !(computerTurn && engineState === 'failed')}
        badge={barBadge(top)}
      />

      <Board
        position={chessPosition(chess)}
        orientation={orientation}
        interactive={!outcome && !computerTurn}
        showHints={config.options.hints}
        lastMove={lastMove}
        checkSquare={outcome ? null : checkedKingSquare(chess)}
        onMove={handleMove}
      />

      <PlayerBar
        profile={players[bottom]}
        color={bottom}
        captured={captured[bottom]}
        advantage={bottom === 'w' ? balance : -balance}
        active={!outcome && turn === bottom && !(computerTurn && engineState === 'failed')}
        badge={barBadge(bottom)}
      />

      <p
        class={`game-status ${!outcome && chess.inCheck() ? 'is-check' : ''} ${showThinking ? 'is-thinking' : ''}`}
        aria-live="polite"
      >
        {!outcome && chess.inCheck() && <strong>שח! </strong>}
        {showThinking && (
          <span class="think-icon" aria-hidden="true">
            {engineState === 'loading' ? '⏳' : info.icon}
          </span>
        )}
        {status}
        {showThinking && <span class="think-dots" aria-hidden="true" />}
      </p>

      {humanWon && <Confetti />}

      {outcome ? (
        <section class="card result" aria-live="polite">
          <div class="result-emoji" aria-hidden="true">
            {outcome.winner === null ? '🤝' : comp && outcome.winner !== human ? info.icon : '🏆'}
          </div>
          <p class="result-title">{status}</p>
          <p class="result-reason">
            {outcome.reason === 'resign' && resigned
              ? `${players[resigned].name} ${byGender(players[resigned], 'נכנע', 'נכנעה')}.`
              : END_REASON_TEXT[outcome.reason]}
          </p>

          {offer && me && (
            <div class={`level-offer offer-${offer.direction}`} data-offer={offer.direction}>
              {offerAnswer === null ? (
                <>
                  <p class="level-offer-text">
                    {offer.direction === 'up'
                      ? `שלושה ניצחונות ברצף! רוצה לעלות לרמה ${offer.level}?`
                      : `היה קשה בפעמים האחרונות. רוצה לנסות את רמה ${offer.level}?`}
                  </p>
                  <p class="level-offer-who">
                    {levelInfo(offer.level).icon} {levelInfo(offer.level).name}
                  </p>
                  <div class="row">
                    <button class="btn btn-primary" onClick={() => void answerOffer(true)}>
                      {offer.direction === 'up' ? 'כן, לעלות!' : 'כן, לרמה קלה יותר'}
                    </button>
                    <button class="btn btn-secondary" onClick={() => void answerOffer(false)}>
                      להישאר ברמה <bdi dir="ltr">{level}</bdi>
                    </button>
                  </div>
                </>
              ) : (
                <p class="level-offer-text">
                  {offerAnswer === 'accepted'
                    ? `מעכשיו: רמה ${offer.level}, ${levelInfo(offer.level).name} ${levelInfo(offer.level).icon}`
                    : `נשארים ברמה ${level}.`}
                </p>
              )}
            </div>
          )}

          <div class="row">
            {comp && onSummary && (
              <button class="btn btn-primary btn-summary" onClick={openSummary}>
                🔍 מה למדנו מהמשחק?
              </button>
            )}
            <button class={`btn ${comp ? 'btn-secondary' : 'btn-primary'}`} onClick={rematch}>
              {comp ? 'משחק חוזר' : 'משחק חוזר (מחליפים צבעים)'}
            </button>
            <button class="btn btn-secondary" onClick={onExit}>
              לבית
            </button>
          </div>
        </section>
      ) : engineState === 'failed' ? (
        <section class="card engine-failed" role="alert">
          <p class="engine-failed-title">😴 {info.name} לא הצליח להתעורר</p>
          <p class="engine-failed-text">
            ברמות 3 ומעלה המחשב צריך חיבור לאינטרנט בפעם הראשונה. אפשר להמשיך את אותו המשחק מול רמה 2.
          </p>
          <div class="row">
            <button class="btn btn-primary" onClick={switchToLevel2}>
              {levelInfo(2).icon} להמשיך מול רמה 2
            </button>
            <button class="btn btn-secondary" onClick={() => setRetry((r) => r + 1)}>
              לנסות שוב
            </button>
          </div>
        </section>
      ) : confirmResign ? (
        <section class="card confirm">
          <p>{(me ?? players[turn]).name}, בטוח שרוצים להיכנע?</p>
          <div class="row">
            <button class="btn btn-danger" onClick={resign}>
              כן, להיכנע
            </button>
            <button class="btn btn-secondary" onClick={() => setConfirmResign(false)}>
              להמשיך לשחק
            </button>
          </div>
        </section>
      ) : (
        <div class="row game-actions">
          <button class="btn btn-secondary" onClick={undo} disabled={!canUndo}>
            ↶ בטל מסע
          </button>
          <button class="btn btn-secondary" onClick={() => setConfirmResign(true)} disabled={history.length === 0}>
            🏳️ כניעה
          </button>
        </div>
      )}
    </main>
  );
}
