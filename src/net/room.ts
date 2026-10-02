// Room management: create a room, join it, come back to it, and play in it.
// RoomClient keeps the latest room document, checks it (shape and every move, with chess.js),
// turns outgoing messages into atomic writes, and turns each new document into incoming messages.
import { Chess, type Color } from 'chess.js';
import { DEFAULT_POSITION, handicapFen, type HandicapPiece } from '../chess/handicap';
import type { Profile } from '../profiles/profiles';
import { FirebaseTransport } from './firebase';
import { LocalTransport } from './local';
import { databaseUrl, saveOpenRoom, type OpenRoom, type TransportKind } from './openRoom';
import {
  CODE_ALPHABET,
  CODE_LENGTH,
  InvalidMessage,
  isRoomCode,
  otherSeat,
  parseMessage,
  parseRoomDoc,
  SEATS,
  SERVER_TIME,
  type Changes,
  type Incoming,
  type LinkState,
  type RoomDoc,
  type RoomMessage,
  type Seat,
  type SeatInfo,
  type Transport,
  type WriteResult
} from './transport';

export { isRoomCode };

let transports: Partial<Record<TransportKind, Transport>> = {};

export function transportFor(kind: TransportKind): Transport {
  if (!transports[kind]) transports[kind] = kind === 'local' ? new LocalTransport() : new FirebaseTransport(databaseUrl());
  return transports[kind]!;
}

/** Tests: forget transports (e.g. after changing ?db=). */
export function resetTransports(): void {
  transports = {};
}

function randomString(alphabet: string, length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  // 256 is not a multiple of the alphabet size; the tiny bias does not matter for a room code.
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
}

export function randomCode(): string {
  return randomString(CODE_ALPHABET, CODE_LENGTH);
}

function randomTicket(): string {
  return randomString('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', 24);
}

function seatFor(p: Profile, ticket: string): Record<string, unknown> {
  const s: Record<string, unknown> = { name: p.name.slice(0, 24), avatar: p.avatar.slice(0, 16), ticket, seen: SERVER_TIME };
  if (p.gender) s.gender = p.gender;
  return s;
}

/** A seat's colour in the current game. */
export function colorOf(doc: RoomDoc, seat: Seat): Color {
  return doc.game.white === seat ? 'w' : 'b';
}

/** The starting position of a round: the normal one, or without the handicapped player's pieces. */
export function startFenFor(white: Seat, hc: RoomDoc['hc']): string {
  if (!hc) return DEFAULT_POSITION;
  const color: Color = hc.seat === white ? 'w' : 'b';
  return handicapFen(color, hc.pieces.split(',') as HandicapPiece[]);
}

export function movesOf(doc: RoomDoc): string[] {
  return doc.game.moves.split(' ').filter(Boolean);
}

/** Replays a move list; stops at the first illegal move. */
export function replayMoves(start: string, moves: string[]): { chess: Chess; legal: number } {
  let chess: Chess;
  try {
    chess = new Chess(start);
  } catch {
    chess = new Chess(DEFAULT_POSITION);
  }
  let legal = 0;
  for (const uci of moves) {
    try {
      chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      legal++;
    } catch {
      break;
    }
  }
  return { chess, legal };
}

