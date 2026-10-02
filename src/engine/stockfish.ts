// Levels 3–8 and the game summary: Stockfish 19 "lite", single-threaded, compiled to WebAssembly.
// The single-threaded build needs no SharedArrayBuffer, so it runs on GitHub Pages without
// COOP/COEP headers. The files live in public/engine and load only on first use.
// Source: https://github.com/nmrugg/stockfish.js (v19.0.0), GPL-3.0.

import type { Engine } from './engine';
import { kidMove } from './kid';
import { ANALYSIS_DEPTH, ANALYSIS_MAX_MS, clampLevel, STOCKFISH_LEVELS } from './levels';
import { hashString, seededRng, testSeed, type Rng } from './random';
import { goCommand, SearchCollector, type SearchResult } from './uci';

export const STOCKFISH_SCRIPT = 'engine/stockfish-19-lite-single.js';
/** First load on a slow phone network can take a while; after that it comes from the cache. */
const LOAD_TIMEOUT_MS = 45_000;

export class StockfishEngine implements Engine {
  private worker: Worker | null = null;
  private ready: Promise<void> | null = null;
  private listeners = new Set<(line: string) => void>();
  private failers = new Set<(e: Error) => void>();
  private queue: Promise<unknown> = Promise.resolve();
  private seed = testSeed();

  /** Starts the engine once. A failed start can be retried by calling init() again. */
  init(): Promise<void> {
    if (!this.ready) {
      this.ready = this.start().catch((e: unknown) => {
        this.stop(e instanceof Error ? e : new Error(String(e)));
        this.ready = null;
        throw e;
      });
    }
    return this.ready;
  }

  get isReady(): boolean {
    return this.worker !== null && this.ready !== null;
  }

  private start(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('stockfish load timeout')), LOAD_TIMEOUT_MS);
      const fail = (e: Error) => {
        clearTimeout(timer);
        reject(e);
      };
      let worker: Worker;
      try {
        // Relative to the page, so it works under /ChessIt/ on GitHub Pages and at / locally.
        worker = new Worker(new URL(STOCKFISH_SCRIPT, document.baseURI));
      } catch (e) {
        fail(e instanceof Error ? e : new Error(String(e)));
        return;
      }
      this.worker = worker;
      this.failers.add(fail);
      worker.onmessage = (e: MessageEvent) => {
        const line = String(e.data);
        for (const l of [...this.listeners]) l(line);
      };
      worker.onerror = (e) => {
        e.preventDefault();
        this.stop(new Error('stockfish worker error'));
      };
      this.waitFor((l) => l === 'uciok')
        .then(() => {
          this.send('isready');
          return this.waitFor((l) => l === 'readyok');
        })
        .then(() => {
          clearTimeout(timer);
          this.failers.delete(fail);
          resolve();
        }, fail);
      this.send('uci');
    });
  }

  private send(cmd: string) {
    this.worker?.postMessage(cmd);
  }

  private waitFor(pred: (line: string) => boolean): Promise<string> {
    return new Promise((resolve, reject) => {
      const listener = (line: string) => {
        if (!pred(line)) return;
        this.listeners.delete(listener);
        this.failers.delete(reject);
        resolve(line);
      };
      this.listeners.add(listener);
      this.failers.add(reject);
    });
  }

  /** One search at a time; later requests wait for earlier ones. */
  search(fen: string, skill: number, depth: number, movetime?: number): Promise<SearchResult> {
    const run = async (): Promise<SearchResult> => {
      await this.init();
      const collector = new SearchCollector();
      let result: SearchResult | undefined;
      const done = this.waitFor((line) => (result = collector.feed(line)) !== undefined);
      this.send(`setoption name Skill Level value ${skill}`);
      this.send(`position fen ${fen}`);
      this.send(goCommand(depth, movetime));
      await done;
      return result!;
    };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => undefined);
    return p;
  }

  private rngFor(fen: string): Rng {
    return this.seed !== undefined ? seededRng(hashString(`sf|${this.seed}|${fen}`)) : Math.random;
  }

  async bestMove(fen: string, level: number): Promise<string> {
    const cfg = STOCKFISH_LEVELS[clampLevel(level)] ?? STOCKFISH_LEVELS[3];
    const rng = this.rngFor(fen);
    // Lower levels sometimes play a "human" move, so they make the mistakes beginners can punish.
    if (rng() < cfg.kidMove) {
      await this.init(); // still prove the engine is there, so loading errors show up at the start
      return kidMove(fen, 2, rng);
    }
    const r = await this.search(fen, cfg.skill, cfg.depth, cfg.movetime);
    if (!r.best || r.best === '(none)') throw new Error('no move');
    return r.best;
  }

  /** Full strength, fixed depth (with a time cap for slow phones): used by the game summary. */
  evaluate(fen: string, depth = ANALYSIS_DEPTH): Promise<SearchResult> {
    return this.search(fen, 20, depth, ANALYSIS_MAX_MS);
  }

  private stop(reason: Error) {
    this.worker?.terminate();
    this.worker = null;
    this.listeners.clear();
    for (const f of [...this.failers]) f(reason);
    this.failers.clear();
  }

  dispose(): void {
    this.stop(new Error('disposed'));
    this.ready = null;
  }
}
