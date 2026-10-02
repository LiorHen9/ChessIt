// The computer opponent, behind one interface. Levels 1–2: KidEngine. Levels 3–8: Stockfish.
// Both run in a Web Worker, so the board keeps responding while the computer thinks.

import { KidEngine } from './kidEngine';
import { StockfishEngine } from './stockfish';
import { usesStockfish } from './levels';
import type { SearchResult } from './uci';

export interface Engine {
  init(): Promise<void>;
  /** Best move for the side to move, in UCI ("e2e4", "e7e8q"). */
  bestMove(fen: string, level: number): Promise<string>;
  /** Full-strength evaluation for the game summary (Stockfish only). */
  evaluate?(fen: string): Promise<SearchResult>;
  dispose(): void;
}

let kid: KidEngine | null = null;
let stockfish: StockfishEngine | null = null;

export function kidEngine(): KidEngine {
  if (!kid) kid = new KidEngine();
  return kid;
}

/** Stockfish is created on first use only, so its files load only when someone needs them. */
export function stockfishEngine(): StockfishEngine {
  if (!stockfish) stockfish = new StockfishEngine();
  return stockfish;
}

export function engineFor(level: number): Engine {
  return usesStockfish(level) ? stockfishEngine() : kidEngine();
}