/** The messages one document change contains (what the other phone "said"). */
export function messagesBetween(prev: RoomDoc | null, next: RoomDoc): Incoming[] {
  const out: Incoming[] = [];
  for (const s of SEATS) {
    const a = prev?.seats[s];
    const b = next.seats[s];
    if (b && !a) out.push({ type: 'join', name: b.name, avatar: b.avatar, gender: b.gender, from: s });
    if (b?.left && !a?.left) out.push({ type: 'leave', from: s });
    const ra = prev?.react?.[s];
    const rb = next.react?.[s];
    if (rb && (!ra || ra.n !== rb.n)) out.push({ type: 'reaction', id: rb.id, from: s });
  }
  if (!prev || prev.game.round !== next.game.round) return out;
  const pg = prev.game;
  const ng = next.game;
  if (ng.ply === pg.ply + 1) {
    const uci = movesOf(next)[pg.ply];
    const first: Seat = ng.start.split(' ')[1] === 'b' ? otherSeat(ng.white) : ng.white;
    if (uci) out.push({ type: 'move', uci, ply: pg.ply, from: pg.ply % 2 === 0 ? first : otherSeat(first) });
  }
  if (ng.draw && ng.draw !== pg.draw) out.push({ type: 'draw', action: 'offer', from: ng.draw });
  if (pg.draw && !ng.draw && !ng.end && ng.ply === pg.ply) out.push({ type: 'draw', action: 'decline', from: otherSeat(pg.draw) });
  if (ng.end && !pg.end)
    out.push(ng.end.reason === 'agreed' ? { type: 'draw', action: 'accept', from: ng.end.by } : { type: 'resign', from: ng.end.by });
  for (const s of SEATS) if (ng.again?.[s] === ng.round && pg.again?.[s] !== ng.round) out.push({ type: 'rematch', from: s });
  return out;
}

export type JoinError = 'notFound' | 'full' | 'offline' | 'invalid';

/** Link as shown to the player: plus 'offline' when the phone has no network at all. */
export type RoomLink = LinkState | 'offline';

export type Notice = 'illegalMove' | 'moveNotSent';

const HEARTBEAT_MS = 20000;
/** The other player counts as away when their heartbeat has not moved for this long. */
const AWAY_AFTER_MS = 50000;

export class RoomClient {
  doc: RoomDoc | null = null;
  /** The room was deleted (or never existed). */
  gone = false;
  link: RoomLink = 'connecting';
  /** My move, shown right away while it is on its way. */
  pending: { uci: string; ply: number } | null = null;
  /** Checked moves of the current game (an illegal move and everything after it are dropped). */
  moves: string[] = [];

  private listeners = new Set<() => void>();
  private msgListeners = new Set<(m: Incoming) => void>();
  private noticeListeners = new Set<(n: Notice) => void>();
  private stopWatch: (() => void) | null = null;
  private timers: number[] = [];
  private closed = false;
  private oppSeen: number | undefined;
  private oppSeenChangedAt = Date.now();
  private onlineSince = 0;
  private repairing = false;
  private nextRoundFor = -1;
  private onVisibility = () => this.visibilityChanged();
  private onPageHide = () => void this.write({ [`seats/${this.seat}/away`]: true }, { once: true, keepalive: true });
  private onNetChange = () => this.recomputeLink();
  private lastWatchLink: LinkState = 'connecting';

  constructor(
    readonly transport: Transport,
    public record: OpenRoom,
    private profileId: string
  ) {}

  get code(): string {
    return this.record.code;
  }
  get seat(): Seat {
    return this.record.seat;
  }

  // --- opening a room -------------------------------------------------------------------------

  static async create(
    kind: TransportKind,
    me: Profile,
    opts: { color: 'w' | 'b' | 'random'; handicap?: { giver: 'me' | 'them'; pieces: HandicapPiece[] } }
  ): Promise<RoomClient | 'offline'> {
    const t = transportFor(kind);
    const myColor: Color = opts.color === 'random' ? (crypto.getRandomValues(new Uint8Array(1))[0] < 128 ? 'w' : 'b') : opts.color;
    const white: Seat = myColor === 'w' ? 'host' : 'guest';
    const hc =
      opts.handicap && opts.handicap.pieces.length
        ? { seat: (opts.handicap.giver === 'me' ? 'host' : 'guest') as Seat, pieces: opts.handicap.pieces.join(',') }
        : undefined;
    for (let attempt = 0; attempt < 6; attempt++) {
      const code = randomCode();
      const ticket = randomTicket();
      const doc: Record<string, unknown> = {
        v: 1,
        created: SERVER_TIME,
        touched: SERVER_TIME,
        seats: { host: seatFor(me, ticket) },
        game: { round: 0, white, start: startFenFor(white, hc), moves: '', ply: 0 }
      };
      if (hc) doc.hc = hc;
      const r = await t.create(code, doc);
      if (r === 'offline') return 'offline';
      if (r === 'ok') {
        const record: OpenRoom = { code, seat: 'host', ticket, transport: kind, joinedAt: Date.now() };
        await saveOpenRoom(me.id, record);
        return new RoomClient(t, record, me.id);
      }
      // 'rejected': the code is taken. Try another.
    }
    return 'offline';
  }

