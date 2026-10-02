// A pretend relay for tests and development (`?transport=local`): tabs of the same browser share
// rooms. The document lives in localStorage, changes are announced on a BroadcastChannel, and every
// write goes through the same rules as Firebase (rules.ts). "No network" (navigator.onLine false,
// e.g. Playwright's setOffline) behaves like a lost connection: writes fail, updates are missed, and
// coming back online delivers the whole document again.
import { applyChanges, checkWrite, getPath, resolveDoc } from './rules';
import type { Changes, Transport, Watcher, WriteResult } from './transport';

const KEY = (code: string) => `chessit-room:${code}`;
/** A little delay, like a network round trip, so the UI shows its in-between states. */
const LATENCY_MS = 60;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class LocalTransport implements Transport {
  readonly kind = 'local' as const;
  private channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('chessit-rooms') : null;
  /** Watchers in this tab (a BroadcastChannel does not deliver to its own sender). */
  private local = new Set<(code: string) => void>();

  private online(): boolean {
    return navigator.onLine !== false;
  }

  private load(code: string): unknown {
    try {
      const raw = localStorage.getItem(KEY(code));
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  private announce(code: string) {
    this.channel?.postMessage({ code });
    for (const f of this.local) f(code);
  }

  async read(code: string): Promise<unknown> {
    await sleep(LATENCY_MS);
    if (!this.online()) throw new Error('offline');
    return this.load(code);
  }

  watch(code: string, w: Watcher): () => void {
    let stopped = false;
    let connected = false;
    w.link('connecting');
    const deliver = () => {
      if (!stopped && connected) w.doc(this.load(code));
    };
    const connect = () => {
      if (stopped || !this.online()) return;
      connected = true;
      w.link('online');
      deliver();
    };
    const onChange = (c: string) => c === code && deliver();
    const onBroadcast = (e: MessageEvent) => onChange((e.data as { code: string }).code);
    const onOffline = () => {
      connected = false;
      w.link('reconnecting');
    };
    const onOnline = () => setTimeout(connect, LATENCY_MS);
    this.local.add(onChange);
    this.channel?.addEventListener('message', onBroadcast);
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    setTimeout(() => (this.online() ? connect() : onOffline()), LATENCY_MS);
    return () => {
      stopped = true;
      this.local.delete(onChange);
      this.channel?.removeEventListener('message', onBroadcast);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }

  /**
   * Read, check and write in one step. Web Locks keep two tabs from interleaving.
   * `immediate` = right away, without the pretend latency: like fetch keepalive, it still lands when the
   * page is closing.
   */
  private async write(code: string, next: (before: unknown, now: number) => unknown, immediate = false): Promise<WriteResult> {
    if (!immediate) await sleep(LATENCY_MS);
    if (!this.online()) return 'offline';
    const run = (): WriteResult => {
      const before = this.load(code);
      const now = Date.now();
      const after = next(before, now);
      const why = checkWrite(code, before, after, now);
      if (why) {
        console.warn(`[room] rejected by the rules: ${why}`);
        return 'rejected';
      }
      if (after === null) localStorage.removeItem(KEY(code));
      else localStorage.setItem(KEY(code), JSON.stringify(after));
      return 'ok';
    };
    const result = navigator.locks && !immediate ? await navigator.locks.request(`chessit-room:${code}`, run) : run();
    if (result === 'ok') this.announce(code);
    return result;
  }

  create(code: string, doc: unknown): Promise<WriteResult> {
    return this.write(code, (_before, now) => resolveDoc(doc, now));
  }

  update(code: string, changes: Changes, opts?: { keepalive?: boolean }): Promise<WriteResult> {
    // On a missing room this makes a partial document, which the rules reject (like Firebase).
    return this.write(code, (before, now) => applyChanges(before, changes, now), opts?.keepalive);
  }

  remove(code: string): Promise<WriteResult> {
    return this.write(code, () => null);
  }

  /** Tests: the current document at a path. */
  peek(code: string, path = ''): unknown {
    return getPath(this.load(code), path);
  }
}
