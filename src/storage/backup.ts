// Backup and restore of the whole family to one JSON file (loaded lazily, with the backup screen).
//
// What is in the file: every profile, its progress and its settings. The PIN is there only as it
// is on the phone – a hash with its salt, never the digits.
// What is not: the `meta` store, which describes this phone and this moment rather than the
// family – the last profile used, a game that is open right now, an open room (its seat ticket
// belongs to this phone), the error log and the backup reminder. A restore never brings back a
// half-played game or a room seat.
//
// Reading a file is strict: anything that does not look exactly like a backup is refused before a
// single record is touched, with a message that says why. Older backups are converted (`MIGRATIONS`);
// a backup from a newer version of the app is refused ("update the app first").
import { dbGet, dbGetAll, dbKeys, dbWrite, SCHEMA_VERSION, type DbOp } from './db';
import { emptyProgress, type AgeGroup, type Gender, type Profile, type Progress } from '../profiles/profiles';
import type { Settings } from '../profiles/settings';
import { APP_VERSION } from '../app/version';
import { COMPUTER_ID, GUEST } from '../profiles/profiles';

export const BACKUP_FORMAT = 'chessit-backup';
/** The backup format version. Bump it when the file changes, and add a step to MIGRATIONS. */
export const BACKUP_VERSION = 1;
/** Files bigger than this are not a ChessIt backup (a family of 10 with everything done is ~100KB). */
export const MAX_BACKUP_BYTES = 5 * 1024 * 1024;
const MAX_PROFILES = 50;

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: number;
  /** ISO time of the export. */
  exportedAt: string;
  /** The IndexedDB schema version on the phone that made it (for the record). */
  schemaVersion: number;
  /** The app version that made it. */
  app: string;
  profiles: Profile[];
  progress: Progress[];
  settings: Settings[];
}

export type BackupError =
  | { code: 'too-big' }
  | { code: 'not-json' }
  | { code: 'not-backup' }
  | { code: 'future'; version: number }
  | { code: 'invalid'; detail: string };

export type ParseResult = { ok: true; backup: Backup } | { ok: false; error: BackupError };

/** A line for each error, in plain Hebrew. */
export function errorText(e: BackupError): string {
  switch (e.code) {
    case 'too-big':
      return 'הקובץ גדול מדי בשביל גיבוי של ChessIt. אולי נבחר קובץ אחר?';
    case 'not-json':
    case 'not-backup':
      return 'זה לא קובץ גיבוי של ChessIt. צריך לבחור את הקובץ ששמו מתחיל ב-chessit-backup.';
    case 'future':
      return 'הגיבוי נוצר בגרסה חדשה יותר של ChessIt. כדאי לעדכן את האפליקציה (לסגור ולפתוח מחדש) ולנסות שוב.';
    case 'invalid':
      return 'קובץ הגיבוי פגום, ולכן לא שחזרנו ממנו כלום. אולי הוא נחתך או נערך?';
  }
}

// ---------- Converting older backups ----------

/**
 * One step per old version: MIGRATIONS[n] turns a version-n file into version n+1.
 * Version 1 is the first, so there is nothing to convert yet. Example for the future:
 *   1: (b) => ({ ...b, version: 2, profiles: b.profiles.map((p) => ({ ...p, newField: 'x' })) })
 */
const MIGRATIONS: Record<number, (b: Record<string, unknown>) => Record<string, unknown>> = {};

export function migrate(raw: Record<string, unknown>): Record<string, unknown> {
  let b = raw;
  while (typeof b.version === 'number' && b.version < BACKUP_VERSION) {
    const step = MIGRATIONS[b.version];
    if (!step) throw new Invalid(`no conversion from version ${b.version}`);
    b = step(b);
  }
  return b;
}

// ---------- Checking ----------

