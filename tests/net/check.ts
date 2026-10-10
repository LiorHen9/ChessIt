// Unit checks for rooms: room codes, message and document validation, the relay rules (TypeScript
// mirror of firebase/database.rules.json), the messages read from document changes, and the QR code
// (decoded with OpenCV when python3 + cv2 are available).
// Run: bun tests/net/check.ts   (without node_modules: bun --tsconfig-override=<tmp tsconfig> …)
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { CODE_ALPHABET, CODE_LENGTH, InvalidMessage, isRoomCode, parseMessage, parseRoomDoc, type RoomDoc } from '../../src/net/transport';
import { applyChanges, checkWrite, resolveDoc } from '../../src/net/rules';
import { messagesBetween, randomCode, replayMoves, startFenFor } from '../../src/net/room';
import { qrMatrix } from '../../src/net/qr';

let failures = 0;
let passes = 0;
const ok = (cond: unknown, what: string) => {
  if (cond) passes++;
  else {
    failures++;
    console.error('✗', what);
  }
};
const throws = (f: () => unknown, what: string) => {
  try {
    f();
    ok(false, `${what} (did not throw)`);
  } catch (e) {
    ok(e instanceof InvalidMessage, `${what} (threw ${e})`);
  }
};

// ---------- room codes ----------
ok(CODE_LENGTH === 5, 'code length 5');
ok(new Set(CODE_ALPHABET).size === CODE_ALPHABET.length, 'alphabet has no repeats');
for (const c of '0O1IL2Z5S8B6') ok(!CODE_ALPHABET.includes(c), `no look-alike "${c}" in the alphabet`);
ok(/^[A-Z0-9]+$/.test(CODE_ALPHABET), 'alphabet is uppercase letters and digits');
const seen = new Set<string>();
for (let i = 0; i < 2000; i++) {
  const c = randomCode();
  if (!isRoomCode(c)) ok(false, `random code valid: ${c}`);
  seen.add(c);
}
ok(seen.size > 1990, 'random codes rarely repeat');
const counts = new Map<string, number>();
for (const c of seen) for (const ch of c) counts.set(ch, (counts.get(ch) ?? 0) + 1);
ok(counts.size === CODE_ALPHABET.length, 'every character of the alphabet is used');
ok(isRoomCode('K7P2Q') === false, 'K7P2Q has a 2 (not in the alphabet)');
ok(isRoomCode('K7PXQ'), 'K7PXQ is a code');
ok(!isRoomCode('K7PX') && !isRoomCode('K7PXQA') && !isRoomCode('k7pxq') && !isRoomCode('K7PO0'), 'wrong length, lowercase, look-alikes');
console.log('✓ room codes: 5 characters from', CODE_ALPHABET.length, 'without look-alikes');

// ---------- messages ----------
ok(parseMessage({ type: 'move', uci: 'e2e4', ply: 0 }).type === 'move', 'move');
ok(parseMessage({ type: 'move', uci: 'e7e8q', ply: 9 }).type === 'move', 'promotion');
ok(parseMessage({ type: 'reaction', id: 'clap' }).type === 'reaction', 'reaction');
ok(parseMessage({ type: 'draw', action: 'offer' }).type === 'draw', 'draw offer');
ok(parseMessage({ type: 'join', name: 'סבא', avatar: '🦉', gender: 'boy' }).type === 'join', 'join');
for (const t of ['resign', 'rematch', 'leave']) ok(parseMessage({ type: t }).type === t, t);
throws(() => parseMessage(null), 'null');
throws(() => parseMessage('hello'), 'a string');
throws(() => parseMessage({ type: 'chat', text: 'hi' }), 'free chat is not a message');
throws(() => parseMessage({ type: 'reaction', id: 'poop' }), 'reaction not in the list');
throws(() => parseMessage({ type: 'reaction', id: 'clap', text: 'hi' }), 'extra field');
throws(() => parseMessage({ type: 'move', uci: 'e2e9', ply: 0 }), 'bad square');
throws(() => parseMessage({ type: 'move', uci: 'e2e4k', ply: 0 }), 'bad promotion');
throws(() => parseMessage({ type: 'move', uci: 'e2e4', ply: -1 }), 'negative ply');
throws(() => parseMessage({ type: 'move', uci: 'e2e4', ply: 1.5 }), 'fractional ply');
throws(() => parseMessage({ type: 'move', uci: 'e2e4' }), 'missing ply');
throws(() => parseMessage({ type: 'draw', action: 'maybe' }), 'bad draw action');
throws(() => parseMessage({ type: 'join', name: '', avatar: '🦉' }), 'empty name');
throws(() => parseMessage({ type: 'join', name: 'x'.repeat(25), avatar: '🦉' }), 'long name');
throws(() => parseMessage({ type: 'resign', by: 'host' }), 'resign with extra field');
console.log('✓ messages: valid ones pass, invalid ones throw');

