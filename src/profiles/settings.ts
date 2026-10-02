// Per-profile settings, in the `settings` store (one record per profile, created on first change).
// The active profile's settings also switch the sound and narration modules.
import { dbGet, dbPut } from '../storage/db';
import { setSoundEnabled } from '../audio/sound';
import { setNarration } from '../audio/speech';
import type { Profile } from './profiles';

export interface Settings {
  profileId: string;
  sound: boolean;
  /** Read new tasks aloud by themselves (the 🔊 button works either way). */
  narration: boolean;
  /** The "how to install a Hebrew voice" note was shown and dismissed. */
  speechHelpSeen: boolean;
}

export function defaultSettings(p: Profile): Settings {
  return { profileId: p.id, sound: true, narration: p.ageGroup === 'kids5_7', speechHelpSeen: false };
}

export async function loadSettings(p: Profile): Promise<Settings> {
  const saved = await dbGet<Partial<Settings>>('settings', p.id);
  return { ...defaultSettings(p), ...saved, profileId: p.id };
}

let active: Settings | null = null;
const listeners = new Set<() => void>();

export function activeSettings(): Settings | null {
  return active;
}

export function onSettingsChange(f: () => void): () => void {
  listeners.add(f);
  return () => void listeners.delete(f);
}

function apply(s: Settings | null): void {
  active = s;
  setSoundEnabled(s?.sound ?? true);
  setNarration(s?.narration ?? false);
  listeners.forEach((f) => f());
}

/** Load and switch to the profile's settings (or the defaults with no profile). */
export async function activateSettings(p: Profile | null): Promise<Settings | null> {
  apply(p ? await loadSettings(p) : null);
  return active;
}

/** Change and save the active profile's settings. */
export async function updateSettings(patch: Partial<Omit<Settings, 'profileId'>>): Promise<void> {
  if (!active) return;
  const next = { ...active, ...patch };
  apply(next);
  await dbPut('settings', next.profileId, next);
}
