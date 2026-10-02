import type { Engine } from './engine';
import type { KidRequest, KidResponse } from './kid.worker';
import { kidMove } from './kid';
import { hashString, seededRng, testSeed } from './random';

/**
 * Levels 1–2. Runs kid.ts in a worker. If the worker cannot start (very old browsers),
 * the same code runs on the main thread: it takes only a few milliseconds.
 */
export class KidEngine implements Engine {
  private worker: Worker | null = null;
  private started = false;
  private nextId = 1;
  private pending = new Map<number, { resolve: (m: string) => void; reject: (e: Error) => void }>();
  private seed = testSeed();

  init(): Promise<void> {
    if (this.started) return Promise.resolve();
    this.started = true;
    try {
      const worker = new Worker(new URL('./kid.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (e: MessageEvent<KidResponse>) => {
        const p = this.pending.get(e.data.id);
        if (!p) return;
        this.pending.delete(e.data.id);
        if ('move' in e.data) p.resolve(e.data.move);
        else p.reject(new Error(e.data.error));
      };
      worker.onerror = (e) => {
        e.preventDefault();
        this.dropWorker();
      };
      this.worker = worker;
    } catch {
      this.worker = null;
    }
    return Promise.resolve();
  }

  /** In tests (`?seed=`) the same position always gets the same move. */
  private seedFor(fen: string): number {
    return this.seed !== undefined ? hashString(`${this.seed}|${fen}`) : Math.floor(Math.random() * 2 ** 32);
  }

  async bestMove(fen: string, level: number): Promise<string> {
    await this.init();
    const seed = this.seedFor(fen);
    const inline = () => kidMove(fen, level, seededRng(seed));
    const worker = this.worker;
    if (!worker) return inline();
    const id = this.nextId++;
    const request: KidRequest = { id, fen, level, seed };
    try {
      return await new Promise<string>((resolve, reject) => {
        this.pending.set(id, { resolve, reject });
        worker.postMessage(request);
      });
    } catch {
      return inline();
    }
  }

  private dropWorker() {
    this.worker?.terminate();
    this.worker = null;
    for (const p of this.pending.values()) p.reject(new Error('worker stopped'));
    this.pending.clear();
  }

  dispose(): void {
    this.dropWorker();
    this.started = false;
  }
}
