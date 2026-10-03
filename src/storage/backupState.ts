// When this phone last made a backup, and the one-time reminder to make one.
// Small and in the first load: the home screen decides whether to show the reminder.
// The reminder appears once per phone, on the home screen of a profile that has completed
// NUDGE_AFTER stations, until someone backs up or taps "not now".
import { dbGet, dbPut } from './db';
import type { Progress } from '../profiles/profiles';

export interface BackupState {
  /** The last time a backup file was saved or shared (ms). */
  lastBackupAt?: number;
  /** "Not now" was tapped on the reminder: do not show it again. */
  nudgeDismissed?: boolean;
}

const KEY = 'backup';
export const NUDGE_AFTER = 20;

export async function loadBackupState(): Promise<BackupState> {
  return (await dbGet<BackupState>('meta', KEY)) ?? {};
}

async function patch(p: Partial<BackupState>): Promise<void> {
  await dbPut('meta', KEY, { ...(await loadBackupState()), ...p });
}

export const markBackedUp = (at = Date.now()) => patch({ lastBackupAt: at });
export const dismissNudge = () => patch({ nudgeDismissed: true });

export function shouldNudge(state: BackupState | null, completedStations: number): boolean {
  return !!state && !state.lastBackupAt && !state.nudgeDismissed && completedStations >= NUDGE_AFTER;
}

/** Stations this profile has completed (at least one star). */
export function completedStations(p: Progress | null): number {
  return p ? Object.values(p.stations).filter((s) => s.stars > 0).length : 0;
}
