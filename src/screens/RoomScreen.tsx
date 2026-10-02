// Rooms: open a room (colour, parent-child mode), wait with the code and QR, join by code or link,
// and play (RoomGame). Everything here – screens, relay and QR – is one lazy chunk, loaded only
// when someone opens a room.
import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { Color } from 'chess.js';
import type { Profile, Progress } from '../profiles/profiles';
import { HandicapPicker, NO_HANDICAP, type Handicap } from '../components/HandicapPicker';
import { handicapFen } from '../chess/handicap';
import { other } from '../chess/rules';
import { RoomClient, type JoinError } from '../net/room';
import { qrMatrix, qrPath } from '../net/qr';
import { clearOpenRoom, roomTransportKind, type OpenRoom, type TransportKind } from '../net/openRoom';
import { CODE_ALPHABET, CODE_LENGTH } from '../net/transport';
import { RoomGame } from './RoomGame';
import './room.css';

export type RoomStart = { kind: 'menu' } | { kind: 'create' } | { kind: 'join'; code?: string } | { kind: 'resume' };

interface Props {
  profile: Profile;
  start: RoomStart;
  /** This profile's open room, if any. */
  openRoom?: OpenRoom;
  /** Back home (the open room may have changed: home reloads it). */
  onExit: () => void;
  onProgress?: (p: Progress) => void;
}

type Step =
  | { name: 'menu' }
  | { name: 'create' }
  | { name: 'join'; error?: JoinError }
  | { name: 'busy'; text: string }
  | { name: 'room'; client: RoomClient }
  | { name: 'offline'; retry: RoomStart }
  | { name: 'closed' };

type ColorChoice = 'w' | 'b' | 'random';

const PRIVACY = 'רק השם, האווטאר והמסעים עוברים. בלי צ׳אט, והחדר נמחק בסוף.';

const JOIN_ERROR: Record<JoinError, string> = {
  notFound: 'לא מצאנו חדר עם הקוד הזה. כדאי לבדוק את האותיות.',
  full: 'בחדר הזה כבר יש שני שחקנים.',
  offline: 'אין חיבור. צריך אינטרנט כדי לשחק בחדר.',
  invalid: 'משהו בחדר הזה לא תקין. אפשר לפתוח חדר חדש.'
};

