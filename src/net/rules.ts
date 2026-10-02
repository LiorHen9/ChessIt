// What the relay does with a write, in TypeScript: apply the changes like Firebase does, then check
// the result against the same rules as firebase/database.rules.json.
// Used by the local transport (local.ts) and by the test relay (tests/net/mock-firebase.ts), so the
// tests exercise the rules too. A change to the rules must be made in BOTH places.
import { CODE_ALPHABET, CODE_LENGTH, type Changes } from './transport';

type Json = unknown;
type Obj = Record<string, Json>;

const isObj = (x: Json): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);

/** Firebase drops nulls and empty objects. */
export function prune(v: Json): Json {
  if (!isObj(v)) return v;
  const out: Obj = {};
  for (const [k, c] of Object.entries(v)) {
    const p = prune(c);
    if (p !== null && p !== undefined) out[k] = p;
  }
  return Object.keys(out).length ? out : null;
}

function resolveServerValues(v: Json, now: number): Json {
  if (isObj(v)) {
    if (v['.sv'] === 'timestamp') return now;
    const out: Obj = {};
    for (const [k, c] of Object.entries(v)) out[k] = resolveServerValues(c, now);
    return out;
  }
  return v;
}

export function getPath(doc: Json, path: string): Json {
  let cur = doc;
  for (const part of path.split('/').filter(Boolean)) {
    if (!isObj(cur)) return null;
    cur = cur[part] ?? null;
  }
  return cur ?? null;
}

/** Sets `value` at `path` (relative, "a/b") in a copy of `doc`. */
export function setPath(doc: Json, path: string, value: Json): Json {
  const parts = path.split('/').filter(Boolean);
  if (parts.length === 0) return value;
  const root: Obj = isObj(doc) ? { ...doc } : {};
  let cur = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const next = cur[parts[i]];
    cur[parts[i]] = isObj(next) ? { ...next } : {};
    cur = cur[parts[i]] as Obj;
  }
  cur[parts[parts.length - 1]] = value;
  return root;
}

/** A multi-path update (PATCH) as Firebase applies it. */
export function applyChanges(doc: Json, changes: Changes, now: number): Json {
  let out = doc;
  for (const [path, value] of Object.entries(changes)) out = setPath(out, path, resolveServerValues(value, now));
  return prune(out);
}

export function resolveDoc(doc: Json, now: number): Json {
  return prune(resolveServerValues(doc, now));
}

// ---------------------------------------------------------------------------------------------
// The rules. Returns null when the write is allowed, or the reason it is not.

const SEAT_KEYS = ['name', 'avatar', 'gender', 'ticket', 'seen', 'away', 'left'];
const isSeat = (x: Json) => x === 'host' || x === 'guest';
const str = (x: Json): x is string => typeof x === 'string';
const num = (x: Json): x is number => typeof x === 'number';

