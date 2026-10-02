import { useMemo, useRef, useState } from 'preact/hooks';
import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js';
import { Board, type LastMove } from '../components/Board';
import { PlayerBar } from '../components/PlayerBar';
import {
  capturedBy,
  checkedKingSquare,
  COLOR_NAME,
  END_REASON_TEXT,
  materialBalance,
  other,
  outcomeOf,
  type Outcome
} from '../chess/rules';
import { byGender, recordGameResult, type Profile } from '../profiles/profiles';
import { clearSavedGame, saveGame, type GameOptions } from '../game/savedGame';

export interface GameConfig {
  white: Profile;
  black: Profile;
  options: GameOptions;
  moves: string[];
  startedAt: number;
}

interface Props {
  config: GameConfig;
  onExit: () => void;
  onRematch: (config: GameConfig) => void;
}

function replay(moves: string[]): Chess {
  const chess = new Chess();
  for (const lan of moves) {
    try {
      chess.move({ from: lan.slice(0, 2), to: lan.slice(2, 4), promotion: lan[4] });
    } catch {
      break; // a corrupt saved move: keep the game up to that point
    }
  }
  return chess;
}

export function GameScreen({ config, onExit, onRematch }: Props) {
  const chessRef = useRef<Chess | null>(null);
  if (!chessRef.current) chessRef.current = replay(config.moves);
  const chess = chessRef.current;

  const [, setVersion] = useState(0);
  const rerender = () => setVersion((v) => v + 1);
  const [lastMove, setLastMove] = useState<LastMove | null>(() => {
    const h = chess.history({ verbose: true });
    const m = h[h.length - 1];
    return m ? { from: m.from, to: m.to, animate: false, id: h.length } : null;
  });
  const [flipped, setFlipped] = useState(false);
  const [resigned, setResigned] = useState<Color | null>(null);
  const [confirmResign, setConfirmResign] = useState(false);

  const history = chess.history({ verbose: true });
  const outcome: Outcome | null = resigned ? { reason: 'resign', winner: other(resigned) } : outcomeOf(chess);
  const turn = chess.turn();
  const players: Record<Color, Profile> = { w: config.white, b: config.black };

  const baseOrientation: Color = config.options.rotate && !outcome ? turn : 'w';
  const orientation: Color = flipped ? other(baseOrientation) : baseOrientation;
  const bottom = orientation;
  const top = other(orientation);

  const captured = useMemo(() => capturedBy(history), [history.length]);
  const balance = materialBalance(captured);

  function persist() {
    const moves = chess.history({ verbose: true }).map((m) => m.lan);
    void saveGame({
      whiteId: config.white.id,
      blackId: config.black.id,
      moves,
      options: config.options,
      startedAt: config.startedAt
    });
  }

  function finish(result: Outcome) {
    void clearSavedGame();
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

  function handleMove(from: Square, to: Square, promotion?: PieceSymbol, dragged?: boolean) {
    try {
      chess.move({ from, to, promotion });
    } catch {
      return;
    }
    setLastMove({ from, to, animate: !dragged, id: chess.history().length });
    setFlipped(false);
    const result = outcomeOf(chess);
    if (result) finish(result);
    else persist();
    rerender();
  }

  function undo() {
    if (outcome || history.length === 0) return;
    chess.undo();
    const h = chess.history({ verbose: true });
    const m = h[h.length - 1];
    setLastMove(m ? { from: m.from, to: m.to, animate: false, id: h.length } : null);
    persist();
    rerender();
  }

  function resign() {
    setConfirmResign(false);
    setResigned(turn);
    finish({ reason: 'resign', winner: other(turn) });
  }

  function rematch() {
    onRematch({
      white: config.black,
      black: config.white,
      options: config.options,
      moves: [],
      startedAt: Date.now()
    });
  }

  let status: string;
  if (outcome) {
    status = outcome.winner ? `הניצחון של ${players[outcome.winner].name}!` : 'תיקו!';
  } else {
    status = `התור של ${players[turn].name} (${COLOR_NAME[turn]})`;
  }

  return (
    <main class="screen game">
      <header class="topbar">
        <button class="btn btn-ghost btn-back" onClick={onExit} aria-label="חזרה לבית">
          → בית
        </button>
        <span class="topbar-title">משחק לשניים</span>
        <button class="btn btn-ghost" onClick={() => setFlipped((f) => !f)} aria-label="סובב את הלוח">
          ⟲ סיבוב
        </button>
      </header>

      <PlayerBar
        profile={players[top]}
        color={top}
        captured={captured[top]}
        advantage={top === 'w' ? balance : -balance}
        active={!outcome && turn === top}
      />

      <Board
        chess={chess}
        orientation={orientation}
        interactive={!outcome}
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
        active={!outcome && turn === bottom}
      />

      <p class={`game-status ${!outcome && chess.inCheck() ? 'is-check' : ''}`} aria-live="polite">
        {!outcome && chess.inCheck() && <strong>שח! </strong>}
        {status}
      </p>

      {outcome ? (
        <section class="card result" aria-live="polite">
          <div class="result-emoji" aria-hidden="true">
            {outcome.winner ? '🏆' : '🤝'}
          </div>
          <p class="result-title">{status}</p>
          <p class="result-reason">
            {outcome.reason === 'resign' && resigned
              ? `${players[resigned].name} ${byGender(players[resigned], 'נכנע', 'נכנעה')}.`
              : END_REASON_TEXT[outcome.reason]}
          </p>
          <div class="row">
            <button class="btn btn-primary" onClick={rematch}>
              משחק חוזר (מחליפים צבעים)
            </button>
            <button class="btn btn-secondary" onClick={onExit}>
              לבית
            </button>
          </div>
        </section>
      ) : confirmResign ? (
        <section class="card confirm">
          <p>{players[turn].name}, בטוח שרוצים להיכנע?</p>
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
          <button class="btn btn-secondary" onClick={undo} disabled={history.length === 0}>
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
