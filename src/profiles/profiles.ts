import { dbDelete, dbGet, dbGetAll, dbPut } from '../storage/db';
import { clampLevel, levelInfo, MAX_LEVEL, MIN_LEVEL } from '../engine/levels';

export type AgeGroup = 'kids5_7' | 'kids8_12' | 'teenAdult';
export type Gender = 'boy' | 'girl' | 'other';

export interface Profile {
  id: string;
  name: string;
  avatar: string;
  ageGroup: AgeGroup;
  /** Used only to suggest a theme (phase 5). Optional. */
  gender?: Gender;
  themeId: string;
  createdAt: number;
}

export interface Progress {
  profileId: string;
  stations: Record<string, { stars: 0 | 1 | 2 | 3; completedAt?: number }>;
  review: Record<string, { due: number; interval: number }>;
  engineLevel: number;
  stats: { games: number; wins: number; draws: number; puzzlesSolved: number };
  /** Results against the computer, per level ("1"…"8"). */
  vsComputer: Record<string, LevelRecord>;
  /** Current run of wins or losses against the computer at one level. Draws end it. */
  computerStreak: ComputerStreak | null;
  /** Solved puzzles by "theme:id". `clean` = solved without a mistake or hint at least once. */
  puzzles: Record<string, { solvedAt: number; clean: boolean }>;
  /** The last local day (YYYY-MM-DD) the daily puzzle was solved. */
  daily: string | null;
  /** Placement test result (13+). Parts up to `passedPart` count as passed. */
  placement: Placement | null;
}

export interface Placement {
  passedPart: number;
  score: number;
  at: number;
  /** The test was skipped from the offer (do not offer it again). */
  skipped?: boolean;
}

export interface LevelRecord {
  games: number;
  wins: number;
  losses: number;
  draws: number;
}

export interface ComputerStreak {
  level: number;
  result: 'win' | 'loss';
  count: number;
}

export type GameResult = 'win' | 'loss' | 'draw';
/** After 3 wins (or losses) in a row at the same level, offer to move up (or down). */
export const STREAK_FOR_OFFER = 3;
export type LevelOffer = { direction: 'up' | 'down'; level: number } | null;

export const AGE_GROUPS: { id: AgeGroup; label: string; hint: string }[] = [
  { id: 'kids5_7', label: '5–7', hint: 'הסברים קצרים ומוקראים' },
  { id: 'kids8_12', label: '8–12', hint: 'הסברים עם דוגמאות' },
  { id: 'teenAdult', label: '13+', hint: 'נוער ומבוגרים' }
];

export const GENDERS: { id: Gender; label: string }[] = [
  { id: 'boy', label: 'בן' },
  { id: 'girl', label: 'בת' },
  { id: 'other', label: 'לא חשוב' }
];

export const AVATARS = ['🦁', '🐯', '🐻', '🐼', '🦊', '🐸', '🐵', '🦄', '🐲', '🐙', '🦉', '🐧', '🐶', '🐱', '🐰', '🦖', '🚀', '⭐'];

/** Players who are not a saved profile (pass-and-play opponent). */
export const GUEST: Profile = {
  id: 'guest',
  name: 'אורח',
  avatar: '👤',
  ageGroup: 'teenAdult',
  themeId: 'clean',
  createdAt: 0
};