export function RoomScreen({ profile, start, openRoom, onExit, onProgress }: Props) {
  const kind = roomTransportKind();
  const [step, setStep] = useState<Step>(() => initialStep(start));

  function initialStep(s: RoomStart): Step {
    if (s.kind === 'menu') return { name: 'menu' };
    if (s.kind === 'create') return { name: 'create' };
    if (s.kind === 'join' && !s.code) return { name: 'join' };
    return { name: 'busy', text: 'מתחברים לחדר' };
  }

  // Joining from a link, or coming back to the open room.
  useEffect(() => {
    if (!kind) return;
    if (start.kind === 'join' && start.code) void join(start.code);
    if (start.kind === 'resume') void resume();
  }, []);

  // Leaving the screen stops listening; the room stays open.
  const client = step.name === 'room' ? step.client : null;
  useEffect(() => () => client?.close(), [client]);

  if (!kind) {
    return (
      <Shell title="חדר לשני טלפונים" onBack={onExit}>
        <section class="card room-card" role="note">
          <p class="room-big-icon" aria-hidden="true">
            🛠️
          </p>
          <p>החדרים עוד לא מוכנים: צריך לחבר את האפליקציה לשרת המסעים (Firebase).</p>
          <p class="fineprint">ההוראות להקמה נמצאות בקובץ docs/FIREBASE.md במאגר.</p>
        </section>
      </Shell>
    );
  }

  function offline(retry: RoomStart): boolean {
    if (navigator.onLine !== false) return false;
    setStep({ name: 'offline', retry });
    return true;
  }

  function started(c: RoomClient) {
    c.start();
    // Tests (pretend relay or a local test relay) can reach the room directly.
    if (/[?&](transport=local|db=)/.test(location.search)) (window as unknown as Record<string, unknown>).__chessitRoom = c;
    setStep({ name: 'room', client: c });
  }

  async function create(color: ColorChoice, handicap: Handicap) {
    if (offline({ kind: 'create' })) return;
    setStep({ name: 'busy', text: 'פותחים חדר' });
    if (openRoom) await leaveOld(openRoom);
    const r = await RoomClient.create(kind!, profile, {
      color,
      handicap: handicap.enabled ? { giver: handicap.giver, pieces: handicap.pieces } : undefined
    });
    if (r === 'offline') setStep({ name: 'offline', retry: { kind: 'create' } });
    else started(r);
  }

  async function join(code: string) {
    if (offline({ kind: 'join', code })) return;
    code = code.toUpperCase();
    // My own room (a link to it, or the QR of my own phone): just go back in.
    if (openRoom && openRoom.code === code) return resume();
    setStep({ name: 'busy', text: 'מצטרפים לחדר' });
    const r = await RoomClient.join(kind!, code, profile);
    if (typeof r === 'string') {
      setStep(r === 'offline' ? { name: 'offline', retry: { kind: 'join', code } } : { name: 'join', error: r });
      return;
    }
    if (openRoom && openRoom.code !== code) void leaveOld(openRoom, false);
    started(r);
  }

  async function resume() {
    if (!openRoom) return setStep({ name: 'menu' });
    if (offline({ kind: 'resume' })) return;
    setStep({ name: 'busy', text: 'חוזרים לחדר' });
    const r = await RoomClient.join(openRoom.transport === kind ? kind : openRoom.transport, openRoom.code, profile, openRoom);
    if (r === 'offline') return setStep({ name: 'offline', retry: { kind: 'resume' } });
    if (typeof r === 'string') {
      await clearOpenRoom(profile.id);
      return setStep({ name: 'closed' });
    }
    started(r);
  }

  /** Opening or joining another room leaves the old one (so it can be deleted). */
  async function leaveOld(old: OpenRoom, clear = true) {
    const c = await RoomClient.join(old.transport, old.code, profile, old).catch(() => null);
    if (c && typeof c !== 'string') {
      c.start();
      await new Promise((r) => setTimeout(r, 300));
      await c.send({ type: 'leave' }).catch(() => undefined);
      c.close();
    }
    if (clear) await clearOpenRoom(profile.id);
  }

  switch (step.name) {
    case 'menu':
      return (
        <Shell title="חדר לשני טלפונים" onBack={onExit}>
          <p class="lead room-lead">כל אחד משחק מהטלפון שלו – גם מבית אחר.</p>
          <button class="action action-primary" data-testid="room-create" onClick={() => setStep({ name: 'create' })}>
            <span class="action-icon" aria-hidden="true">
              ➕
            </span>
            <span class="action-text">
              <span class="action-title">פתיחת חדר</span>
              <span class="action-sub">מקבלים קוד ושולחים אותו למי שמשחק איתך</span>
            </span>
          </button>
          <button class="action" data-testid="room-join" onClick={() => setStep({ name: 'join' })}>
            <span class="action-icon" aria-hidden="true">
              🔑
            </span>
            <span class="action-text">
              <span class="action-title">הצטרפות לחדר</span>
              <span class="action-sub">יש לך קוד? מקלידים אותו כאן</span>
            </span>
          </button>
          <p class="fineprint room-privacy">🔒 {PRIVACY}</p>
        </Shell>
      );

    case 'create':
      return <CreateRoom profile={profile} onBack={() => setStep({ name: 'menu' })} onCreate={(c, h) => void create(c, h)} />;

    case 'join':
      return (
        <JoinRoom
          initial={start.kind === 'join' ? (start.code ?? '') : ''}
          error={step.error}
          onBack={() => setStep({ name: 'menu' })}
          onJoin={(code) => void join(code)}
        />
      );

    case 'busy':
      return (
        <Shell title="חדר לשני טלפונים" onBack={onExit}>
          <p class="game-status is-thinking room-busy" aria-busy="true">
            {step.text}
            <span class="think-dots" aria-hidden="true" />
          </p>
        </Shell>
      );

    case 'offline':
      return (
        <Shell title="חדר לשני טלפונים" onBack={onExit}>
          <section class="card room-card" role="alert" data-testid="room-offline">
            <p class="room-big-icon" aria-hidden="true">
              📡
            </p>
            <p class="room-card-title">צריך אינטרנט כדי לשחק בחדר</p>
            <p>כל שאר האפליקציה עובדת גם בלי אינטרנט: המסלול, החידות, משחק לשניים ונגד המחשב.</p>
            <div class="row">
              <button
                class="btn btn-primary"
                onClick={() => {
                  const r = step.retry;
                  setStep(initialStep(r));
                  if (r.kind === 'join' && r.code) void join(r.code);
                  if (r.kind === 'resume') void resume();
                }}
              >
                לנסות שוב
              </button>
              <button class="btn btn-secondary" onClick={onExit}>
                לבית
              </button>
            </div>
          </section>
        </Shell>
      );

    case 'closed':
      return (
        <Shell title="חדר לשני טלפונים" onBack={onExit}>
          <section class="card room-card" role="alert">
            <p class="room-card-title">החדר כבר נסגר</p>
            <p>אפשר לפתוח חדר חדש.</p>
            <div class="row">
              <button class="btn btn-primary" onClick={() => setStep({ name: 'create' })}>
                פתיחת חדר
              </button>
              <button class="btn btn-secondary" onClick={onExit}>
                לבית
              </button>
            </div>
          </section>
        </Shell>
      );

    case 'room':
      return <InRoom client={step.client} kind={kind} profile={profile} onExit={onExit} onProgress={onProgress} />;
  }
}

