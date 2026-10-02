// Rooms: two phones, one game. The shapes that travel between them, and the channel they travel on.
//
// A room is one small shared JSON document at rooms/<CODE> (see RoomDoc). The relay (Firebase) keeps
// it, checks every write against the security rules, and streams every change to both phones.
// "Messages" (a move, a reaction, a draw offer…) are changes to that document: room.ts turns an
// outgoing RoomMessage into an atomic write, and turns each new version of the document back into
// the messages it contains. Because every update carries the whole move list, a phone that missed
// something (offline, in the background, closed) is back in sync with the next update it receives.

/** Room codes: 5 characters without look-alikes (no 0/O, 1/I/L, 2/Z, 5/S, 6/G…, 8/B). */
export const CODE_ALPHABET = 'ACDEFGHJKMNPQRTUVWXY3479';
export const CODE_LENGTH = 5;

export type Seat = 'host' | 'guest';
export const SEATS: Seat[] = ['host', 'guest'];
export const otherSeat = (s: Seat): Seat => (s === 'host' ? 'guest' : 'host');

/** The only reactions there are. No free text, ever. */
export const REACTIONS = [
  { id: 'clap', emoji: '👏', label: 'כל הכבוד' },
  { id: 'wow', emoji: '😮', label: 'וואו' },
  { id: 'oops', emoji: '😅', label: 'אופס' },
  { id: 'gg', emoji: '🤝', label: 'משחק יפה' },
  { id: 'heart', emoji: '❤️', label: 'לב' },
  { id: 'fire', emoji: '🔥', label: 'אש' }
] as const;
export type ReactionId = (typeof REACTIONS)[number]['id'];
export const reactionInfo = (id: ReactionId) => REACTIONS.find((r) => r.id === id)!;

export const NAME_MAX = 24;
export const AVATAR_MAX = 16;
export const MOVES_MAX = 4000;
export const MAX_PLY = 700;

export interface SeatInfo {
  name: string;
  avatar: string;
  gender?: 'boy' | 'girl' | 'other';
  /** Random token made when taking the seat; kept on the phone so it can come back to the same seat. */
  ticket: string;
  /** Server time of the last heartbeat. */
  seen: number;
  /** The app went to the background or was closed. */
  away?: boolean;
  left?: boolean;
}

export interface GameEnd {
  reason: 'resign' | 'agreed';
  /** Who resigned, or who accepted the draw. */
  by: Seat;
}

export interface GameDoc {
  /** 0 for the first game, +1 for every rematch. */
  round: number;
  white: Seat;
  start: string;
  /** UCI moves, each followed by a space: "e2e4 e7e5 ". The source of truth. */
  moves: string;
  /** Number of moves. A move is written only if ply goes up by exactly one (rules). */
  ply: number;
  /** A draw offer from this seat, waiting for an answer. */
  draw?: Seat;
  end?: GameEnd;
  /** "Play again" requests: the round each seat asked in. */
  again?: Partial<Record<Seat, number>>;
}

export interface RoomDoc {
  v: 1;
  created: number;
  touched: number;
  seats: { host: SeatInfo; guest?: SeatInfo };
  game: GameDoc;
  /** Parent-child mode: this seat plays without these pieces (comma-separated HandicapPiece ids). */
  hc?: { seat: Seat; pieces: string };
  /** The last reaction of each seat; `n` counts up so the same emoji twice still shows twice. */
  react?: Partial<Record<Seat, { id: ReactionId; n: number }>>;
}

/** What a phone can say in a room. */
export type RoomMessage =
  | { type: 'join'; name: string; avatar: string; gender?: SeatInfo['gender'] }
  | { type: 'move'; uci: string; ply: number }
  | { type: 'reaction'; id: ReactionId }
  | { type: 'draw'; action: 'offer' | 'accept' | 'decline' }
  | { type: 'resign' }
  | { type: 'rematch' }
  | { type: 'leave' };

/** A message as received: who sent it. */
export type Incoming = RoomMessage & { from: Seat };

// ---------------------------------------------------------------------------------------------
// Validation. Anything that comes from the network is checked before use: an invalid message or
// document throws, and the caller ignores it (and resyncs).

export class InvalidMessage extends Error {}

const fail = (why: string): never => {
  throw new InvalidMessage(why);
};
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const str = (x: unknown, min: number, max: number, what: string): string =>
  typeof x === 'string' && x.length >= min && x.length <= max ? x : fail(`bad ${what}`);
const onlyKeys = (o: Record<string, unknown>, keys: string[], what: string) => {
  for (const k of Object.keys(o)) if (!keys.includes(k)) fail(`unexpected ${what}.${k}`);
};

