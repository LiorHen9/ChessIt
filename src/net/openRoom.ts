// The room a profile is in, kept on the phone so it can come back after closing the app.
// Small on purpose: the home screen uses it, and everything else about rooms loads later (lazy).
// One record per profile, so a local saved game and an open room never overwrite each other, and
// two profiles on one phone can each be in a room.
import { dbDelete, dbGet, dbPut } from '../storage/db';
import { DB_URL_PATTERN, FIREBASE_DB_URL } from './config';

export type TransportKind = 'firebase' | 'local';

export interface OpenRoom {
  code: string;
  seat: 'host' | 'guest';
  /** Proves the seat is ours when coming back (see SeatInfo.ticket). */
  ticket: string;
  transport: TransportKind;
  joinedAt: number;
  /** The last round whose result went into this profile's stats (so it counts once). */
  recorded?: number;
}

const key = (profileId: string) => `room:${profileId}`;

export function loadOpenRoom(profileId: string): Promise<OpenRoom | undefined> {
  return dbGet<OpenRoom>('meta', key(profileId));
}

export function saveOpenRoom(profileId: string, r: OpenRoom): Promise<void> {
  return dbPut('meta', key(profileId), r);
}

export function clearOpenRoom(profileId: string): Promise<void> {
  return dbDelete('meta', key(profileId));
}

function param(name: string): string | null {
  try {
    return new URLSearchParams(location.search).get(name);
  } catch {
    return null;
  }
}

/** Tests may point the app at a local relay (?db=http://localhost:…), but only on localhost. */
export function databaseUrl(): string {
  const override = param('db');
  if (override && /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(override))
    return override;
  return FIREBASE_DB_URL.replace(/\/+$/, '');
}

/** Which relay rooms use here, or null when rooms are not set up yet. `?transport=local` for tests. */
export function roomTransportKind(): TransportKind | null {
  if (param('transport') === 'local') return 'local';
  const url = databaseUrl();
  return url && (DB_URL_PATTERN.test(url) || url.startsWith('http://')) ? 'firebase' : null;
}

/** The room code in the address (a shared link or QR): ?room=K7P2Q. */
export function roomFromUrl(): string | null {
  const code = param('room')?.trim().toUpperCase();
  return code || null;
}

/** Remove ?room= from the address once handled, so a refresh does not join again. */
export function clearRoomFromUrl(): void {
  try {
    const url = new URL(location.href);
    if (!url.searchParams.has('room')) return;
    url.searchParams.delete('room');
    history.replaceState(history.state, '', url.toString());
  } catch {
    // ignore
  }
}
