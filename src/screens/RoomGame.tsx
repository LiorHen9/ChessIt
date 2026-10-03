// A game in a room: the same board and player bars as a game on one phone, but the move list lives
// in the room (net/room.ts) and every phone shows the board from its own side.
// Not a branch of GameScreen: there the phone's own chess.js game is the truth (undo, the computer's
// turn, saving to `meta`); here the room's move list is, and the screen only follows it.
import type { Color, PieceSymbol, Square } from 'chess.js';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Board, type LastMove } from '../components/Board';
import { PlayerBar } from '../components/PlayerBar';
import { Confetti } from '../components/Confetti';
import { Feedback, useAutoSpeak, type Message } from '../components/Speak';
import { playSound } from '../audio/sound';
import {
  capturedBy,
  checkedKingSquare,
  chessPosition,
  END_REASON_TEXT,
  materialBalance,
  other,
  outcomeOf,
  type Outcome
} from '../chess/rules';
import { byGender, getProgress, recordGameResult, type Profile, type Progress } from '../profiles/profiles';
import { colorOf, replayMoves, type Notice, type RoomClient } from '../net/room';
import { otherSeat, REACTIONS, reactionInfo, type Incoming, type Seat, type SeatInfo } from '../net/transport';
import { clearOpenRoom } from '../net/openRoom';

interface Props {
  client: RoomClient;
  profile: Profile;
  /** Back home; the room stays open (unless `left`). */
  onExit: (left: boolean) => void;
  onProgress?: (p: Progress) => void;
}

/** The other player as a profile, for the player bar and Hebrew forms. */
function seatProfile(s: SeatInfo, seat: Seat): Profile {
  return { id: `room-${seat}`, name: s.name, avatar: s.avatar, gender: s.gender, ageGroup: 'teenAdult', themeId: 'clean', createdAt: 0 };
}

const REACTION_THROTTLE_MS = 1200;
const BUBBLE_MS = 2600;

