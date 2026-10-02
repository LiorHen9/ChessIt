// A small stand-in for the Firebase Realtime Database REST API, for tests on a computer that cannot
// reach Firebase. It speaks the same protocol as the real thing for what the app uses:
//   GET  /rooms/<code>.json                  → the room (or null)
//   GET  … with Accept: text/event-stream    → Server-Sent Events: put / patch / keep-alive
//   PUT, PATCH (multi-path), DELETE          → checked against the same rules (src/net/rules.ts);
//                                              a refused write answers 401 {"error":"Permission denied"}
// plus test controls:
//   POST /__outage?ms=8000  → drop every stream and refuse everything for that long (relay down)
//   GET  /__state           → the whole store
//   ?access_token=test-admin → an admin (like the cleanup job's service account): rules are skipped,
//                              GET /rooms.json?orderBy="touched"&endAt=N and PATCH /rooms.json work
// Usage: bun tests/net/mock-firebase.ts [port]
import { applyChanges, checkWrite, resolveDoc } from '../../src/net/rules';

const port = Number(process.argv[2] ?? 9010);
const store = new Map<string, unknown>();
type Stream = { code: string; send: (event: string, data: unknown) => void; close: () => void };
const streams = new Set<Stream>();
let downUntil = 0;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': '*'
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const denied = () => json({ error: 'Permission denied' }, 401);

function notify(code: string, event: string, data: unknown) {
  for (const s of streams) if (s.code === code) s.send(event, data);
}

setInterval(() => {
  for (const s of streams) s.send('keep-alive', null);
}, 30000);

Bun.serve({
  port,
  idleTimeout: 0,
  async fetch(req) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (url.pathname === '/__outage') {
      downUntil = Date.now() + Number(url.searchParams.get('ms') ?? 8000);
      for (const s of [...streams]) s.close();
      return json({ down: true });
    }
    if (url.pathname === '/__state') return json(Object.fromEntries(store));
    if (Date.now() < downUntil) return new Response('relay down', { status: 503, headers: CORS });

    if (url.searchParams.get('access_token') === 'test-admin' && url.pathname === '/rooms.json') {
      if (req.method === 'GET') {
        if (url.searchParams.get('orderBy') !== '"touched"') return json({ error: 'orderBy must be defined when other query parameters are defined' }, 400);
        const endAt = Number(url.searchParams.get('endAt'));
        const out: Record<string, unknown> = {};
        for (const [code, room] of store) if (((room as { touched?: number }).touched ?? 0) <= endAt) out[code] = room;
        return json(out);
      }
      if (req.method === 'PATCH') {
        const body = (await req.json()) as Record<string, unknown>;
        for (const [code, v] of Object.entries(body)) {
          if (v !== null) return json({ error: 'only deletes here' }, 400);
          store.delete(code);
          notify(code, 'put', { path: '/', data: null });
        }
        return json(body);
      }
    }

    const m = /^\/rooms\/([^/]+)\.json$/.exec(url.pathname);
    if (!m) return denied(); // the root and /rooms cannot be read or written
    const code = m[1];
    const validCode = /^[ACDEFGHJKMNPQRTUVWXY3479]{5}$/.test(code);
    const now = Date.now();
    const before = store.get(code) ?? null;

    if (req.method === 'GET') {
      if (!validCode) return denied();
      if (req.headers.get('accept')?.includes('text/event-stream')) {
        let stream: Stream;
        const body = new ReadableStream({
          start(controller) {
            const enc = new TextEncoder();
            stream = {
              code,
              send: (event, data) => {
                try {
                  controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
                } catch {
                  streams.delete(stream);
                }
              },
              close: () => {
                streams.delete(stream);
                try {
                  controller.close();
                } catch {
                  // already closed
                }
              }
            };
            streams.add(stream);
            stream.send('put', { path: '/', data: store.get(code) ?? null });
          },
          cancel() {
            streams.delete(stream);
          }
        });
        return new Response(body, { headers: { ...CORS, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } });
      }
      return json(before);
    }

    const body = req.method === 'DELETE' ? null : await req.json().catch(() => undefined);
    if (body === undefined) return json({ error: 'Invalid data; couldn\'t parse JSON object.' }, 400);
    let after: unknown;
    if (req.method === 'PUT') after = resolveDoc(body, now);
    else if (req.method === 'PATCH') after = applyChanges(before, body as Record<string, unknown>, now);
    else if (req.method === 'DELETE') after = null;
    else return json({ error: 'method' }, 405);

    const why = checkWrite(code, before, after, now);
    if (why) {
      console.log(`[mock] ${req.method} ${code} refused: ${why}`);
      return denied();
    }
    if (after === null) store.delete(code);
    else store.set(code, after);

    if (req.method === 'PATCH') {
      // Firebase streams a multi-path update as one `patch` with the keys as written.
      const resolved = applyChanges({}, body as Record<string, unknown>, now);
      const data: Record<string, unknown> = {};
      for (const k of Object.keys(body as object)) {
        let v: unknown = resolved;
        for (const part of k.split('/')) v = (v as Record<string, unknown> | null)?.[part] ?? null;
        data[k] = v;
      }
      notify(code, 'patch', { path: '/', data });
    } else notify(code, 'put', { path: '/', data: after });
    return json(req.method === 'DELETE' ? null : after);
  }
});

console.log(`mock firebase on http://localhost:${port}`);
