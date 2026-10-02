// Deletes rooms that had no change for two hours (players who just closed the app).
// Runs hourly from .github/workflows/cleanup-rooms.yml; no dependencies, Node 18+.
//
// Needs a Firebase service account (FIREBASE_SERVICE_ACCOUNT, the JSON key, kept in GitHub Secrets –
// see docs/FIREBASE.md part ד). It signs in with that key (OAuth, RS256 JWT), reads only the rooms
// whose `touched` is older than the cutoff (orderBy + endAt, uses ".indexOn": ["touched"]), and
// deletes them in one multi-path update.
//
// Env:
//   FIREBASE_SERVICE_ACCOUNT  the key JSON (required, unless CLEANUP_TOKEN is given)
//   FIREBASE_DB_URL           optional; otherwise read from src/net/config.ts
//   CLEANUP_TOKEN             tests only: use this access token instead of signing in
//   IDLE_HOURS                default 2
import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';

const IDLE_MS = Number(process.env.IDLE_HOURS ?? 2) * 3600 * 1000;

function dbUrl() {
  if (process.env.FIREBASE_DB_URL) return process.env.FIREBASE_DB_URL.replace(/\/+$/, '');
  const src = readFileSync(new URL('../src/net/config.ts', import.meta.url), 'utf8');
  const m = /FIREBASE_DB_URL\s*=\s*'([^']*)'/.exec(src);
  return (m?.[1] ?? '').replace(/\/+$/, '');
}

const b64url = (s) => Buffer.from(s).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

async function accessToken() {
  if (process.env.CLEANUP_TOKEN) return process.env.CLEANUP_TOKEN;
  const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT ?? '');
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email',
      aud: sa.token_uri ?? 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 600
    })
  );
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  const sig = signer.sign(sa.private_key).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  const res = await fetch(sa.token_uri ?? 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${header}.${claims}.${sig}` })
  });
  if (!res.ok) throw new Error(`sign-in failed: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

async function main() {
  const db = dbUrl();
  if (!db) {
    console.log('No database address in src/net/config.ts yet: nothing to clean.');
    return;
  }
  if (!process.env.FIREBASE_SERVICE_ACCOUNT && !process.env.CLEANUP_TOKEN) {
    console.log('No FIREBASE_SERVICE_ACCOUNT secret: skipping (see docs/FIREBASE.md, part ד).');
    return;
  }
  const token = await accessToken();
  const cutoff = Date.now() - IDLE_MS;
  const q = new URLSearchParams({ orderBy: '"touched"', endAt: String(cutoff), access_token: token });
  const res = await fetch(`${db}/rooms.json?${q}`);
  if (!res.ok) throw new Error(`reading old rooms failed: ${res.status} ${await res.text()}`);
  const old = (await res.json()) ?? {};
  const codes = Object.keys(old).filter((c) => typeof old[c]?.touched !== 'number' || old[c].touched <= cutoff);
  if (codes.length === 0) {
    console.log('No rooms idle for', IDLE_MS / 3600000, 'hours.');
    return;
  }
  const del = await fetch(`${db}/rooms.json?${new URLSearchParams({ access_token: token })}`, {
    method: 'PATCH',
    body: JSON.stringify(Object.fromEntries(codes.map((c) => [c, null])))
  });
  if (!del.ok) throw new Error(`deleting failed: ${del.status} ${await del.text()}`);
  console.log(`Deleted ${codes.length} room(s) idle for ${IDLE_MS / 3600000}+ hours.`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