class Invalid extends Error {}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
function need(cond: unknown, what: string): asserts cond {
  if (!cond) throw new Invalid(what);
}
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isInt = (v: unknown, min: number, max: number): v is number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
const isTime = (v: unknown): v is number => isNum(v) && v >= 0 && v < 1e14;
const optional = <T>(v: unknown, check: (v: unknown) => boolean, what: string): T | undefined => {
  if (v === undefined) return undefined;
  need(check(v), what);
  return v as T;
};

const AGE_GROUPS: AgeGroup[] = ['kids5_7', 'kids8_12', 'teenAdult'];
const GENDERS: Gender[] = ['boy', 'girl', 'other'];
const ID = /^[A-Za-z0-9_-]{1,40}$/;
const KEY = /^[\w:.-]{1,80}$/;

function checkProfile(v: unknown, i: number): Profile {
  const at = `profiles[${i}]`;
  need(isObj(v), at);
  need(typeof v.id === 'string' && ID.test(v.id) && v.id !== GUEST.id && v.id !== COMPUTER_ID, `${at}.id`);
  need(typeof v.name === 'string' && v.name.trim().length > 0 && v.name.length <= 32, `${at}.name`);
  need(typeof v.avatar === 'string' && v.avatar.length > 0 && v.avatar.length <= 16, `${at}.avatar`);
  need(AGE_GROUPS.includes(v.ageGroup as AgeGroup), `${at}.ageGroup`);
  const gender = optional<Gender>(v.gender, (g) => GENDERS.includes(g as Gender), `${at}.gender`);
  const themeId = v.themeId === undefined ? 'clean' : v.themeId;
  need(typeof themeId === 'string' && /^[a-z0-9-]{1,24}$/.test(themeId), `${at}.themeId`);
  const pinHash = optional<string>(v.pinHash, (h) => typeof h === 'string' && /^([0-9a-f]{64}|fnv:[0-9a-f]{1,8})$/.test(h), `${at}.pinHash`);
  const pinSalt = optional<string>(v.pinSalt, (s) => typeof s === 'string' && /^[0-9a-f]{8,64}$/.test(s), `${at}.pinSalt`);
  need(!pinHash === !pinSalt, `${at}.pin`);
  need(isTime(v.createdAt), `${at}.createdAt`);
  const p: Profile = { id: v.id, name: v.name.trim(), avatar: v.avatar, ageGroup: v.ageGroup as AgeGroup, themeId, createdAt: v.createdAt };
  if (gender) p.gender = gender;
  if (pinHash && pinSalt) {
    p.pinHash = pinHash;
    p.pinSalt = pinSalt;
  }
  return p;
}

/** A record of checked values (keys are station ids, puzzle ids, levels…). */
function checkRecord<T>(v: unknown, at: string, check: (x: unknown, at: string) => T): Record<string, T> {
  if (v === undefined) return {};
  need(isObj(v), at);
  const out: Record<string, T> = {};
  const keys = Object.keys(v);
  need(keys.length <= 5000, at);
  for (const k of keys) {
    need(KEY.test(k), `${at} key`);
    out[k] = check(v[k], `${at}.${k}`);
  }
  return out;
}