function Shell({ title, onBack, children }: { title: string; onBack: () => void; children: ComponentChildren }) {
  return (
    <main class="screen room">
      <header class="topbar">
        <button class="btn btn-ghost btn-back" onClick={onBack}>
          → חזרה
        </button>
        <span class="topbar-title">{title}</span>
        <span />
      </header>
      {children}
    </main>
  );
}

// --- opening a room --------------------------------------------------------------------------

function CreateRoom({ profile, onBack, onCreate }: { profile: Profile; onBack: () => void; onCreate: (c: ColorChoice, h: Handicap) => void }) {
  const [color, setColor] = useState<ColorChoice>('w');
  const [handicap, setHandicap] = useState<Handicap>(NO_HANDICAP);
  const shown: Color = color === 'b' ? 'b' : 'w';
  const preview = handicap.enabled ? handicapFen(handicap.giver === 'me' ? shown : other(shown), handicap.pieces) : handicapFen('w', []);
  return (
    <Shell title="פתיחת חדר" onBack={onBack}>
      <div class="form">
        <fieldset class="field">
          <legend class="field-label">באיזה צבע {profile.name}?</legend>
          <div class="segmented">
            <button type="button" class={`seg ${color === 'w' ? 'is-on' : ''}`} data-color="w" onClick={() => setColor('w')}>
              <span class="seg-main">⚪ לבן</span>
              <span class="seg-hint">מתחיל ראשון</span>
            </button>
            <button type="button" class={`seg ${color === 'b' ? 'is-on' : ''}`} data-color="b" onClick={() => setColor('b')}>
              <span class="seg-main">⚫ שחור</span>
            </button>
            <button type="button" class={`seg ${color === 'random' ? 'is-on' : ''}`} data-color="random" onClick={() => setColor('random')}>
              <span class="seg-main">🎲 הגרלה</span>
            </button>
          </div>
        </fieldset>

        <HandicapPicker
          value={handicap}
          onChange={setHandicap}
          meLabel={profile.name}
          themLabel="השחקן בטלפון השני"
          previewFen={preview}
          orientation={shown}
        />

        <p class="fineprint room-privacy">🔒 {PRIVACY}</p>

        <button class="btn btn-primary btn-big" data-testid="room-open" onClick={() => onCreate(color, handicap)}>
          פתיחת חדר
        </button>
      </div>
    </Shell>
  );
}

// --- the code, the QR and sharing --------------------------------------------------------------

function roomLink(code: string, kind: TransportKind): string {
  const url = new URL(location.pathname, location.origin);
  url.searchParams.set('room', code);
  // Tests on one computer: the link must open the same pretend (or local test) relay.
  if (kind === 'local') url.searchParams.set('transport', 'local');
  const db = new URLSearchParams(location.search).get('db');
  if (db && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) url.searchParams.set('db', db);
  return url.toString();
}