export function RoomGame({ client, profile, onExit, onProgress }: Props) {
  const [, setVersion] = useState(0);
  const [message, setMessage] = useState<Message | null>(null);
  const [confirm, setConfirm] = useState<'resign' | 'leave' | null>(null);
  const [bubbles, setBubbles] = useState<Partial<Record<Seat, { emoji: string; key: number }>>>({});
  /** The last reaction in words, for screen readers (the bubble itself comes and goes). */
  const [heard, setHeard] = useState('');
  const lastReaction = useRef(0);
  const msgId = useRef(0);
  const [, tick] = useState(0);

  useEffect(() => {
    const offState = client.subscribe(() => setVersion((v) => v + 1));
    const offMsg = client.onMessage((m: Incoming) => {
      if (m.type === 'reaction') {
        const key = Date.now();
        setBubbles((b) => ({ ...b, [m.from]: { emoji: reactionInfo(m.id).emoji, key } }));
        setHeard(reactionInfo(m.id).label);
        window.setTimeout(() => setBubbles((b) => (b[m.from]?.key === key ? { ...b, [m.from]: undefined } : b)), BUBBLE_MS);
      }
    });
    let clear: number | undefined;
    const offNotice = client.onNotice((n: Notice) => {
      const id = ++msgId.current;
      setMessage({
        id,
        tone: 'bad',
        text: n === 'illegalMove' ? 'הגיע מסע לא חוקי, והוא נדחה. הלוח מסונכרן.' : 'המסע לא נשלח. הלוח מסונכרן מחדש.'
      });
      clearTimeout(clear);
      clear = window.setTimeout(() => setMessage((m) => (m?.id === id ? null : m)), 8000);
    });
    const t = window.setInterval(() => tick((x) => x + 1), 5000);
    return () => {
      offState();
      offMsg();
      offNotice();
      clearInterval(t);
      clearTimeout(clear);
    };
  }, [client]);

  const doc = client.doc;
  const seat = client.seat;
  const moves = client.shownMoves();
  const movesKey = moves.join(' ');
  const start = doc?.game.start ?? '';
  const chess = useMemo(() => replayMoves(start, moves).chess, [start, movesKey]);
  const history = chess.history({ verbose: true });

  // The newest move slides in (mine was already dragged or tapped into place).
  const lastMove: LastMove | null = useMemo(() => {
    const m = history[history.length - 1];
    if (!m) return null;
    const mine = doc ? m.color === colorOf(doc, seat) : false;
    return { from: m.from, to: m.to, animate: !mine, id: history.length };
  }, [movesKey]);

  const captured = useMemo(() => capturedBy(history), [movesKey]);
  const balance = materialBalance(captured);

  const myColor: Color = doc ? colorOf(doc, seat) : 'w';
  const oppSeat = otherSeat(seat);
  const oppInfo = doc?.seats[oppSeat];
  const opp = oppInfo ? seatProfile(oppInfo, oppSeat) : null;
  const oppStatus = client.opponentStatus();

  const end = doc?.game.end;
  const outcome: Outcome | null = end
    ? end.reason === 'resign'
      ? { reason: 'resign', winner: other(colorOf(doc!, end.by)) }
      : { reason: 'stalemate', winner: null } // a draw by agreement (its own text below)
    : outcomeOf(chess);
  const agreed = end?.reason === 'agreed';
  const turn = chess.turn();
  const myTurn = !outcome && turn === myColor;
  const link = client.link;
  const pending = !!client.pending;
  const canPlay = !!doc && !!opp && myTurn && link === 'online' && !pending && oppStatus !== 'left' && !client.gone;

  // Kids hear "your turn" when the other player has moved.
  useAutoSpeak(myTurn && moves.length > 0 && link === 'online' ? 'תורך!' : null, movesKey);

  // The result counts once, in this phone's profile only.
  const round = doc?.game.round ?? 0;
  useEffect(() => {
    if (!outcome || !doc || client.record.recorded === round) return;
    const r = outcome.winner === null ? 'draw' : outcome.winner === myColor ? 'win' : 'loss';
    if (r === 'win') window.setTimeout(() => playSound('win'), 350);
    void client
      .markRecorded(round)
      .then(() => recordGameResult(profile.id, r))
      .then(() => getProgress(profile.id))
      .then((p) => onProgress?.(p));
  }, [!!outcome, round]);

  // A new round (rematch): clear the old messages.
  useEffect(() => {
    setMessage(null);
    setConfirm(null);
  }, [round]);

  function handleMove(from: Square, to: Square, promotion?: PieceSymbol) {
    if (!canPlay) return;
    void client.send({ type: 'move', uci: `${from}${to}${promotion ?? ''}`, ply: client.moves.length });
  }

  function react(id: (typeof REACTIONS)[number]['id']) {
    const now = Date.now();
    if (now - lastReaction.current < REACTION_THROTTLE_MS) return;
    lastReaction.current = now;
    void client.send({ type: 'reaction', id });
  }

  async function leave() {
    await client.send({ type: 'leave' });
    await clearOpenRoom(profile.id);
    onExit(true);
  }

  if (!doc) {
    return (
      <main class="screen room" aria-busy="true">
        <p class="game-status is-thinking">
          מתחברים לחדר<span class="think-dots" aria-hidden="true" />
        </p>
      </main>
    );
  }

  const oppName = opp?.name ?? '';
  const me = profile;
  const bottom = myColor;
  const top = other(myColor);

  let status: string;
  if (client.gone) status = 'החדר נסגר.';
  else if (outcome) {
    if (outcome.winner === null) status = 'תיקו!';
    else if (outcome.winner === myColor) status = `ניצחת, ${me.name}!`;
    else status = `${oppName} ${byGender(opp!, 'ניצח', 'ניצחה')} הפעם`;
  } else if (link === 'offline') status = 'אין אינטרנט. צריך אינטרנט כדי לשחק בחדר.';
  else if (link !== 'online') status = 'מתחבר מחדש…';
  else if (oppStatus === 'left') status = `${oppName} ${byGender(opp!, 'יצא', 'יצאה')} מהחדר.`;
  else if (pending) status = 'שולח…';
  else if (myTurn) status = `תורך, ${me.name}`;
  else if (oppStatus === 'away') status = `${oppName} לא ${byGender(opp!, 'מחובר', 'מחוברת')} כרגע. המשחק מחכה.`;
  else status = `התור של ${oppName}`;

  const busy = !outcome && !myTurn && link === 'online' && oppStatus === 'here';
  const reason = outcome
    ? end?.reason === 'resign'
      ? `${end.by === seat ? me.name : oppName} ${byGender(end.by === seat ? me : opp!, 'נכנע', 'נכנעה')}.`
      : agreed
        ? 'תיקו בהסכמה.'
        : END_REASON_TEXT[outcome.reason]
    : '';

  const again = doc.game.again ?? {};
  const iAskedAgain = again[seat] === round;
  const theyAskedAgain = again[oppSeat] === round;
  const draw = doc.game.draw;

  const bar = (c: Color) => {
    const isMe = c === myColor;
    const s = isMe ? seat : oppSeat;
    const p = isMe ? me : opp;
    if (!p) return null;
    const bubble = bubbles[s];
    return (
      <div class="room-player" data-seat={isMe ? 'me' : 'them'}>
        <PlayerBar
          profile={p}
          color={c}
          captured={captured[c]}
          advantage={c === 'w' ? balance : -balance}
          active={!outcome && turn === c}
          badge={isMe ? 'תורך' : oppStatus === 'here' ? byGender(p, 'חושב…', 'חושבת…') : byGender(p, 'לא מחובר', 'לא מחוברת')}
        />
        {!isMe && oppStatus !== 'here' && !outcome && (
          <span class="presence" data-presence={oppStatus}>
            {oppStatus === 'left' ? byGender(p, 'יצא מהחדר', 'יצאה מהחדר') : byGender(p, 'לא מחובר', 'לא מחוברת')}
          </span>
        )}
        {bubble && (
          <span class="reaction-bubble" key={bubble.key} aria-hidden="true" data-testid={`bubble-${isMe ? 'me' : 'them'}`}>
            {bubble.emoji}
          </span>
        )}
      </div>
    );
  };

  return (
    <main class="screen game room-game">
      <header class="topbar">
        <button class="btn btn-ghost btn-back" onClick={() => onExit(false)} aria-label="חזרה לבית">
          → בית
        </button>
        <span class="topbar-title">
          חדר <bdi dir="ltr">{client.code}</bdi>
        </span>
        <span class={`link-chip link-${link}`} data-link={link} role="status">
          {link === 'online' ? '🟢 מחובר' : link === 'offline' ? '🔴 אין אינטרנט' : '🟠 מתחבר…'}
        </span>
      </header>

      {bar(top)}
      <Board
        position={chessPosition(chess)}
        orientation={myColor}
        interactive={canPlay}
        showHints={profile.ageGroup !== 'teenAdult'}
        lastMove={lastMove}
        checkSquare={outcome ? null : checkedKingSquare(chess)}
        onMove={handleMove}
      />
      {bar(bottom)}

      <p
        class={`game-status ${!outcome && chess.inCheck() ? 'is-check' : ''} ${busy || link !== 'online' ? 'is-thinking' : ''}`}
        aria-live="polite"
        data-testid="room-status"
      >
        {!outcome && chess.inCheck() && <strong>שח! </strong>}
        {status}
        {(busy || link === 'reconnecting' || link === 'connecting') && <span class="think-dots" aria-hidden="true" />}
      </p>

      {message && <Feedback message={message} />}
      <p class="visually-hidden" aria-live="polite">
        {heard}
      </p>
      {outcome && outcome.winner === myColor && <Confetti />}

      {!client.gone && !outcome && (
        <div class="reactions" role="group" aria-label="סמלי רגש">
          {REACTIONS.map((r) => (
            <button
              key={r.id}
              type="button"
              class="reaction-btn"
              data-reaction={r.id}
              aria-label={r.label}
              disabled={link !== 'online'}
              onClick={() => react(r.id)}
            >
              {r.emoji}
            </button>
          ))}
        </div>
      )}

      {client.gone ? (
        <section class="card result" role="alert">
          <p class="result-title">החדר נסגר</p>
          <button class="btn btn-primary" onClick={() => void clearOpenRoom(profile.id).then(() => onExit(true))}>
            לבית
          </button>
        </section>
      ) : outcome ? (
        <section class="card result" aria-live="polite" data-testid="room-result">
          <div class="result-emoji" aria-hidden="true">
            {outcome.winner === null ? '🤝' : outcome.winner === myColor ? '🏆' : opp?.avatar}
          </div>
          <p class="result-title">{status}</p>
          <p class="result-reason">{reason}</p>
          {oppStatus === 'left' ? (
            <p class="room-note">{`${oppName} ${byGender(opp!, 'יצא', 'יצאה')} מהחדר.`}</p>
          ) : iAskedAgain ? (
            <p class="room-note is-waiting">
              מחכים ש{oppName} {byGender(opp!, 'יסכים', 'תסכים')} למשחק חוזר
              <span class="think-dots" aria-hidden="true" />
            </p>
          ) : theyAskedAgain ? (
            <p class="room-note is-good">
              {oppName} רוצה משחק חוזר!
            </p>
          ) : null}
          <div class="row">
            {oppStatus !== 'left' && !iAskedAgain && (
              <button class="btn btn-primary" data-testid="room-again" onClick={() => void client.send({ type: 'rematch' })}>
                משחק חוזר (מחליפים צבעים)
              </button>
            )}
            <button class="btn btn-secondary" data-testid="room-leave" onClick={() => void leave()}>
              יציאה מהחדר
            </button>
          </div>
        </section>
      ) : draw === oppSeat ? (
        <section class="card confirm" data-testid="draw-offer">
          <p>
            {oppName} {byGender(opp!, 'מציע', 'מציעה')} תיקו. {byGender(me, 'מסכים', 'מסכימה')}?
          </p>
          <div class="row">
            <button class="btn btn-primary" onClick={() => void client.send({ type: 'draw', action: 'accept' })}>
              כן, תיקו 🤝
            </button>
            <button class="btn btn-secondary" onClick={() => void client.send({ type: 'draw', action: 'decline' })}>
              ממשיכים לשחק
            </button>
          </div>
        </section>
      ) : confirm === 'resign' ? (
        <section class="card confirm">
          <p>{me.name}, בטוח שרוצים להיכנע?</p>
          <div class="row">
            <button
              class="btn btn-danger"
              onClick={() => {
                setConfirm(null);
                void client.send({ type: 'resign' });
              }}
            >
              כן, להיכנע
            </button>
            <button class="btn btn-secondary" onClick={() => setConfirm(null)}>
              להמשיך לשחק
            </button>
          </div>
        </section>
      ) : confirm === 'leave' ? (
        <section class="card confirm">
          <p>לצאת מהחדר? המשחק ייגמר בשבילך, ו{oppName} {byGender(opp ?? me, 'יראה', 'תראה')} שיצאת.</p>
          <div class="row">
            <button class="btn btn-danger" onClick={() => void leave()}>
              כן, לצאת
            </button>
            <button class="btn btn-secondary" onClick={() => setConfirm(null)}>
              להישאר
            </button>
          </div>
        </section>
      ) : (
        <>
          {draw === seat && <p class="room-note is-waiting">הצעת תיקו. מחכים לתשובה…</p>}
          <div class="row game-actions">
            <button
              class="btn btn-secondary"
              data-testid="room-draw"
              onClick={() => void client.send({ type: 'draw', action: 'offer' })}
              disabled={draw === seat || moves.length < 2 || link !== 'online' || oppStatus === 'left'}
            >
              🤝 הצעת תיקו
            </button>
            <button
              class="btn btn-secondary"
              data-testid="room-resign"
              onClick={() => setConfirm('resign')}
              disabled={moves.length === 0 || link !== 'online'}
            >
              🏳️ כניעה
            </button>
          </div>
          <button class="btn btn-ghost room-exit" onClick={() => setConfirm('leave')}>
            יציאה מהחדר
          </button>
        </>
      )}
    </main>
  );
}