function checkProgress(v: unknown, ids: Set<string>, i: number): Progress {
  const at = `progress[${i}]`;
  need(isObj(v), at);
  need(typeof v.profileId === 'string' && ids.has(v.profileId), `${at}.profileId`);
  const base = emptyProgress(v.profileId);

  const stations = checkRecord(v.stations, `${at}.stations`, (s, a) => {
    need(isObj(s) && isInt(s.stars, 0, 3), a);
    const completedAt = optional<number>(s.completedAt, isTime, a);
    return completedAt === undefined ? { stars: s.stars as 0 | 1 | 2 | 3 } : { stars: s.stars as 0 | 1 | 2 | 3, completedAt };
  });
  const review = checkRecord(v.review, `${at}.review`, (r, a) => {
    need(isObj(r) && isTime(r.due) && isInt(r.interval, 0, 365), a);
    return { due: r.due as number, interval: r.interval as number };
  });
  const engineLevel = v.engineLevel === undefined ? base.engineLevel : v.engineLevel;
  need(isInt(engineLevel, 1, 8), `${at}.engineLevel`);

  const stats = { ...base.stats };
  if (v.stats !== undefined) {
    need(isObj(v.stats), `${at}.stats`);
    for (const k of Object.keys(stats) as (keyof typeof stats)[]) {
      const n = v.stats[k];
      if (n !== undefined) {
        need(isInt(n, 0, 1e7), `${at}.stats.${k}`);
        stats[k] = n;
      }
    }
  }
  const vsComputer = checkRecord(v.vsComputer, `${at}.vsComputer`, (r, a) => {
    need(isObj(r), a);
    const rec = { games: 0, wins: 0, losses: 0, draws: 0 };
    for (const k of Object.keys(rec) as (keyof typeof rec)[]) {
      need(r[k] === undefined || isInt(r[k], 0, 1e7), `${a}.${k}`);
      if (r[k] !== undefined) rec[k] = r[k] as number;
    }
    return rec;
  });
  let computerStreak: Progress['computerStreak'] = null;
  if (v.computerStreak !== undefined && v.computerStreak !== null) {
    const s = v.computerStreak;
    need(isObj(s) && isInt(s.level, 1, 8) && (s.result === 'win' || s.result === 'loss') && isInt(s.count, 0, 1e6), `${at}.computerStreak`);
    computerStreak = { level: s.level as number, result: s.result, count: s.count as number };
  }
  const puzzles = checkRecord(v.puzzles, `${at}.puzzles`, (r, a) => {
    need(isObj(r) && isTime(r.solvedAt) && typeof r.clean === 'boolean', a);
    return { solvedAt: r.solvedAt as number, clean: r.clean as boolean };
  });
  const daily = v.daily === undefined ? null : v.daily;
  need(daily === null || (typeof daily === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(daily)), `${at}.daily`);
  let placement: Progress['placement'] = null;
  if (v.placement !== undefined && v.placement !== null) {
    const pl = v.placement;
    need(isObj(pl) && isInt(pl.passedPart, 0, 20) && isInt(pl.score, 0, 100) && isTime(pl.at), `${at}.placement`);
    const skipped = optional<boolean>(pl.skipped, (x) => typeof x === 'boolean', `${at}.placement.skipped`);
    placement = { passedPart: pl.passedPart as number, score: pl.score as number, at: pl.at as number };
    if (skipped) placement.skipped = true;
  }
  return { profileId: v.profileId, stations, review, engineLevel: engineLevel as number, stats, vsComputer, computerStreak, puzzles, daily: daily as string | null, placement };
}

function checkSettings(v: unknown, ids: Set<string>, i: number): Settings {
  const at = `settings[${i}]`;
  need(isObj(v), at);
  need(typeof v.profileId === 'string' && ids.has(v.profileId), `${at}.profileId`);
  const out: Partial<Settings> = { profileId: v.profileId };
  for (const k of ['sound', 'narration', 'speechHelpSeen'] as const) {
    need(v[k] === undefined || typeof v[k] === 'boolean', `${at}.${k}`);
    if (v[k] !== undefined) out[k] = v[k] as boolean;
  }
  // Missing switches take the defaults when the profile is loaded (loadSettings merges them).
  return out as Settings;
}

