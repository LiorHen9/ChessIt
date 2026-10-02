import { dbDelete, dbGet, dbGetAll, dbPut } from '../storage/db';

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
}

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
    stats: { games: 0, wins: 0, draws: 0, puzzlesSolved: 0 }
  };
}

export async function getProgress(profileId: string): Promise<Progress> {
  const p = await dbGet<Progress>('progress', profileId);
  if (!p) return emptyProgress(profileId);
  // Older records may lack newer fields.
  return { ...emptyProgress(profileId), ...p, stats: { ...emptyProgress(profileId).stats, ...p.stats } };
}

export async function recordGameResult(profileId: string, result: 'win' | 'loss' | 'draw'): Promise<void> {
  if (profileId === GUEST.id) return;
  const p = await getProgress(profileId);
  p.stats.games += 1;
  if (result === 'win') p.stats.wins += 1;
  if (result === 'draw') p.stats.draws += 1;
  await dbPut('progress', profileId, p);
}