  static async join(kind: TransportKind, code: string, me: Profile, mine?: OpenRoom): Promise<RoomClient | JoinError> {
    code = code.trim().toUpperCase();
    if (!isRoomCode(code)) return 'notFound';
    const t = transportFor(kind);
    let doc: RoomDoc;
    for (let attempt = 0; ; attempt++) {
      let raw: unknown;
      try {
        raw = await t.read(code);
      } catch {
        return 'offline';
      }
      if (raw === null || raw === undefined) return 'notFound';
      try {
        doc = parseRoomDoc(raw);
      } catch {
        return 'invalid';
      }
      // Coming back: our ticket is on one of the seats.
      for (const s of SEATS) {
        const seat = doc.seats[s];
        if (mine && mine.code === code && seat?.ticket === mine.ticket) {
          if (seat.left) return 'notFound';
          const record = { ...mine, seat: s };
          await saveOpenRoom(me.id, record);
          return new RoomClient(t, record, me.id);
        }
      }
      if (doc.seats.guest) return 'full';
      const ticket = randomTicket();
      const r = await t.update(code, { 'seats/guest': seatFor(me, ticket), touched: SERVER_TIME });
      if (r === 'offline') return 'offline';
      if (r === 'ok') {
        const record: OpenRoom = { code, seat: 'guest', ticket, transport: kind, joinedAt: Date.now() };
        await saveOpenRoom(me.id, record);
        return new RoomClient(t, record, me.id);
      }
      if (attempt >= 1) return 'full'; // someone else sat down first
    }
  }

  // --- live ----------------------------------------------------------------------------------

  start(): void {
    this.stopWatch = this.transport.watch(this.code, {
      doc: (raw) => this.received(raw),
      link: (state) => {
        this.lastWatchLink = state;
        if (state === 'online' && this.link !== 'online') this.onlineSince = Date.now();
        this.recomputeLink();
      }
    });
    this.timers.push(window.setInterval(() => this.heartbeat(), HEARTBEAT_MS));
    // Re-check "away" now and then, even with no new document.
    this.timers.push(window.setInterval(() => this.emit(), 5000));
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('pagehide', this.onPageHide);
    window.addEventListener('online', this.onNetChange);
    window.addEventListener('offline', this.onNetChange);
    if (!document.hidden) this.heartbeat();
  }