// ---------- documents ----------
const T = 'AbCdEfGhIjKlMnOpQrStUv12';
const T2 = 'ZyXwVuTsRqPoNmLkJiHgFe98';
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const NOW = 1_800_000_000_000;
const SV = { '.sv': 'timestamp' };
const fresh = (): unknown =>
  resolveDoc(
    {
      v: 1,
      created: SV,
      touched: SV,
      seats: { host: { name: 'אבא', avatar: '🦁', ticket: T, seen: SV } },
      game: { round: 0, white: 'host', start: START, moves: '', ply: 0 }
    },
    NOW
  );
const doc0 = fresh();
ok(parseRoomDoc(doc0).seats.host.name === 'אבא', 'room document parses');
throws(() => parseRoomDoc({ ...(doc0 as object), chat: 'hi' }), 'document with an extra field');
throws(() => parseRoomDoc({ ...(doc0 as object), v: 2 }), 'document of another version');
throws(() => parseRoomDoc(applyChanges(doc0, { 'game/moves': 'e2e4' }, NOW)), 'moves without the trailing space');
throws(() => parseRoomDoc(applyChanges(doc0, { 'react/host': { id: 'clap', n: 1, text: 'x' } }, NOW)), 'reaction with text');
throws(() => parseRoomDoc(applyChanges(doc0, { 'seats/guest': { name: 'x', avatar: 'y', ticket: 'short', seen: 1 } }, NOW)), 'short ticket');
console.log('✓ room documents: checked field by field');

// ---------- rules ----------
const CODE = 'K7PXQ';
const allowed = (before: unknown, after: unknown, what: string, now = NOW) => ok(checkWrite(CODE, before, after, now) === null, `allowed: ${what} (${checkWrite(CODE, before, after, now)})`);
const refused = (before: unknown, after: unknown, what: string, now = NOW) => ok(checkWrite(CODE, before, after, now) !== null, `refused: ${what}`);
const patch = (d: unknown, ch: Record<string, unknown>, now = NOW) => applyChanges(d, { ...ch, touched: SV }, now);