export const UCI_RE = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
export const MOVES_RE = /^([a-h][1-8][a-h][1-8][qrbn]? )*$/;
const FEN_CHARS_RE = /^[-0-9a-hpnbrqkPNBRQKw/ ]+$/;
const TICKET_RE = /^[A-Za-z0-9]{16,40}$/;
const PIECES_RE = /^(q|ra|rh|nb|ng|bc|bf)(,(q|ra|rh|nb|ng|bc|bf))*$/;
const GENDERS = ['boy', 'girl', 'other'];
const isSeat = (x: unknown): x is Seat => x === 'host' || x === 'guest';
const isReaction = (x: unknown): x is ReactionId => REACTIONS.some((r) => r.id === x);

export function isRoomCode(code: string): boolean {
  return code.length === CODE_LENGTH && [...code].every((c) => CODE_ALPHABET.includes(c));
}

/** Checks a message (outgoing or test input). Throws InvalidMessage. */
export function parseMessage(raw: unknown): RoomMessage {
  if (!isObj(raw)) return fail('not an object');
  switch (raw.type) {
    case 'join': {
      onlyKeys(raw, ['type', 'name', 'avatar', 'gender'], 'join');
      const name = str(raw.name, 1, NAME_MAX, 'name');
      const avatar = str(raw.avatar, 1, AVATAR_MAX, 'avatar');
      if (raw.gender !== undefined && !GENDERS.includes(raw.gender as string)) fail('bad gender');
      return { type: 'join', name, avatar, gender: raw.gender as SeatInfo['gender'] };
    }
    case 'move':
      onlyKeys(raw, ['type', 'uci', 'ply'], 'move');
      if (typeof raw.uci !== 'string' || !UCI_RE.test(raw.uci)) fail('bad uci');
      if (!isNum(raw.ply) || !Number.isInteger(raw.ply) || raw.ply < 0 || raw.ply >= MAX_PLY) fail('bad ply');
      return { type: 'move', uci: raw.uci as string, ply: raw.ply as number };
    case 'reaction':
      onlyKeys(raw, ['type', 'id'], 'reaction');
      if (!isReaction(raw.id)) fail('unknown reaction');
      return { type: 'reaction', id: raw.id as ReactionId };
    case 'draw':
      onlyKeys(raw, ['type', 'action'], 'draw');
      if (raw.action !== 'offer' && raw.action !== 'accept' && raw.action !== 'decline') fail('bad draw action');
      return { type: 'draw', action: raw.action as 'offer' | 'accept' | 'decline' };
    case 'resign':
    case 'rematch':
    case 'leave':
      onlyKeys(raw, ['type'], String(raw.type));
      return { type: raw.type };
    default:
      return fail('unknown type');
  }
}

function parseSeat(raw: unknown): SeatInfo {
  if (!isObj(raw)) return fail('seat');
  onlyKeys(raw, ['name', 'avatar', 'gender', 'ticket', 'seen', 'away', 'left'], 'seat');
  const s: SeatInfo = {
    name: str(raw.name, 1, NAME_MAX, 'name'),
    avatar: str(raw.avatar, 1, AVATAR_MAX, 'avatar'),
    ticket: typeof raw.ticket === 'string' && TICKET_RE.test(raw.ticket) ? raw.ticket : fail('ticket'),
    seen: isNum(raw.seen) ? raw.seen : fail('seen')
  };
  if (raw.gender !== undefined) s.gender = GENDERS.includes(raw.gender as string) ? (raw.gender as SeatInfo['gender']) : fail('gender');
  if (raw.away !== undefined) s.away = typeof raw.away === 'boolean' ? raw.away : fail('away');
  if (raw.left !== undefined) s.left = typeof raw.left === 'boolean' ? raw.left : fail('left');
  return s;
}