function Waiting({ client, kind, onBack, onCancel }: { client: RoomClient; kind: TransportKind; onBack: () => void; onCancel: () => void }) {
  const link = roomLink(client.code, kind);
  const qr = useMemo(() => qrPath(qrMatrix(link)), [link]);
  const [shared, setShared] = useState<'copied' | 'failed' | null>(null);

  async function share() {
    const text = `בואו לשחק איתי שחמט ב-ChessIt! קוד החדר: ${client.code}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'ChessIt – חדר', text, url: link });
        return;
      }
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return;
    }
    try {
      await navigator.clipboard.writeText(`${text}\n${link}`);
      setShared('copied');
    } catch {
      setShared('failed');
    }
  }

  return (
    <Shell title="החדר פתוח" onBack={onBack}>
      <section class="card room-wait">
        <p class="room-wait-title">הקוד של החדר</p>
        <p class="room-code" dir="ltr" data-testid="room-code" aria-label={`קוד החדר: ${[...client.code].join(' ')}`}>
          {[...client.code].map((c, i) => (
            <span key={i}>{c}</span>
          ))}
        </p>
        <svg class="room-qr" viewBox={`0 0 ${qr.size} ${qr.size}`} role="img" aria-label="QR להצטרפות לחדר" data-testid="room-qr" shape-rendering="crispEdges">
          <rect width={qr.size} height={qr.size} fill="var(--qr-paper)" />
          <path d={qr.path} fill="var(--qr-ink)" />
        </svg>
        <p class="fineprint">סורקים במצלמה של הטלפון השני, או מקלידים שם את הקוד.</p>
        <button class="btn btn-primary btn-big" data-testid="room-share" onClick={() => void share()}>
          📤 שיתוף הקישור
        </button>
        {shared && (
          <p class={`room-note ${shared === 'copied' ? 'is-good' : ''}`} aria-live="polite">
            {shared === 'copied' ? 'הקישור הועתק! אפשר להדביק אותו בהודעה.' : `אפשר לשלוח את הקישור: ${link}`}
          </p>
        )}
        <p class="game-status is-thinking room-waiting" aria-live="polite">
          <span class="room-pulse" aria-hidden="true" />
          מחכים לשחקן השני
          <span class="think-dots" aria-hidden="true" />
        </p>
      </section>
      <p class="fineprint room-privacy">🔒 {PRIVACY}</p>
      <button class="btn btn-ghost" onClick={onCancel}>
        סגירת החדר
      </button>
    </Shell>
  );
}

function InRoom({
  client,
  kind,
  profile,
  onExit,
  onProgress
}: {
  client: RoomClient;
  kind: TransportKind;
  profile: Profile;
  onExit: () => void;
  onProgress?: (p: Progress) => void;
}) {
  const [, setV] = useState(0);
  useEffect(() => client.subscribe(() => setV((v) => v + 1)), [client]);
  // Before the other player arrives, the host sees the code; afterwards, the game.
  if (client.doc && !client.doc.seats.guest && client.seat === 'host' && !client.gone) {
    return (
      <Waiting
        client={client}
        kind={kind}
        onBack={onExit}
        onCancel={() =>
          void client
            .send({ type: 'leave' })
            .then(() => clearOpenRoom(profile.id))
            .then(onExit)
        }
      />
    );
  }
  return <RoomGame client={client} profile={profile} onExit={onExit} onProgress={onProgress} />;
}

// --- typing a code ---------------------------------------------------------------------------

function JoinRoom({ initial, error, onBack, onJoin }: { initial: string; error?: JoinError; onBack: () => void; onJoin: (code: string) => void }) {
  const [code, setCode] = useState(error ? '' : initial.toUpperCase().slice(0, CODE_LENGTH));
  // After a failed try, start again from an empty code.
  useEffect(() => {
    if (error) setCode('');
  }, [error]);
  const add = (c: string) => {
    if (code.length >= CODE_LENGTH) return;
    const next = code + c;
    setCode(next);
    if (next.length === CODE_LENGTH) onJoin(next);
  };
  // A keyboard works too (letters are matched without case; look-alikes are not in the code).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toUpperCase();
      if (e.key === 'Backspace') setCode((c) => c.slice(0, -1));
      else if (k.length === 1 && CODE_ALPHABET.includes(k)) add(k);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  return (
    <Shell title="הצטרפות לחדר" onBack={onBack}>
      <p class="lead room-lead">מקלידים את הקוד מהטלפון השני</p>
      <div class="code-slots" dir="ltr" data-testid="code-slots">
        {Array.from({ length: CODE_LENGTH }, (_, i) => (
          <span key={i} class={`code-slot ${i === code.length ? 'is-next' : ''}`}>
            {code[i] ?? ''}
          </span>
        ))}
      </div>
      {error && (
        <p class="feedback is-bad" role="alert" data-testid="join-error">
          {JOIN_ERROR[error]}
        </p>
      )}
      <div class="code-keys" dir="ltr">
        {[...CODE_ALPHABET].map((c) => (
          <button key={c} type="button" class="code-key" data-key={c} onClick={() => add(c)}>
            {c}
          </button>
        ))}
        <button type="button" class="code-key code-back" aria-label="מחיקה" onClick={() => setCode((c) => c.slice(0, -1))}>
          ⌫
        </button>
      </div>
      <button class="btn btn-primary btn-big" disabled={code.length < CODE_LENGTH} onClick={() => onJoin(code)}>
        הצטרפות
      </button>
    </Shell>
  );
}
