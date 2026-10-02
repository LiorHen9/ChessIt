// Stars, saving station results, and which stations are open.
//
// Unlock rule: a station opens when the station before it in its world is completed.
// The first station of a world opens when every station of the previous world is completed.
// A completed station always stays open, even if content is added before it later.
// Worlds passed in the placement test (part <= placement.passedPart) count as done for
// unlocking, and all their stations stay open, so the learner can always go back.
import { dbPut } from '../storage/db';
import { getProgress, type Progress } from '../profiles/profiles';
import { puzzleKey, scheduleReview, stationKey } from './review';
import type { Station, World } from './types';

export type Stars = 1 | 2 | 3;

/**
 * Stars for a finished station. `count` is moves (or mistakes, for tapSquares).
 * Every hint lowers the best possible result by one star, but finishing is always at least 1.
 */
export function starsFor(station: Station, count: number, hints: number): Stars {
  const byCount: Stars = count <= station.stars['3'] ? 3 : count <= station.stars['2'] ? 2 : 1;
  return Math.max(1, Math.min(byCount, 3 - hints)) as Stars;
}

export function stationStars(progress: Progress | null, id: string): 0 | 1 | 2 | 3 {
  return progress?.stations[id]?.stars ?? 0;
}

export function isCompleted(progress: Progress | null, id: string): boolean {
  return stationStars(progress, id) > 0;
}

export function isWorldComplete(world: World, progress: Progress | null): boolean {
  return world.stations.every((s) => isCompleted(progress, s.id));
}

/** Marked as known in the placement test. */
export function isWorldPassed(world: World, progress: Progress | null): boolean {
  return (progress?.placement?.passedPart ?? 0) >= world.part;
}

/** Done for unlocking purposes: every station completed, or passed in the placement test. */
export function isWorldDone(world: World, progress: Progress | null): boolean {
  return isWorldPassed(world, progress) || isWorldComplete(world, progress);
}

export function isWorldUnlocked(worlds: World[], progress: Progress | null, worldIndex: number): boolean {
  return worldIndex === 0 || isWorldPassed(worlds[worldIndex], progress) || isWorldDone(worlds[worldIndex - 1], progress);
}

/** Is every world of this part done (completed or passed)? Opens the part's puzzle themes. */
export function isPartDone(worlds: World[], progress: Progress | null, part: number): boolean {
  const list = worlds.filter((w) => w.part === part);
  return list.length > 0 && list.every((w) => isWorldDone(w, progress));
}

export function isUnlocked(worlds: World[], progress: Progress | null, stationId: string): boolean {
  if (isCompleted(progress, stationId)) return true;
  for (let w = 0; w < worlds.length; w++) {
    const i = worlds[w].stations.findIndex((s) => s.id === stationId);
    if (i < 0) continue;
    if (!isWorldUnlocked(worlds, progress, w)) return false;
    if (isWorldPassed(worlds[w], progress)) return true;
    return i === 0 || isCompleted(progress, worlds[w].stations[i - 1].id);
  }
  return false;
}

/** The station after this one along the path (crossing into the next world), or null at the end. */
export function nextStationId(worlds: World[], stationId: string): string | null {
  const all = worlds.flatMap((w) => w.stations.map((s) => s.id));
  const i = all.indexOf(stationId);
  return i >= 0 && i + 1 < all.length ? all[i + 1] : null;
}

/** The first open station that is not completed yet: "you are here". Null when all are done. */
export function currentStationId(worlds: World[], progress: Progress | null): string | null {
  for (const w of worlds) {
    if (isWorldPassed(w, progress)) continue;
    for (const s of w.stations) {
      if (!isCompleted(progress, s.id)) return isUnlocked(worlds, progress, s.id) ? s.id : null;
    }
  }
  return null;
}

export function totals(worlds: World[], progress: Progress | null) {
  let stars = 0;
  let done = 0;
  let count = 0;
  for (const w of worlds) {
    for (const s of w.stations) {
      count += 1;
      const n = stationStars(progress, s.id);
      stars += n;
      if (n > 0) done += 1;
    }
  }
  return { stars, maxStars: count * 3, done, count };
}

/**
 * Save a result. Keeps the best stars and the first completion time.
 * Less than three stars (a mistake, extra moves or a hint) puts the station in spaced review.
 */
export async function recordStation(profileId: string, stationId: string, stars: Stars): Promise<Progress> {
  const p = await getProgress(profileId);
  scheduleReview(p, stationKey(stationId), stars === 3);
  const old = p.stations[stationId];
  p.stations = {
    ...p.stations,
    [stationId]: {
      stars: Math.max(old?.stars ?? 0, stars) as Stars,
      completedAt: old?.completedAt ?? Date.now()
    }
  };
  await dbPut('progress', profileId, p);
  return p;
}

/**
 * Save a solved puzzle. A puzzle solved with a mistake or a hint goes into spaced review.
 * `day` marks the daily puzzle as solved for that local day.
 */
export async function recordPuzzle(profileId: string, theme: string, id: string, clean: boolean, day?: string): Promise<Progress> {
  const p = await getProgress(profileId);
  const key = `${theme}:${id}`;
  const old = p.puzzles[key];
  if (!old) p.stats = { ...p.stats, puzzlesSolved: p.stats.puzzlesSolved + 1 };
  p.puzzles = { ...p.puzzles, [key]: { solvedAt: old?.solvedAt ?? Date.now(), clean: clean || !!old?.clean } };
  scheduleReview(p, puzzleKey(theme, id), clean);
  if (day) p.daily = day;
  await dbPut('progress', profileId, p);
  return p;
}

/** Save the placement test. A retake never lowers what was already passed. */
export async function recordPlacement(profileId: string, passedPart: number, score: number, skipped = false): Promise<Progress> {
  const p = await getProgress(profileId);
  const before = p.placement?.passedPart ?? 0;
  p.placement = { passedPart: Math.max(before, passedPart), score, at: Date.now(), ...(skipped ? { skipped } : {}) };
  await dbPut('progress', profileId, p);
  return p;
}
