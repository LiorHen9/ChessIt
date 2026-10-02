import { dbDelete, dbGet, dbPut } from '../storage/db';

export interface GameOptions {
  /** Turn the board so the side to move is always at the bottom (pass-and-play). */
  rotate: boolean;
  /** Show dots for legal moves. */
  hints: boolean;
}

export interface SavedGame {
  whiteId: string;
  blackId: string;
  /** Moves in long algebraic notation, e.g. "e2e4", "e7e8q". */
  moves: string[];
  options: GameOptions;
  startedAt: number;
}

const KEY = 'currentGame';

export function loadSavedGame(): Promise<SavedGame | undefined> {
  return dbGet<SavedGame>('meta', KEY);
}

export function saveGame(g: SavedGame): Promise<void> {
  return dbPut('meta', KEY, g);
}

export function clearSavedGame(): Promise<void> {
  return dbDelete('meta', KEY);
}

export async function getLastProfileId(): Promise<string | undefined> {
  return dbGet<string>('meta', 'lastProfileId');
}

export function setLastProfileId(id: string): Promise<void> {
  return dbPut('meta', 'lastProfileId', id);
}