/** Check a parsed file and return a clean copy (only the fields the app knows), or say what is wrong. */
export function checkBackup(raw: unknown): ParseResult {
  if (!isObj(raw) || raw.format !== BACKUP_FORMAT) return { ok: false, error: { code: 'not-backup' } };
  if (!isInt(raw.version, 1, 1e6)) return { ok: false, error: { code: 'invalid', detail: 'version' } };
  if (raw.version > BACKUP_VERSION) return { ok: false, error: { code: 'future', version: raw.version } };
  try {
    const b = migrate(raw);
    need(typeof b.exportedAt === 'string' && !Number.isNaN(Date.parse(b.exportedAt)), 'exportedAt');
    need(Array.isArray(b.profiles) && b.profiles.length <= MAX_PROFILES, 'profiles');
    const profiles = b.profiles.map(checkProfile);
    const ids = new Set(profiles.map((p) => p.id));
    need(ids.size === profiles.length, 'duplicate profile id');
    const progressList = b.progress === undefined ? [] : b.progress;
    need(Array.isArray(progressList), 'progress');
    const progress = progressList.map((x, i) => checkProgress(x, ids, i));
    need(new Set(progress.map((p) => p.profileId)).size === progress.length, 'duplicate progress');
    const settingsList = b.settings === undefined ? [] : b.settings;
    need(Array.isArray(settingsList), 'settings');
    const settings = settingsList.map((x, i) => checkSettings(x, ids, i));
    need(new Set(settings.map((s) => s.profileId)).size === settings.length, 'duplicate settings');
    return {
      ok: true,
      backup: {
        format: BACKUP_FORMAT,
        version: BACKUP_VERSION,
        exportedAt: b.exportedAt,
        schemaVersion: isInt(b.schemaVersion, 1, 1000) ? (b.schemaVersion as number) : 1,
        app: typeof b.app === 'string' ? b.app.slice(0, 40) : '',
        profiles,
        progress,
        settings
      }
    };
  } catch (e) {
    if (e instanceof Invalid) return { ok: false, error: { code: 'invalid', detail: e.message } };
    throw e;
  }
}

/** The text of a file (as read from disk) → a checked backup, or why not. */
export function parseBackup(text: string): ParseResult {
  if (text.length > MAX_BACKUP_BYTES) return { ok: false, error: { code: 'too-big' } };
  let raw: unknown;
  try {
    raw = JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    return { ok: false, error: { code: 'not-json' } };
  }
  return checkBackup(raw);
}

// ---------- Reading and writing the phone ----------

export async function makeBackup(now = new Date()): Promise<Backup> {
  const [profiles, progress, settings] = await Promise.all([
    dbGetAll<Profile>('profiles'),
    dbGetAll<Progress>('progress'),
    dbGetAll<Settings>('settings')
  ]);
  const ids = new Set(profiles.map((p) => p.id));
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    schemaVersion: SCHEMA_VERSION,
    app: APP_VERSION,
    profiles: [...profiles].sort((a, b) => a.createdAt - b.createdAt),
    // Leftovers of deleted profiles stay behind.
    progress: progress.filter((p) => ids.has(p.profileId)),
    settings: settings.filter((s) => ids.has(s.profileId))
  };
}