  /** Stop listening (leaving the screen). The room stays; we can come back. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.stopWatch?.();
    for (const t of this.timers) clearInterval(t);
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('pagehide', this.onPageHide);
    window.removeEventListener('online', this.onNetChange);
    window.removeEventListener('offline', this.onNetChange);
    this.listeners.clear();
    this.msgListeners.clear();
    this.noticeListeners.clear();
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  onMessage(cb: (m: Incoming) => void): () => void {
    this.msgListeners.add(cb);
    return () => this.msgListeners.delete(cb);
  }

  onNotice(cb: (n: Notice) => void): () => void {
    this.noticeListeners.add(cb);
    return () => this.noticeListeners.delete(cb);
  }

  private emit() {
    for (const f of this.listeners) f();
  }

  private recomputeLink() {
    const next: RoomLink = navigator.onLine === false ? 'offline' : this.lastWatchLink;
    if (next !== this.link) {
      this.link = next;
      this.emit();
    }
  }

  private visibilityChanged() {
    if (document.hidden) {
      void this.write({ [`seats/${this.seat}/away`]: true }, { once: true, keepalive: true });
    } else {
      this.heartbeat();
    }
  }

  private heartbeat() {
    if (this.closed || document.hidden || this.link !== 'online' || !this.doc || this.gone) return;
    const me = this.doc.seats[this.seat];
    if (!me || me.left) return;
    void this.write({ [`seats/${this.seat}/seen`]: SERVER_TIME, [`seats/${this.seat}/away`]: null }, { once: true });
  }

  private received(raw: unknown, fromResync = false) {
    if (this.closed) return;
    if (raw === null || raw === undefined) {
      if (!this.gone) {
        this.gone = true;
        this.emit();
      }
      return;
    }
    let doc: RoomDoc;
    try {
      doc = parseRoomDoc(raw);
    } catch (e) {
      // A document that does not look right: ignore it and ask for the full room again.
      console.warn('[room] ignoring an invalid room document', e instanceof InvalidMessage ? e.message : e);
      if (!fromResync) void this.resync();
      return;
    }
    const prev = this.doc;
    this.doc = doc;
    this.gone = false;

    const opp = doc.seats[otherSeat(this.seat)];
    if (opp && opp.seen !== this.oppSeen) {
      this.oppSeen = opp.seen;
      this.oppSeenChangedAt = Date.now();
    }

    this.checkMoves(doc);
    if (this.pending && (doc.game.ply > this.pending.ply || (prev && prev.game.round !== doc.game.round))) this.pending = null;

    // Both asked to play again at the same moment (normally the second one starts the next round
    // itself, in send): the host starts it, once.
    const again = doc.game.again;
    if (this.seat === 'host' && again?.host === doc.game.round && again?.guest === doc.game.round && this.nextRoundFor !== doc.game.round) {
      this.nextRoundFor = doc.game.round;
      void this.startNextRound(doc);
    }

    const msgs = messagesBetween(prev, doc);
    this.emit();
    for (const m of msgs) for (const f of this.msgListeners) f(m);
  }

  private notice(n: Notice) {
    for (const f of this.noticeListeners) f(n);
  }

  /** Every phone checks every move. An illegal one (or a count that does not match) → full resync, then repair. */
  private checkMoves(doc: RoomDoc) {
    const list = movesOf(doc);
    const { legal } = replayMoves(doc.game.start, list);
    this.moves = list.slice(0, legal);
    if (legal === list.length && doc.game.ply === list.length) return;
    this.notice('illegalMove');
    void this.repair();
  }

  private async resync() {
    try {
      const raw = await this.transport.read(this.code);
      this.received(raw, true);
    } catch {
      // offline: the stream will deliver the room when the connection is back
    }
  }

  /** Read the full move list again; if it is still broken, cut it back to the last legal move. */
  private async repair() {
    if (this.repairing) return;
    this.repairing = true;
    try {
      let raw: unknown;
      try {
        raw = await this.transport.read(this.code);
      } catch {
        return;
      }
      if (!raw) return;
      let doc: RoomDoc;
      try {
        doc = parseRoomDoc(raw);
      } catch {
        return;
      }
      const list = movesOf(doc);
      const { legal } = replayMoves(doc.game.start, list);
      if (legal === list.length && doc.game.ply === list.length) return;
      const kept = list.slice(0, legal);
      await this.write({ 'game/moves': kept.map((m) => `${m} `).join(''), 'game/ply': kept.length }, { once: true });
    } finally {
      this.repairing = false;
    }
  }

  private startNextRound(doc: RoomDoc): Promise<WriteResult> {
    const white = otherSeat(doc.game.white);
    return this.write(
      { game: { round: doc.game.round + 1, white, start: startFenFor(white, doc.hc), moves: '', ply: 0 } },
      { once: true }
    );
  }

  /** Writes with retries while offline (the rules make a repeated write harmless). */
  private async write(changes: Changes, opts: { once?: boolean; keepalive?: boolean } = {}): Promise<WriteResult> {
    let delay = 1000;
    for (;;) {
      const r = await this.transport.update(this.code, { ...changes, touched: SERVER_TIME }, { keepalive: opts.keepalive });
      if (r !== 'offline' || opts.once || this.closed) return r;
      await new Promise((res) => setTimeout(res, delay));
      delay = Math.min(delay * 2, 15000);
    }
  }

