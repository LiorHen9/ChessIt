// Stars, saving station results, and which stations are open.
//
// Unlock rule: a station opens when the station before it in its world is completed.
// The first station of a world opens when every station of the previous world is completed.
// A completed station always stays open, even if content is added before it later.
import { dbPut } from '../storage/db';
import { getProgress, type Progress } from '../profiles/profiles';
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

export function isWorldUnlocked(worlds: World[], progress: Progress | null, worldIndex: number): boolean {
  return worldIndex === 0 || isWorldComplete(worlds[worldIndex - 1], progress);
}

export function isUnlocked(worlds: World[], progress: Progress | null, stationId: string): boolean {
  if (isCompleted(progress, stationId)) return true;
  for (let w = 0; w < worlds.length; w++) {
    const i = worlds[w].stations.findIndex((s) => s.id === stationId);
    if (i < 0) continue;
    if (!isWorldUnlocked(worlds, progress, w)) return false;
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

/** Save a result. Keeps the best stars and the first completion time. */
export async function recordStation(profileId: string, stationId: string, stars: Stars): Promise<Progress> {
  const p = await getProgress(profileId);
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