/** chessit-backup-2026-10-03.json (the local date). */
export function backupFileName(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `chessit-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}

export function backupJson(b: Backup): string {
  return JSON.stringify(b, null, 1);
}

/** What a profile has done, for the preview ("★ 45 · 20 תחנות"). */
export function profileSummary(progress: Progress | undefined): { stations: number; stars: number; games: number } {
  if (!progress) return { stations: 0, stars: 0, games: 0 };
  const done = Object.values(progress.stations).filter((s) => s.stars > 0);
  return { stations: done.length, stars: done.reduce((n, s) => n + s.stars, 0), games: progress.stats.games };
}

/** In "add" mode, what to do with a profile that is already on the phone (same id). */
export type Conflict = 'keep' | 'replace';

export interface RestorePlan {
  mode: 'add' | 'replace';
  /** For "add": the choice for each profile id that exists on both. Missing = keep the phone's. */
  conflicts?: Record<string, Conflict>;
}

/** Profiles in the backup that are already on the phone (same id). */
export function conflictsWith(backup: Backup, onPhone: Profile[]): Profile[] {
  const ids = new Set(onPhone.map((p) => p.id));
  return backup.profiles.filter((p) => ids.has(p.id));
}

/**
 * The database changes a restore makes (pure, for tests). "replace" empties the three stores first;
 * "add" writes new profiles and the conflicts marked "replace". A profile that is written always
 * takes its progress and settings from the backup (none in the backup = fresh ones).
 * Then `meta` is tidied: an open game, open room or last profile that points at a profile that is
 * gone is removed.
 */
export function restoreOps(backup: Backup, plan: RestorePlan, phone: { profiles: Profile[]; metaKeys: string[]; openGame?: { whiteId: string; blackId: string }; lastProfileId?: string }): { ops: DbOp[]; written: string[] } {
  const ops: DbOp[] = [];
  const onPhone = new Set(phone.profiles.map((p) => p.id));
  let write: Profile[];
  if (plan.mode === 'replace') {
    ops.push({ store: 'profiles', op: 'clear' }, { store: 'progress', op: 'clear' }, { store: 'settings', op: 'clear' });
    write = backup.profiles;
  } else {
    write = backup.profiles.filter((p) => !onPhone.has(p.id) || plan.conflicts?.[p.id] === 'replace');
  }
  const progressOf = new Map(backup.progress.map((p) => [p.profileId, p]));
  const settingsOf = new Map(backup.settings.map((s) => [s.profileId, s]));
  for (const p of write) {
    ops.push({ store: 'profiles', op: 'put', key: p.id, value: p });
    ops.push({ store: 'progress', op: 'put', key: p.id, value: progressOf.get(p.id) ?? emptyProgress(p.id) });
    const s = settingsOf.get(p.id);
    if (s) ops.push({ store: 'settings', op: 'put', key: p.id, value: s });
    else if (plan.mode === 'add') ops.push({ store: 'settings', op: 'delete', key: p.id });
  }

  // Profiles that exist after the restore.
  const after = new Set(plan.mode === 'replace' ? backup.profiles.map((p) => p.id) : [...onPhone, ...write.map((p) => p.id)]);
  const player = (id: string) => id === GUEST.id || id === COMPUTER_ID || after.has(id);
  for (const k of phone.metaKeys) {
    if (k.startsWith('room:') && !after.has(k.slice(5))) ops.push({ store: 'meta', op: 'delete', key: k });
  }
  if (phone.openGame && !(player(phone.openGame.whiteId) && player(phone.openGame.blackId))) ops.push({ store: 'meta', op: 'delete', key: 'currentGame' });
  if (phone.lastProfileId && !after.has(phone.lastProfileId)) ops.push({ store: 'meta', op: 'delete', key: 'lastProfileId' });
  return { ops, written: write.map((p) => p.id) };
}

/** Restore a checked backup on this phone, all or nothing. Returns the ids of the profiles written. */
export async function restoreBackup(backup: Backup, plan: RestorePlan): Promise<string[]> {
  const [profiles, metaKeys, openGame, lastProfileId] = await Promise.all([
    dbGetAll<Profile>('profiles'),
    dbKeys('meta'),
    dbGet<{ whiteId: string; blackId: string }>('meta', 'currentGame'),
    dbGet<string>('meta', 'lastProfileId')
  ]);
  const { ops, written } = restoreOps(backup, plan, { profiles, metaKeys, openGame, lastProfileId });
  await dbWrite(ops);
  return written;
}

/** "Delete all data on this phone": every store, all at once. */
export async function deleteEverything(): Promise<void> {
  await dbWrite([
    { store: 'profiles', op: 'clear' },
    { store: 'progress', op: 'clear' },
    { store: 'settings', op: 'clear' },
    { store: 'meta', op: 'clear' }
  ]);
  try {
    // The pretend relay used in tests (?transport=local) keeps rooms in localStorage.
    for (const k of Object.keys(localStorage)) if (k.startsWith('chessit')) localStorage.removeItem(k);
  } catch {
    // ignore
  }
}