  // --- what the UI reads ---------------------------------------------------------------------

  get myColor(): Color | null {
    return this.doc ? colorOf(this.doc, this.seat) : null;
  }

  get opponent(): SeatInfo | undefined {
    return this.doc?.seats[otherSeat(this.seat)];
  }

  /** waiting = nobody joined yet; away = app in the background or no heartbeat lately. */
  opponentStatus(): 'waiting' | 'here' | 'away' | 'left' {
    const o = this.opponent;
    if (!o) return 'waiting';
    if (o.left) return 'left';
    if (o.away) return 'away';
    const watching = this.link === 'online' && Date.now() - this.onlineSince > AWAY_AFTER_MS;
    if (watching && Date.now() - this.oppSeenChangedAt > AWAY_AFTER_MS) return 'away';
    return 'here';
  }

  /** The moves to show: the checked list, plus my move on its way. */
  shownMoves(): string[] {
    if (this.pending && this.pending.ply === this.moves.length) return [...this.moves, this.pending.uci];
    return this.moves;
  }

  // --- sending -------------------------------------------------------------------------------

  /** Sends a message. Invalid messages throw (InvalidMessage) before anything is written. */
  async send(raw: RoomMessage): Promise<WriteResult> {
    const msg = parseMessage(raw);
    const doc = this.doc;
    if (!doc || this.gone) return 'rejected';
    const me = this.seat;
    const g = doc.game;
    switch (msg.type) {
      case 'join':
        return 'rejected'; // joining is RoomClient.join
      case 'move': {
        if (g.end || msg.ply !== this.moves.length || msg.ply !== g.ply) return 'rejected';
        const { chess } = replayMoves(g.start, this.moves);
        if (chess.turn() !== colorOf(doc, me)) return 'rejected';
        try {
          chess.move({ from: msg.uci.slice(0, 2), to: msg.uci.slice(2, 4), promotion: msg.uci[4] });
        } catch {
          return 'rejected';
        }
        this.pending = { uci: msg.uci, ply: msg.ply };
        this.emit();
        const r = await this.write({ 'game/moves': g.moves + msg.uci + ' ', 'game/ply': msg.ply + 1, 'game/draw': null });
        if (r !== 'ok' && this.pending?.ply === msg.ply) {
          this.pending = null;
          this.notice('moveNotSent');
          this.emit();
          void this.resync();
        }
        return r;
      }
      case 'reaction': {
        const n = (doc.react?.[me]?.n ?? 0) + 1;
        return this.write({ [`react/${me}`]: { id: msg.id, n } }, { once: true });
      }
      case 'draw':
        if (g.end) return 'rejected';
        if (msg.action === 'offer') return this.write({ 'game/draw': me });
        if (msg.action === 'accept') {
          if (g.draw !== otherSeat(me)) return 'rejected';
          return this.write({ 'game/end': { reason: 'agreed', by: me }, 'game/draw': null });
        }
        return this.write({ 'game/draw': null });
      case 'resign':
        if (g.end) return 'rejected';
        return this.write({ 'game/end': { reason: 'resign', by: me }, 'game/draw': null });
      case 'rematch': {
        if (!g.end && !replayMoves(g.start, this.moves).chess.isGameOver()) return 'rejected';
        // The second to ask starts the next round (colours swap).
        if (g.again?.[otherSeat(me)] === g.round) {
          this.nextRoundFor = g.round;
          return this.startNextRound(doc);
        }
        return this.write({ [`game/again/${me}`]: g.round });
      }
      case 'leave': {
        const r = await this.write({ [`seats/${me}/left`]: true }, { once: true });
        const other = doc.seats[otherSeat(me)];
        // Last one out deletes the room.
        if (!other || other.left) await this.transport.remove(this.code);
        return r;
      }
    }
  }

  /** Remember that this round's result is in the stats. */
  async markRecorded(round: number): Promise<void> {
    this.record = { ...this.record, recorded: round };
    await saveOpenRoom(this.profileId, this.record);
  }
}