allowed(null, doc0, 'create a room');
ok(checkWrite('K7P0Q', null, doc0, NOW) !== null, 'refused: code with a look-alike');
ok(checkWrite('ABC', null, doc0, NOW) !== null, 'refused: short code');
refused(doc0, resolveDoc({ ...(doc0 as object), created: SV }, NOW + 5), 'overwrite an existing room');
const guestSeat = { name: 'נועה', avatar: '🦄', gender: 'girl', ticket: T2, seen: SV };
const doc1 = patch(doc0, { 'seats/guest': guestSeat });
allowed(doc0, doc1, 'join as guest');
refused(doc1, patch(doc1, { 'seats/guest/ticket': T }), 'change a seat ticket');
refused(doc0, patch(doc0, { 'seats/third': guestSeat }), 'a third seat');
refused(doc0, patch(doc0, { 'seats/guest': { ...guestSeat, name: 'x'.repeat(25) } }), 'long name');
refused(doc0, patch(doc0, { chat: 'hello' }), 'unknown field');
refused(doc0, patch(doc0, { 'seats/host/note': 'hello' }), 'unknown seat field');
const m1 = patch(doc1, { 'game/moves': 'e2e4 ', 'game/ply': 1 });
allowed(doc1, m1, 'first move');
refused(doc1, patch(doc1, { 'game/moves': 'e2e4 ', 'game/ply': 2 }), 'ply jumps by 2');
refused(doc1, patch(doc1, { 'game/moves': 'e2e4 e7e5 ', 'game/ply': 1 }), 'two moves at once');
refused(doc1, patch(doc1, { 'game/moves': 'e2e4', 'game/ply': 1 }), 'move without the space');
refused(doc1, patch(doc1, { 'game/moves': 'hello ', 'game/ply': 1 }), 'not a move');
refused(m1, patch(m1, { 'game/moves': 'd2d4 e7e5 ', 'game/ply': 2 }), 'rewrite an earlier move');
// Two phones send a move for the same ply: the first lands, the second is refused.
const a = patch(m1, { 'game/moves': 'e2e4 e7e5 ', 'game/ply': 2 });
const b = patch(m1, { 'game/moves': 'e2e4 c7c5 ', 'game/ply': 2 });
allowed(m1, a, 'move 2 (first phone)');
refused(a, applyChanges(a, { 'game/moves': 'e2e4 c7c5 ', 'game/ply': 2, touched: SV }, NOW), 'move 2 again (second phone, same ply)');
void b;
allowed(a, patch(a, { 'game/moves': 'e2e4 ', 'game/ply': 1 }), 'cut back (repair after an illegal move)');
refused(a, patch(a, { 'game/moves': 'd2d4 ', 'game/ply': 1 }), 'cut back to something else');
const ended = patch(a, { 'game/end': { reason: 'resign', by: 'guest' } });
allowed(a, ended, 'resign');
refused(ended, patch(ended, { 'game/moves': 'e2e4 e7e5 g1f3 ', 'game/ply': 3 }), 'move after resigning');
refused(a, patch(a, { 'game/end': { reason: 'timeout', by: 'guest' } }), 'unknown end reason');
allowed(a, patch(a, { 'game/draw': 'host' }), 'draw offer');
allowed(a, patch(a, { 'react/host': { id: 'fire', n: 3 } }), 'reaction');
refused(a, patch(a, { 'react/host': { id: 'kiss', n: 3 } }), 'reaction not in the list');
refused(a, patch(a, { 'react/host': { id: 'fire', n: 3, text: 'hi' } }), 'reaction with text');
const next = patch(ended, { game: { round: 1, white: 'guest', start: START, moves: '', ply: 0 } });
allowed(ended, next, 'next round (colours swap)');
refused(ended, patch(ended, { game: { round: 3, white: 'guest', start: START, moves: '', ply: 0 } }), 'skip a round');
refused(ended, patch(ended, { game: { round: 1, white: 'guest', start: START, moves: 'e2e4 ', ply: 1 } }), 'next round with moves');
refused(a, patch(a, { 'game/white': 'guest' }), 'swap colours mid-game');
refused(a, patch(a, { 'hc': { seat: 'host', pieces: 'q,k' } }), 'remove the king (handicap)');
allowed(a, patch(a, { 'hc': { seat: 'host', pieces: 'q,ra' } }), 'handicap pieces');
refused(a, applyChanges(a, { touched: NOW + 60000 }, NOW), 'time in the future');
// Deleting
refused(a, null, 'delete while both are in the room');
const hostLeft = patch(a, { 'seats/host/left': true });
refused(hostLeft, null, 'delete while the guest is still there');
const bothLeft = patch(hostLeft, { 'seats/guest/left': true });
allowed(bothLeft, null, 'delete after both left');
allowed(patch(doc0, { 'seats/host/left': true }), null, 'delete a room nobody joined, after the host left');
allowed(a, null, 'delete a room idle for two hours', NOW + 2 * 3600 * 1000 + 1000);
// The JSON rules file is valid and uses the same alphabet.
const rulesText = readFileSync(new URL('../../firebase/database.rules.json', import.meta.url), 'utf8');
const rules = JSON.parse(rulesText);
ok(rules.rules.rooms.$code['.read'].includes(`[${CODE_ALPHABET}]`), 'database.rules.json uses the same code alphabet');
ok(!('.read' in rules.rules.rooms), 'rooms itself cannot be read (no listing)');
ok(!/\{\d/.test(rulesText), 'no {n,m} quantifiers (Firebase rules regex does not support them)');
console.log('✓ rules: create, join, one move at a time, two phones racing, end, rematch, delete');

// ---------- messages from document changes ----------
const d1 = parseRoomDoc(doc1);
const da = parseRoomDoc(a);
const mm = messagesBetween(parseRoomDoc(m1), da);
ok(mm.length === 1 && mm[0].type === 'move' && mm[0].from === 'guest' && (mm[0] as { uci: string }).uci === 'e7e5', 'black move from guest: ' + JSON.stringify(mm));
const joined = messagesBetween(parseRoomDoc(doc0), d1);
ok(joined.some((m) => m.type === 'join' && m.from === 'guest'), 'join');
const reacted = messagesBetween(da, parseRoomDoc(patch(a, { 'react/host': { id: 'clap', n: 1 } })));
ok(reacted.length === 1 && reacted[0].type === 'reaction' && reacted[0].from === 'host', 'reaction');
const offered = parseRoomDoc(patch(a, { 'game/draw': 'host' }));
ok(messagesBetween(da, offered).some((m) => m.type === 'draw' && m.action === 'offer' && m.from === 'host'), 'draw offer');
ok(messagesBetween(offered, da).some((m) => m.type === 'draw' && m.action === 'decline' && m.from === 'guest'), 'draw declined');
ok(messagesBetween(da, parseRoomDoc(ended)).some((m) => m.type === 'resign' && m.from === 'guest'), 'resign');
console.log('✓ messages read from document changes (join, move, reaction, draw, resign)');

// ---------- replay, handicap ----------
ok(replayMoves(START, ['e2e4', 'e7e5', 'e2e5']).legal === 2, 'replay stops at an illegal move');
ok(replayMoves(START, ['e2e4', 'e2e4']).legal === 1, 'same move twice is illegal');
ok(startFenFor('host', { seat: 'host', pieces: 'q' }).startsWith('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNB1KBNR'), 'handicap: host is white, no white queen');
ok(startFenFor('guest', { seat: 'host', pieces: 'q' }).startsWith('rnb1kbnr/'), 'handicap after colours swap: host is black, no black queen');
console.log('✓ replay and handicap starts');

// ---------- QR ----------
const link = 'https://chessit-liorhen9.web.app/?room=K7PXQ';
const m = qrMatrix(link);
ok(m.length === 33, `room link is a version 4 QR (${m.length})`);
const dir = mkdtempSync(join(tmpdir(), 'qr-'));
const texts = [link, 'HELLO', 'x'.repeat(150), 'שלום https://example.com/?a=1&b=2'];
writeFileSync(join(dir, 'm.json'), JSON.stringify(texts.map((t) => ({ t, m: qrMatrix(t).map((r) => r.map(Number)) }))));
const py = spawnSync(
  'python3',
  [
    '-c',
    `import json,sys,numpy as np,cv2
d=json.load(open(sys.argv[1]));det=cv2.QRCodeDetector()
for x in d:
  m=np.array(x['m'],dtype=np.uint8);n=m.shape[0];img=np.ones((n+8,n+8),np.uint8)*255;img[4:4+n,4:4+n]=(1-m)*255
  img=cv2.resize(img,((n+8)*8,(n+8)*8),interpolation=cv2.INTER_NEAREST);v,_,_=det.detectAndDecode(img);print('OK' if v==x['t'] else 'FAIL')`,
    join(dir, 'm.json')
  ],
  { encoding: 'utf8' }
);
if (py.status === 0) {
  const lines = py.stdout.trim().split('\n');
  ok(lines.length === texts.length && lines.every((l) => l === 'OK'), 'QR codes decode: ' + lines.join(','));
  console.log('✓ QR: the room link and other texts decode with OpenCV');
} else console.log('… QR decode skipped (no python3 + cv2):', py.stderr.split('\n').slice(-2).join(' '));

console.log(failures ? `\n${failures} failed, ${passes} passed` : `\nall ${passes} checks passed`);
process.exit(failures ? 1 : 0);