/** Checks a room document from the relay. Throws InvalidMessage. */
export function parseRoomDoc(raw: unknown): RoomDoc {
  if (!isObj(raw)) return fail('room');
  onlyKeys(raw, ['v', 'created', 'touched', 'seats', 'game', 'hc', 'react'], 'room');
  if (raw.v !== 1) fail('version');
  if (!isNum(raw.created) || !isNum(raw.touched)) fail('times');
  if (!isObj(raw.seats)) return fail('seats');
  onlyKeys(raw.seats, ['host', 'guest'], 'seats');
  const seats: RoomDoc['seats'] = { host: parseSeat(raw.seats.host) };
  if (raw.seats.guest !== undefined) seats.guest = parseSeat(raw.seats.guest);

  const g = raw.game;
  if (!isObj(g)) return fail('game');
  onlyKeys(g, ['round', 'white', 'start', 'moves', 'ply', 'draw', 'end', 'again'], 'game');
  if (!isNum(g.round) || g.round < 0 || g.round > 1000) fail('round');
  if (!isSeat(g.white)) fail('white');
  const start = str(g.start, 1, 100, 'start');
  if (!FEN_CHARS_RE.test(start)) fail('start');
  const moves = typeof g.moves === 'string' ? g.moves : g.moves === undefined || g.moves === null ? '' : fail('moves');
  if (moves.length > MOVES_MAX || !MOVES_RE.test(moves)) fail('moves');
  if (!isNum(g.ply) || g.ply < 0 || g.ply > MAX_PLY) fail('ply');
  const game: GameDoc = { round: g.round as number, white: g.white as Seat, start, moves, ply: g.ply as number };
  if (g.draw !== undefined) game.draw = isSeat(g.draw) ? g.draw : fail('draw');
  if (g.end !== undefined) {
    if (!isObj(g.end)) return fail('end');
    onlyKeys(g.end, ['reason', 'by'], 'end');
    if ((g.end.reason !== 'resign' && g.end.reason !== 'agreed') || !isSeat(g.end.by)) fail('end');
    game.end = { reason: g.end.reason as GameEnd['reason'], by: g.end.by as Seat };
  }
  if (g.again !== undefined) {
    if (!isObj(g.again)) return fail('again');
    onlyKeys(g.again, ['host', 'guest'], 'again');
    game.again = {};
    for (const s of SEATS) if (g.again[s] !== undefined) game.again[s] = isNum(g.again[s]) ? (g.again[s] as number) : fail('again');
  }

  const doc: RoomDoc = { v: 1, created: raw.created as number, touched: raw.touched as number, seats, game };
  if (raw.hc !== undefined) {
    if (!isObj(raw.hc)) return fail('hc');
    onlyKeys(raw.hc, ['seat', 'pieces'], 'hc');
    if (!isSeat(raw.hc.seat) || typeof raw.hc.pieces !== 'string' || !PIECES_RE.test(raw.hc.pieces)) fail('hc');
    doc.hc = { seat: raw.hc.seat as Seat, pieces: raw.hc.pieces as string };
  }
  if (raw.react !== undefined) {
    if (!isObj(raw.react)) return fail('react');
    onlyKeys(raw.react, ['host', 'guest'], 'react');
    doc.react = {};
    for (const s of SEATS) {
      const r = raw.react[s];
      if (r === undefined) continue;
      if (!isObj(r) || !isReaction(r.id) || !isNum(r.n)) return fail('react');
      onlyKeys(r, ['id', 'n'], 'react');
      doc.react[s] = { id: (r as { id: ReactionId }).id, n: (r as { n: number }).n };
    }
  }
  return doc;
}

// ---------------------------------------------------------------------------------------------
// The channel.

/** Placeholder the relay replaces with its own clock (Firebase: {".sv": "timestamp"}). */
export const SERVER_TIME = { '.sv': 'timestamp' } as const;

/** Changes to apply together, keyed by path inside the room ("game/ply"). null deletes. */
export type Changes = Record<string, unknown>;

/**
 * - ok: written.
 * - rejected: the relay refused (rules), e.g. someone else's move landed first, or the room is gone.
 * - offline: no answer (no network); worth retrying.
 */
export type WriteResult = 'ok' | 'rejected' | 'offline';

/** The live link to the relay: connecting the first time, connected, or lost and retrying. */
export type LinkState = 'connecting' | 'online' | 'reconnecting';

export interface Watcher {
  /** The whole document (raw, not yet validated), or null when there is no such room. */
  doc(raw: unknown): void;
  link(state: LinkState): void;
}

/**
 * A shared JSON document per room, with live updates and atomic writes. Two implementations:
 * firebase.ts (Realtime Database over REST + Server-Sent Events) and local.ts (BroadcastChannel
 * between tabs of the same browser, for tests and development: `?transport=local`).
 */
export interface Transport {
  readonly kind: 'firebase' | 'local';
  /** One read. Resolves null when there is no such room; rejects when offline. */
  read(code: string): Promise<unknown>;
  /** Live updates; the first call to `doc` is the current document. Returns stop(). */
  watch(code: string, w: Watcher): () => void;
  /** Creates the room; 'rejected' if the code is taken. */
  create(code: string, doc: unknown): Promise<WriteResult>;
  /** Applies all changes at once, or none of them. */
  update(code: string, changes: Changes, opts?: { keepalive?: boolean }): Promise<WriteResult>;
  remove(code: string): Promise<WriteResult>;
}
