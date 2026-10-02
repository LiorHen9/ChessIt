// Spaced review: stations and puzzles solved with mistakes come back after 1, 3, 7 and 14 days.
// A clean solve of an item that is due moves it to the next interval (after 14 days it leaves
// the list); a solve with mistakes sends it back to the start (tomorrow).
// Days are local days, so "tomorrow" starts at the family's midnight.
import type { Progress } from '../profiles/profiles';

export const INTERVALS = [1, 3, 7, 14];

const DAY = 24 * 60 * 60 * 1000;

/** Local midnight of the day `now` is in, plus `days` days. */
export function dayStart(now: number, days = 0): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d.getTime();
}

export const stationKey = (id: string) => `s:${id}`;
export const puzzleKey = (theme: string, id: string) => `p:${theme}:${id}`;

export type ReviewItem = { kind: 'station'; id: string; due: number } | { kind: 'puzzle'; theme: string; id: string; due: number };

export function parseKey(key: string, due: number): ReviewItem | null {
  const [kind, a, b] = key.split(':');
  if (kind === 's' && a) return { kind: 'station', id: a, due };
  if (kind === 'p' && a && b) return { kind: 'puzzle', theme: a, id: b, due };
  return null;
}

/** Update the review entry of one item after it was solved. Mutates and returns `p.review`. */
export function scheduleReview(p: Progress, key: string, clean: boolean, now = Date.now()): Progress['review'] {
  const review = { ...p.review };
  const entry = review[key];
  if (!clean) {
    review[key] = { due: dayStart(now, INTERVALS[0]), interval: INTERVALS[0] };
  } else if (entry && entry.due <= now) {
    const i = INTERVALS.indexOf(entry.interval);
    const next = INTERVALS[i + 1];
    if (next === undefined || i < 0) delete review[key];
    else review[key] = { due: dayStart(now, next), interval: next };
  }
  p.review = review;
  return review;
}

/** Items whose time has come, oldest first. */
export function dueItems(p: Progress | null, now = Date.now()): ReviewItem[] {
  if (!p) return [];
  return Object.entries(p.review)
    .filter(([, v]) => v.due <= now)
    .sort((a, b) => a[1].due - b[1].due)
    .map(([k, v]) => parseKey(k, v.due))
    .filter((x): x is ReviewItem => x !== null);
}

export { DAY };