export function checkWrite(code: string, before: Json, after: Json, now: number): string | null {
  if (code.length !== CODE_LENGTH || ![...code].every((c) => CODE_ALPHABET.includes(c))) return 'code';
  const d = isObj(before) ? before : null;
  const n = isObj(after) ? after : null;

  // .write
  if (n) {
    if (d && n.created !== d.created) return 'overwrite';
  } else {
    if (!d) return null;
    const seats = isObj(d.seats) ? d.seats : {};
    const hostLeft = isObj(seats.host) && seats.host.left === true;
    const guest = seats.guest;
    const guestGone = guest === undefined || (isObj(guest) && guest.left === true);
    const stale = num(d.touched) && d.touched < now - 7200000;
    return stale || (hostLeft && guestGone) ? null : 'delete';
  }

  // .validate
  for (const k of ['v', 'created', 'touched', 'seats', 'game']) if (!(k in n)) return `missing ${k}`;
  for (const k of Object.keys(n)) if (!['v', 'created', 'touched', 'seats', 'game', 'hc', 'react'].includes(k)) return `extra ${k}`;
  if (n.v !== 1) return 'v';
  if (!num(n.created) || n.created > now) return 'created';
  if (!num(n.touched) || n.touched > now) return 'touched';

  if (!isObj(n.seats) || !('host' in n.seats)) return 'seats';
  for (const [seat, s] of Object.entries(n.seats)) {
    if (!isSeat(seat) || !isObj(s)) return 'seat';
    for (const k of ['name', 'avatar', 'ticket', 'seen']) if (!(k in s)) return `seat ${k}`;
    for (const k of Object.keys(s)) if (!SEAT_KEYS.includes(k)) return `seat extra ${k}`;
    const old = d && isObj(d.seats) ? d.seats[seat] : undefined;
    if (isObj(old) && old.ticket !== s.ticket) return 'ticket changed';
    if (!str(s.name) || s.name.length < 1 || s.name.length > 24) return 'name';
    if (!str(s.avatar) || s.avatar.length < 1 || s.avatar.length > 16) return 'avatar';
    if ('gender' in s && !['boy', 'girl', 'other'].includes(s.gender as string)) return 'gender';
    if (!str(s.ticket) || s.ticket.length < 16 || s.ticket.length > 40 || !/^[A-Za-z0-9]+$/.test(s.ticket)) return 'ticket';
    if (!num(s.seen) || s.seen > now) return 'seen';
    if ('away' in s && typeof s.away !== 'boolean') return 'away';
    if ('left' in s && typeof s.left !== 'boolean') return 'left';
  }

  const g = n.game;
  if (!isObj(g)) return 'game';
  for (const k of ['round', 'white', 'start', 'moves', 'ply']) if (!(k in g)) return `game ${k}`;
  for (const k of Object.keys(g)) if (!['round', 'white', 'start', 'moves', 'ply', 'draw', 'end', 'again'].includes(k)) return `game extra ${k}`;
  if (!num(g.round) || g.round < 0 || g.round > 1000) return 'round';
  if (!isSeat(g.white)) return 'white';
  if (!str(g.start) || g.start.length > 100 || !/^[-0-9a-hpnbrqkPNBRQKw/ ]+$/.test(g.start)) return 'start';
  if (!str(g.moves) || g.moves.length > 4000 || !/^([a-h][1-8][a-h][1-8][qrbn]? )*$/.test(g.moves)) return 'moves';
  if (!num(g.ply) || g.ply < 0 || g.ply > 700) return 'ply';
  if ('draw' in g && !isSeat(g.draw)) return 'draw';
  if ('end' in g) {
    const e = g.end;
    if (!isObj(e) || Object.keys(e).some((k) => k !== 'reason' && k !== 'by')) return 'end';
    if ((e.reason !== 'resign' && e.reason !== 'agreed') || !isSeat(e.by)) return 'end';
  }
  if ('again' in g) {
    const a = g.again;
    if (!isObj(a)) return 'again';
    for (const [k, v] of Object.entries(a)) if (!isSeat(k) || !num(v)) return 'again';
  }

  const og = d && isObj(d.game) ? d.game : null;
  if (!og) {
    if (g.ply !== 0 || g.moves !== '') return 'new game must be empty';
  } else if (g.round === (og.round as number) + 1) {
    if (g.ply !== 0 || g.moves !== '') return 'new round must be empty';
  } else {
    if (g.round !== og.round || g.white !== og.white || g.start !== og.start) return 'game identity';
    const om = og.moves as string;
    const op = og.ply as number;
    const same = g.ply === op && g.moves === om;
    const oneMore = g.ply === op + 1 && !('end' in og) && g.moves.startsWith(om) && g.moves.length <= om.length + 6;
    const repair = g.ply < op && om.startsWith(g.moves);
    if (!same && !oneMore && !repair) return 'out of turn';
  }

  if ('hc' in n) {
    const h = n.hc;
    if (!isObj(h) || Object.keys(h).some((k) => k !== 'seat' && k !== 'pieces')) return 'hc';
    if (!isSeat(h.seat) || !str(h.pieces) || h.pieces.length > 30 || !/^(q|ra|rh|nb|ng|bc|bf)(,(q|ra|rh|nb|ng|bc|bf))*$/.test(h.pieces))
      return 'hc';
  }
  if ('react' in n) {
    const r = n.react;
    if (!isObj(r)) return 'react';
    for (const [seat, v] of Object.entries(r)) {
      if (!isSeat(seat) || !isObj(v) || Object.keys(v).some((k) => k !== 'id' && k !== 'n')) return 'react';
      if (!['clap', 'wow', 'oops', 'gg', 'heart', 'fire'].includes(v.id as string)) return 'react id';
      if (!num(v.n) || v.n < 0 || v.n > 100000) return 'react n';
    }
  }
  return null;
}
