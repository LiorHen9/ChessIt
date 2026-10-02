// The relay: Firebase Realtime Database through its REST API, with no library.
//  - Live updates: Server-Sent Events (EventSource) on rooms/<CODE>.json. Firebase sends `put`
//    (a value at a path; the first one is the whole room) and `patch` (several children at once),
//    plus `keep-alive` about every 30 seconds.
//  - Writes: fetch with PUT (create), PATCH (multi-path, atomic) and DELETE.
// Why not the official SDK: tens of KB even when modular, and this needs only a few calls.
// See "מצב חדר" in docs/ARCHITECTURE.md for the reconnect rules.
import { prune, setPath } from './rules';
import type { Changes, Transport, Watcher, WriteResult } from './transport';

const WRITE_TIMEOUT_MS = 12000;
/** No event at all (not even keep-alive) for this long → the stream is dead even if it looks open. */
const SILENT_MS = 75000;
/** Back from the background after this long → reconnect right away rather than trust the old stream. */
const STALE_AFTER_HIDDEN_MS = 30000;
const MAX_BACKOFF_MS = 15000;

export class FirebaseTransport implements Transport {
  readonly kind = 'firebase' as const;
  constructor(private base: string) {}

  private url(code: string): string {
    return `${this.base}/rooms/${code}.json`;
  }

  async read(code: string): Promise<unknown> {
    const res = await fetchWithTimeout(this.url(code), { cache: 'no-store' });
    if (res.status === 401 || res.status === 403) return null; // not a valid code: same as no room
    if (!res.ok) throw new Error(`read failed: ${res.status}`);
    return res.json();
  }

  watch(code: string, w: Watcher): () => void {
    let es: EventSource | null = null;
    let doc: unknown = null;
    let stopped = false;
    let attempt = 0;
    let retryTimer: number | undefined;
    let lastEvent = Date.now();
    let hiddenAt = 0;

    const reconnectSoon = (immediately = false) => {
      if (stopped) return;
      es?.close();
      es = null;
      w.link('reconnecting');
      clearTimeout(retryTimer);
      const delay = immediately ? 0 : Math.min(1000 * 2 ** attempt, MAX_BACKOFF_MS) * (0.75 + Math.random() * 0.5);
      attempt++;
      retryTimer = window.setTimeout(open, delay);
    };

    const onPut = (e: MessageEvent) => {
      lastEvent = Date.now();
      attempt = 0;
      const { path, data } = JSON.parse(e.data as string) as { path: string; data: unknown };
      doc = path === '/' ? data : prune(setPath(doc, path, data));
      w.link('online');
      w.doc(doc);
    };
    const onPatch = (e: MessageEvent) => {
      lastEvent = Date.now();
      const { path, data } = JSON.parse(e.data as string) as { path: string; data: Record<string, unknown> };
      for (const [k, v] of Object.entries(data ?? {})) doc = setPath(doc, `${path}/${k}`, v);
      doc = prune(doc);
      w.doc(doc);
    };

    const open = () => {
      if (stopped) return;
      if (navigator.onLine === false) {
        w.link('reconnecting');
        return; // the 'online' event reopens
      }
      lastEvent = Date.now();
      const source = new EventSource(this.url(code));
      es = source;
      source.addEventListener('put', onPut as EventListener);
      source.addEventListener('patch', onPatch as EventListener);
      source.addEventListener('keep-alive', () => (lastEvent = Date.now()));
      // The rules refused to stream this path (not a valid code): there is no such room.
      source.addEventListener('cancel', () => {
        source.close();
        w.doc(null);
      });
      source.onerror = () => {
        if (es === source) reconnectSoon();
      };
    };

    const watchdog = window.setInterval(() => {
      if (es && !document.hidden && Date.now() - lastEvent > SILENT_MS) reconnectSoon(true);
    }, 10000);
    const onVisibility = () => {
      if (document.hidden) {
        hiddenAt = Date.now();
        return;
      }
      // Phones often kill the stream in the background without telling the page.
      const away = hiddenAt ? Date.now() - hiddenAt : 0;
      if (!es || es.readyState !== EventSource.OPEN || away > STALE_AFTER_HIDDEN_MS || Date.now() - lastEvent > STALE_AFTER_HIDDEN_MS) {
        attempt = 0;
        reconnectSoon(true);
      }
    };
    const onOnline = () => {
      attempt = 0;
      reconnectSoon(true);
    };
    const onOffline = () => {
      es?.close();
      es = null;
      w.link('reconnecting');
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    w.link('connecting');
    open();
    return () => {
      stopped = true;
      es?.close();
      clearTimeout(retryTimer);
      clearInterval(watchdog);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }

  private async send(method: 'PUT' | 'PATCH' | 'DELETE', code: string, body?: unknown, keepalive = false): Promise<WriteResult> {
    if (navigator.onLine === false) return 'offline';
    try {
      const res = await fetchWithTimeout(this.url(code), {
        method,
        body: body === undefined ? undefined : JSON.stringify(body),
        keepalive
      });
      if (res.ok) return 'ok';
      // 401 "Permission denied": the rules said no (someone else's move came first, the room is gone…).
      if (res.status >= 400 && res.status < 500) return 'rejected';
      return 'offline'; // 5xx: try again later
    } catch {
      return 'offline';
    }
  }

  create(code: string, doc: unknown): Promise<WriteResult> {
    return this.send('PUT', code, doc);
  }

  update(code: string, changes: Changes, opts?: { keepalive?: boolean }): Promise<WriteResult> {
    return this.send('PATCH', code, changes, opts?.keepalive);
  }

  remove(code: string): Promise<WriteResult> {
    return this.send('DELETE', code);
  }
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), WRITE_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}