export function newProfileId(): string {
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Pick the Hebrew form that matches the profile ("ניצח" / "ניצחה" / "ניצח/ה").
 * Without a gender, `neutral` is used when given, otherwise a combined form.
 */
export function byGender(p: Profile, male: string, female: string, neutral?: string): string {
  if (p.gender === 'boy') return male;
  if (p.gender === 'girl') return female;
  if (neutral !== undefined) return neutral;
  if (female.startsWith(male)) return `${male}/${female.slice(male.length)}`;
  return `${male}/${female}`;
}

export async function listProfiles(): Promise<Profile[]> {
  const all = await dbGetAll<Profile>('profiles');
  return all.sort((a, b) => a.createdAt - b.createdAt);
}

export function saveProfile(p: Profile): Promise<void> {
  return dbPut('profiles', p.id, p);
}

export async function deleteProfile(id: string): Promise<void> {
  await dbDelete('profiles', id);
  await dbDelete('progress', id);
  await dbDelete('settings', id);
}

export function emptyProgress(profileId: string): Progress {
  return {
    profileId,
    stations: {},
    review: {},
    engineLevel: 1,
    stats: { games: 0, wins: 0, draws: 0, puzzlesSolved: 0 },
    vsComputer: {},
    computerStreak: null,
    puzzles: {},
    daily: null,
    placement: null
  };
}

export async function getProgress(profileId: string): Promise<Progress> {
  const p = await dbGet<Progress>('progress', profileId);
  if (!p) return emptyProgress(profileId);
  // Older records may lack newer fields.
  return { ...emptyProgress(profileId), ...p, stats: { ...emptyProgress(profileId).stats, ...p.stats } };
}

/** The computer as a player in the bars and the result card. */
export function computerProfile(level: number): Profile {
  const info = levelInfo(level);
  return {
    id: COMPUTER_ID,
    name: `${info.name} · רמה ${info.level}`,
    avatar: info.icon,
    ageGroup: 'teenAdult',
    gender: 'boy',
    themeId: 'clean',
    createdAt: 0
  };
}

export const COMPUTER_ID = 'computer';

export async function recordGameResult(profileId: string, result: GameResult): Promise<void> {
  if (profileId === GUEST.id || profileId === COMPUTER_ID) return;
  const p = await getProgress(profileId);
  p.stats.games += 1;
  if (result === 'win') p.stats.wins += 1;
  if (result === 'draw') p.stats.draws += 1;
  await dbPut('progress', profileId, p);
}

/**
 * Save a game against the computer: overall stats, the record for that level and the streak.
 * Returns an offer to change level after STREAK_FOR_OFFER wins or losses in a row.
 */
export async function recordComputerResult(
  profileId: string,
  level: number,
  result: GameResult
): Promise<{ progress: Progress; offer: LevelOffer }> {
  const p = await getProgress(profileId);
  level = clampLevel(level);
  p.stats.games += 1;
  if (result === 'win') p.stats.wins += 1;
  if (result === 'draw') p.stats.draws += 1;

  const key = String(level);
  const rec: LevelRecord = p.vsComputer[key] ? { ...p.vsComputer[key] } : { games: 0, wins: 0, losses: 0, draws: 0 };
  rec.games += 1;
  if (result === 'win') rec.wins += 1;
  else if (result === 'loss') rec.losses += 1;
  else rec.draws += 1;
  p.vsComputer = { ...p.vsComputer, [key]: rec };

  const s = p.computerStreak;
  if (result === 'draw') p.computerStreak = null;
  else if (s && s.level === level && s.result === result) p.computerStreak = { ...s, count: s.count + 1 };
  else p.computerStreak = { level, result, count: 1 };

  let offer: LevelOffer = null;
  const streak = p.computerStreak;
  if (streak && streak.count >= STREAK_FOR_OFFER) {
    if (streak.result === 'win' && level < MAX_LEVEL) offer = { direction: 'up', level: level + 1 };
    if (streak.result === 'loss' && level > MIN_LEVEL) offer = { direction: 'down', level: level - 1 };
  }
  await dbPut('progress', profileId, p);
  return { progress: p, offer };
}

/** The player chose a level (setup screen, or accepting an offer). Starts a fresh streak. */
export async function setEngineLevel(profileId: string, level: number, resetStreak: boolean): Promise<Progress> {
  const p = await getProgress(profileId);
  const next = clampLevel(level);
  if (resetStreak || p.engineLevel !== next) p.computerStreak = null;
  p.engineLevel = next;
  await dbPut('progress', profileId, p);
  return p;
}

/** The player said "stay at this level": ask again only after another full streak. */
export async function declineLevelOffer(profileId: string): Promise<Progress> {
  const p = await getProgress(profileId);
  p.computerStreak = null;
  await dbPut('progress', profileId, p);
  return p;
}
