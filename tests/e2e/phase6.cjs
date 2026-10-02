const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { spawn, execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
// Usage: node tests/e2e/phase6.cjs <screenshots-dir> [url]
// Rooms (two phones), at phone size.
// Part 1–3 use the pretend relay (?transport=local: two tabs of one browser share rooms through
// localStorage + BroadcastChannel, with the same rules as Firebase):
// - opening a room shows the code and a QR that decodes to the room link; joining by typing the code
//   (a wrong code first) and by opening the link (?room=);
// - a short game to mate: moves show on both pages, each board from its own side; a reaction;
//   an illegal move written straight to the relay is rejected by both phones (and an invalid
//   message throws before it is sent); closing a page and coming back syncs the moves made
//   meanwhile; a refresh in the middle comes back to the room; no network: "אין אינטרנט" and the
//   board waits, then everything continues;
// - rematch (colours swap), draw offer declined, resign, leaving (the last one out deletes the room);
// - parent-child mode in a room, the same profile in two tabs sending a move at once (one wins),
//   a third player gets "full", and "צריך אינטרנט" when there is no network (the rest works offline);
// Part 4 runs the Firebase transport (REST + Server-Sent Events) against a local stand-in relay
// (tests/net/mock-firebase.ts, needs bun): create, join, moves, a relay outage ("מתחבר…") and
// recovery, resign and leave.
const SHOTS = process.argv[2] || '.';
const BASE = process.argv[3] || 'http://localhost:4173/';
const LOCAL = BASE + '?transport=local';
const MOCK_PORT = 9010;
const FILES = 'abcdefgh';

const step = (s) => console.log('✓', s);
const expect = (cond, msg) => {
  if (!cond) throw new Error(msg);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function decodeQr(png) {
  const out = execFileSync(
    'python3',
    ['-c', 'import sys,cv2;img=cv2.imread(sys.argv[1]);v,_,_=cv2.QRCodeDetector().detectAndDecode(img);print(v)', png],
    { encoding: 'utf8' }
  );
  return out.trim();
}

(async () => {
  const b = await chromium.launch();
  const errors = [];
  const pages = [];
  const watch = (p, name) => {
    p.on('pageerror', (e) => errors.push(`${name} pageerror: ${e}`));
    p.on('console', (m) => {
      const t = m.text();
      if (m.type() !== 'error' && m.type() !== 'warning') return;
      if (t.includes('ERR_TUNNEL') || t.includes('fonts.g') || t.includes('[room] rejected by the rules') || t.includes('ERR_INTERNET_DISCONNECTED'))
        return;
      if (t.includes('ERR_CONNECTION_REFUSED') || t.includes('503') || t.includes('Failed to load resource')) return; // relay outage (part 4)
      errors.push(`${name}: ${t}`);
    });
  };
  const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 };
  const ctx = await b.newContext(PHONE);

  async function open(url, name) {
    const p = await ctx.newPage();
    watch(p, name);
    pages.push(p);
    await p.goto(url);
    return p;
  }

  const helpers = (p) => {
    const orientation = () => p.$eval('main svg.board', (s) => s.dataset.orientation);
    const center = async (sq) => {
      const box = await (await p.$('main svg.board')).boundingBox();
      const o = await orientation();
      const f = FILES.indexOf(sq[0]);
      const r = Number(sq[1]);
      const col = o === 'w' ? f : 7 - f;
      const row = o === 'w' ? 8 - r : r - 1;
      return { x: box.x + (col + 0.5) * (box.width / 8), y: box.y + (row + 0.5) * (box.height / 8) };
    };
    const tap = async (sq) => {
      const c = await center(sq);
      await p.mouse.click(c.x, c.y);
      await p.waitForTimeout(90);
    };
    const pieceAt = (sq) =>
      p.evaluate((sq) => {
        const svg = document.querySelector('main svg.board');
        const o = svg.dataset.orientation;
        const f = 'abcdefgh'.indexOf(sq[0]);
        const r = Number(sq[1]);
        const x = (o === 'w' ? f : 7 - f) * 100 + 4;
        const y = (o === 'w' ? 8 - r : r - 1) * 100 + 4;
        const g = [...svg.querySelectorAll('g.piece')].find((g) => {
          const u = g.querySelector('use');
          return Number(u.getAttribute('x')) === x && Number(u.getAttribute('y')) === y;
        });
        return g ? g.dataset.piece : null;
      }, sq);
    const waitPiece = async (sq, piece, what) => {
      for (let i = 0; i < 60; i++) {
        if ((await pieceAt(sq)) === piece) return;
        await p.waitForTimeout(100);
      }
      throw new Error(`${what}: expected ${piece} on ${sq}, found ${await pieceAt(sq)}`);
    };
    const move = async (uci) => {
      await p.waitForSelector('main svg.board.is-live', { timeout: 8000 });
      await tap(uci.slice(0, 2));
      await tap(uci.slice(2, 4));
      await p.waitForTimeout(250);
    };
    const status = () => p.$eval('[data-testid="room-status"]', (e) => e.textContent);
    const waitStatus = async (re, what) => {
      for (let i = 0; i < 100; i++) {
        const s = await status().catch(() => '');
        if (re.test(s)) return s;
        await p.waitForTimeout(100);
      }
      throw new Error(`${what}: status is "${await status().catch(() => '?')}"`);
    };
    const room = (fn, arg) => p.evaluate(fn, arg);
    const shot = (n, full = false) => p.screenshot({ path: `${SHOTS}/${n}.png`, fullPage: full });
    return { orientation, tap, pieceAt, waitPiece, move, status, waitStatus, room, shot };
  };

  async function createProfile(p, name, age, gender, waitHome = true) {
    await p.waitForSelector('.form');
    await p.fill('input.input', name);
    await p.click(`.seg:has-text("${age}")`);
    await p.click(`.seg:has-text("${gender}")`);
    await p.click('button[type=submit]');
    if (waitHome) await p.waitForSelector('.home-head');
  }

  async function ensureProfile(p, name) {
    await p.waitForSelector('.home-head, .profile-grid');
    if (await p.$('.home-head')) {
      if ((await p.$eval('.who-name', (e) => e.textContent)) === name) return;
      await p.click('.who');
    }
    await p.click(`.profile-pick:has-text("${name}")`);
    await p.waitForSelector('.home-head');
  }

  async function typeCode(p, code) {
    for (const c of code) await p.click(`.code-key[data-key="${c}"]`);
  }

  // =============================== Part 1: a game between two tabs ===============================
  const A = await open(LOCAL, 'A');
  const a = helpers(A);
  await createProfile(A, 'אבא', '13+', 'בן');
  expect(!(await A.$('text=בקרוב')), 'no "coming soon" on home');
  expect(await A.$('[data-testid="home-room"]'), 'room card on home');

  // A local game on one phone, so we can check it lives next to the open room.
  await A.click('.action-primary');
  await A.click('text=יוצאים לדרך!');
  await A.waitForSelector('main svg.board');
  await a.tap('e2');
  await a.tap('e4');
  await A.click('.btn-back');
  await A.waitForSelector('.home-head');
  expect(await A.$('.action-resume:has-text("המשך המשחק")'), 'local game saved');

  await A.click('[data-testid="home-room"]');
  await A.waitForSelector('[data-testid="room-create"]');
  await a.shot('01-room-menu');
  await A.click('[data-testid="room-create"]');
  await A.waitForSelector('[data-testid="room-open"]');
  expect(await A.$('text=רק השם, האווטאר והמסעים עוברים'), 'privacy line on the create screen');
  await A.click('.seg[data-color="w"]');
  await a.shot('02-room-create', true);
  await A.click('[data-testid="room-open"]');
  await A.waitForSelector('[data-testid="room-code"]');
  const code = (await A.$eval('[data-testid="room-code"]', (e) => e.textContent)).trim();
  expect(/^[ACDEFGHJKMNPQRTUVWXY3479]{5}$/.test(code), 'room code: ' + code);
  expect((await A.$eval('[data-testid="room-code"]', (e) => e.getAttribute('dir'))) === 'ltr', 'code shown left-to-right');
  await A.waitForSelector('[data-testid="room-qr"] path');
  await a.shot('03-room-waiting', true);
  const qrPng = path.join(SHOTS, 'qr-only.png');
  await (await A.$('[data-testid="room-qr"]')).screenshot({ path: qrPng });
  const qrText = decodeQr(qrPng);
  expect(qrText.includes(`room=${code}`) && qrText.startsWith(BASE.replace(/\/$/, '')), 'QR decodes to the room link: ' + qrText);
  expect(await A.$('text=מחכים לשחקן השני'), 'waiting for the other player');
  step(`room opened: code ${code} (LTR), QR decodes to ${qrText}, waiting animation`);

  const B = await open(LOCAL, 'B');
  const bb = helpers(B);
  await B.waitForSelector('.home-head');
  await B.click('.who');
  await B.click('text=+ פרופיל חדש');
  await createProfile(B, 'נועה', '8–12', 'בת');
  await B.click('[data-testid="home-room"]');
  await B.click('[data-testid="room-join"]');
  await B.waitForSelector('[data-testid="code-slots"]');
  await typeCode(B, 'AAAAA');
  await B.waitForSelector('[data-testid="join-error"]');
  expect((await B.textContent('[data-testid="join-error"]')).includes('לא מצאנו'), 'wrong code: not found');
  await typeCode(B, code.slice(0, 3));
  await bb.shot('04-join-keypad');
  await typeCode(B, code.slice(3));
  await B.waitForSelector('main svg.board');
  await A.waitForSelector('main svg.board');
  expect((await a.orientation()) === 'w' && (await bb.orientation()) === 'b', 'each board from its own side');
  await a.waitStatus(/תורך/, 'A to move');
  await bb.waitStatus(/התור של אבא/, 'B waits for אבא');
  step('joined by code (after a wrong code): A plays white from below, B black from below');

  await a.move('e2e4');
  await bb.waitPiece('e4', 'wP', 'B sees e4');
  await A.click('.reaction-btn[data-reaction="clap"]');
  await B.waitForSelector('[data-testid="bubble-them"]');
  expect((await B.textContent('[data-testid="bubble-them"]')).includes('👏'), 'B sees the clap next to אבא');
  await A.waitForSelector('[data-testid="bubble-me"]');
  await B.waitForTimeout(500); // the bubble has popped in
  await bb.shot('05-reaction-black-side');
  await a.shot('05-reaction-white-side');
  await bb.move('e7e5');
  await a.waitPiece('e5', 'bP', 'A sees e5');
  step('moves show on both pages; a reaction appears next to the sender');

  // An illegal move written straight to the relay (format is fine, so the rules let it through).
  const injected = await a.room(async () => {
    const c = window.__chessitRoom;
    const d = c.transport.peek(c.code);
    return c.transport.update(c.code, { 'game/moves': d.game.moves + 'e1e3 ', 'game/ply': d.game.ply + 1 });
  });
  expect(injected === 'ok', 'injected write landed: ' + injected);
  await A.waitForSelector('.feedback.is-bad:has-text("לא חוקי")');
  await B.waitForSelector('.feedback.is-bad:has-text("לא חוקי")');
  await A.waitForTimeout(500);
  expect((await a.room(() => window.__chessitRoom.transport.peek(window.__chessitRoom.code, 'game/ply'))) === 2, 'relay repaired back to 2 moves');
  expect((await a.pieceAt('e1')) === 'wK' && !(await a.pieceAt('e3')), 'king still on e1');
  const invalid = await a.room(async () => {
    try {
      await window.__chessitRoom.send({ type: 'move', uci: 'z9z9', ply: 2 });
      return 'sent';
    } catch (e) {
      return e.message;
    }
  });
  expect(invalid === 'bad uci', 'invalid message throws: ' + invalid);
  const skip = await a.room(() => {
    const c = window.__chessitRoom;
    const d = c.transport.peek(c.code);
    return c.transport.update(c.code, { 'game/moves': d.game.moves + 'g1f3 b8c6 ', 'game/ply': d.game.ply + 2 });
  });
  expect(skip === 'rejected', 'two moves at once refused by the rules: ' + skip);
  await a.shot('06-illegal-rejected');
  step('illegal move injected into the relay: both phones reject it and the list is cut back; invalid messages throw; ply+2 refused');

  // Close B; A moves; B comes back and is in sync.
  await B.close();
  await a.waitStatus(/תורך/, 'A to move');
  await a.move('f1c4');
  await A.waitForSelector('.presence[data-presence="away"]', { timeout: 5000 });
  await a.waitStatus(/נועה לא מחוברת/, 'A sees B is away');
  await a.shot('07-opponent-away');
  const B2 = await open(LOCAL, 'B2');
  const b2 = helpers(B2);
  await ensureProfile(B2, 'נועה');
  await B2.waitForSelector('[data-testid="home-room-resume"]');
  expect((await B2.textContent('[data-testid="home-room-resume"]')).includes(code), 'home offers to go back to the room');
  await b2.shot('07b-home-room-resume');
  await B2.click('[data-testid="home-room-resume"]');
  await B2.waitForSelector('main svg.board');
  await b2.waitPiece('c4', 'wB', 'B sees the move made while away');
  await A.waitForSelector('.presence', { state: 'detached', timeout: 25000 });
  step('closing a page and coming back: "חזרה לחדר", full sync (Bc4 made meanwhile), presence back');

  await b2.move('b8c6');
  await a.waitPiece('c6', 'bN', 'A sees Nc6');
  await A.reload();
  await ensureProfile(A, 'אבא');
  expect(await A.$('.action-resume:has-text("המשך המשחק")'), 'local saved game still there');
  expect(await A.$('[data-testid="home-room-resume"]'), 'and the open room');
  await A.click('[data-testid="home-room-resume"]');
  await A.waitForSelector('main svg.board');
  await a.waitPiece('c6', 'bN', 'after refresh A sees Nc6');
  expect((await a.pieceAt('c4')) === 'wB' && (await a.pieceAt('e4')) === 'wP', 'whole position back');
  step('refresh in the middle: home shows both the local game and the room; back in the room, in sync');

  await a.move('d1h5');
  await b2.waitPiece('h5', 'wQ', 'B sees Qh5');
  await ctx.setOffline(true);
  await B2.waitForSelector('.link-chip[data-link="offline"]');
  await b2.waitStatus(/אין אינטרנט/, 'B offline');
  expect(!(await B2.$('main svg.board.is-live')), 'board waits while offline');
  await b2.shot('08-offline');
  await ctx.setOffline(false);
  await B2.waitForSelector('.link-chip[data-link="online"]');
  await b2.move('g8f6');
  await a.waitPiece('f6', 'bN', 'A sees Nf6');
  await a.move('h5f7');
  await A.waitForSelector('[data-testid="room-result"]');
  await B2.waitForSelector('[data-testid="room-result"]');
  expect((await A.textContent('[data-testid="room-result"]')).includes('ניצחת'), 'A won');
  expect((await B2.textContent('[data-testid="room-result"]')).includes('אבא ניצח'), 'B sees אבא won');
  await a.shot('09-mate-winner');
  await b2.shot('09-mate-loser');
  step('no network: "אין אינטרנט", board waits, then the game goes on; mate shows on both phones');

  // Rematch: colours swap.
  await A.click('[data-testid="room-again"]');
  await A.waitForSelector('text=למשחק חוזר');
  await B2.waitForSelector('text=אבא רוצה משחק חוזר');
  await B2.click('[data-testid="room-again"]');
  await A.waitForSelector('[data-testid="room-result"]', { state: 'detached' });
  await B2.waitForSelector('[data-testid="room-result"]', { state: 'detached' });
  for (let i = 0; i < 30 && (await a.orientation()) !== 'b'; i++) await A.waitForTimeout(100);
  expect((await a.orientation()) === 'b' && (await b2.orientation()) === 'w', 'colours swapped');
  await b2.move('d2d4');
  await a.waitPiece('d4', 'wP', 'A sees d4');
  await a.move('d7d5');
  await b2.waitPiece('d5', 'bP', 'B sees d5');
  await B2.click('[data-testid="room-draw"]');
  await A.waitForSelector('[data-testid="draw-offer"]');
  expect((await A.textContent('[data-testid="draw-offer"]')).includes('נועה מציעה תיקו'), 'draw offer text');
  await a.shot('10-draw-offer');
  await A.click('[data-testid="draw-offer"] .btn-secondary');
  await B2.waitForSelector('text=הצעת תיקו. מחכים לתשובה', { state: 'detached' });
  await B2.click('[data-testid="room-resign"]');
  await B2.click('.btn-danger:has-text("להיכנע")');
  await A.waitForSelector('[data-testid="room-result"]');
  expect((await A.textContent('[data-testid="room-result"]')).includes('נועה נכנעה'), 'A sees the resignation');
  step('rematch swaps colours; draw offer declined; resignation ends the game on both phones');

  await A.click('[data-testid="room-leave"]');
  await A.waitForSelector('.home-head');
  expect(!(await A.$('[data-testid="home-room-resume"]')), 'no open room after leaving');
  const stats = await A.textContent('.stats');
  expect(stats.includes('2 משחקים') && stats.includes('2 ניצחונות'), 'A stats: ' + stats);
  await B2.waitForSelector('[data-testid="room-result"]:has-text("אבא יצא מהחדר")');
  await B2.click('[data-testid="room-leave"]');
  await B2.waitForSelector('.home-head');
  await B2.waitForTimeout(300);
  expect((await B2.evaluate((c) => localStorage.getItem('chessit-room:' + c), code)) === null, 'room deleted when the last one left');
  const bStats = await B2.textContent('.stats');
  expect(bStats.includes('2 משחקים') && !bStats.includes('ניצחונות ·') && bStats.includes('0 ניצחונות'), 'B stats: ' + bStats);
  step('leaving: home has no open room, stats counted once per game, the last one out deletes the room');

  // ======================= Part 2: link, parent-child, two tabs, a full room =======================
  await A.click('[data-testid="home-room"]');
  await A.click('[data-testid="room-create"]');
  await A.click('.seg[data-color="w"]');
  await A.check('.handicap .toggle input');
  await A.click('[data-testid="room-open"]');
  await A.waitForSelector('[data-testid="room-code"]');
  const code2 = (await A.$eval('[data-testid="room-code"]', (e) => e.textContent)).trim();
  const link2 = `${BASE}?room=${code2}&transport=local`;
  const B3 = await open(link2, 'B3');
  const b3 = helpers(B3);
  await B3.waitForSelector('.profile-grid');
  await B3.click('.profile-pick:has-text("נועה")');
  await B3.waitForSelector('main svg.board');
  await A.waitForSelector('main svg.board');
  expect(!(await B3.evaluate(() => location.search.includes('room='))), 'room param removed from the address');
  expect((await a.pieceAt('d1')) === null && (await a.pieceAt('e1')) === 'wK', 'parent-child: אבא plays without the queen');
  expect((await b3.pieceAt('d8')) === 'bQ', 'נועה keeps her queen');
  await b3.shot('11-handicap-black');
  step('joined by link (?room=, after choosing the profile); parent-child mode: the white queen is gone');

  // The same profile in a second tab: both are the host; two different moves at once → one lands.
  const A2 = await open(link2, 'A2');
  const a2 = helpers(A2);
  await A2.waitForSelector('.profile-grid');
  await A2.click('.profile-pick:has-text("אבא")');
  await A2.waitForSelector('main svg.board');
  expect((await a2.orientation()) === 'w', 'second tab is the host too');
  const results = await Promise.all([
    a.room(() => window.__chessitRoom.send({ type: 'move', uci: 'e2e4', ply: 0 })),
    a2.room(() => window.__chessitRoom.send({ type: 'move', uci: 'd2d4', ply: 0 }))
  ]);
  expect(results.filter((r) => r === 'ok').length === 1 && results.includes('rejected'), 'one move wins: ' + results);
  await A.waitForTimeout(600);
  const plies = await a.room(() => window.__chessitRoom.transport.peek(window.__chessitRoom.code, 'game/moves'));
  expect(plies === 'e2e4 ' || plies === 'd2d4 ', 'exactly one move in the room: ' + plies);
  const pawn = plies.slice(2, 4);
  await a.waitPiece(pawn, 'wP', 'tab 1 consistent');
  await a2.waitPiece(pawn, 'wP', 'tab 2 consistent');
  await b3.waitPiece(pawn, 'wP', 'guest consistent');
  step(`same profile in two tabs sending different moves at once: one lands (${plies.trim()}), all three boards agree`);

  const C = await open(LOCAL, 'C');
  await C.waitForSelector('.home-head');
  await C.click('.who');
  await C.click('text=+ פרופיל חדש');
  await createProfile(C, 'סבא', '13+', 'בן');
  await C.click('[data-testid="home-room"]');
  await C.click('[data-testid="room-join"]');
  await typeCode(C, code2);
  await C.waitForSelector('[data-testid="join-error"]');
  expect((await C.textContent('[data-testid="join-error"]')).includes('כבר יש שני שחקנים'), 'third player: room is full');
  step('a third player gets "בחדר הזה כבר יש שני שחקנים"');

  // No network at all.
  await ctx.setOffline(true);
  await C.click('.btn-back');
  await C.click('[data-testid="room-create"]');
  await C.click('[data-testid="room-open"]');
  await C.waitForSelector('[data-testid="room-offline"]');
  expect((await C.textContent('[data-testid="room-offline"]')).includes('צריך אינטרנט כדי לשחק בחדר'), 'offline message');
  await helpers(C).shot('12-no-network');
  await C.click('[data-testid="room-offline"] .btn-secondary');
  await C.waitForSelector('.home-head');
  await C.click('.action-learn');
  await C.waitForSelector('.map');
  await ctx.setOffline(false);
  step('no network: "צריך אינטרנט כדי לשחק בחדר", and the learning map still opens');

  // Dark mode screenshot of a game in a themed profile (נועה = forest).
  await B3.emulateMedia({ colorScheme: 'dark' });
  await A.click('.reaction-btn[data-reaction="heart"]');
  await B3.waitForSelector('[data-testid="bubble-them"]');
  await B3.waitForTimeout(500);
  await b3.shot('13-dark-forest-reaction');
  await B3.emulateMedia({ colorScheme: 'light' });
  for (const p of [A2, C]) await p.close();

  // ===================== Part 4: the Firebase transport against a local relay =====================
  let mock = null;
  try {
    mock = spawn('bun', [path.join(__dirname, '../net/mock-firebase.ts'), String(MOCK_PORT)], { stdio: ['ignore', 'pipe', 'pipe'] });
    process.on('exit', () => mock.kill());
    mock.stdout.on('data', () => {});
    mock.stderr.on('data', (d) => process.stderr.write(String(d)));
    for (let i = 0; i < 50; i++) {
      try {
        const r = await fetch(`http://localhost:${MOCK_PORT}/__state`);
        if (r.ok) break;
      } catch {}
      await sleep(100);
    }
  } catch (e) {
    console.log('… part 4 skipped (no bun):', e.message);
    mock = null;
  }
  if (mock) {
    const FB = `${BASE}?db=http://localhost:${MOCK_PORT}`;
    const c1 = await b.newContext(PHONE);
    const c2 = await b.newContext(PHONE);
    const F1 = await c1.newPage();
    const F2 = await c2.newPage();
    watch(F1, 'F1');
    watch(F2, 'F2');
    const f1 = helpers(F1);
    const f2 = helpers(F2);
    await F1.goto(FB);
    await createProfile(F1, 'סבא', '13+', 'בן');
    await F1.click('[data-testid="home-room"]');
    await F1.click('[data-testid="room-create"]');
    await F1.click('.seg[data-color="b"]');
    await F1.click('[data-testid="room-open"]');
    await F1.waitForSelector('[data-testid="room-code"]');
    const fcode = (await F1.$eval('[data-testid="room-code"]', (e) => e.textContent)).trim();
    const state = await (await fetch(`http://localhost:${MOCK_PORT}/__state`)).json();
    expect(state[fcode]?.seats?.host?.name === 'סבא' && typeof state[fcode].created === 'number', 'room stored in the relay with a server time');
    await F2.goto(`${BASE}?room=${fcode}&db=http://localhost:${MOCK_PORT}`);
    await createProfile(F2, 'יואב', '5–7', 'בן', false); // a new phone: straight from the profile to the room
    await F2.waitForSelector('main svg.board');
    await F1.waitForSelector('main svg.board');
    expect((await f1.orientation()) === 'b' && (await f2.orientation()) === 'w', 'Firebase: sides');
    await f2.move('e2e4');
    await f1.waitPiece('e4', 'wP', 'Firebase: F1 sees e4');
    await f1.move('e7e5');
    await f2.waitPiece('e5', 'bP', 'Firebase: F2 sees e5');
    step('Firebase transport (SSE + PATCH) against the local relay: create, join from a new phone by link, moves both ways');

    await fetch(`http://localhost:${MOCK_PORT}/__outage?ms=7000`, { method: 'POST' });
    await F2.waitForSelector('.link-chip[data-link="reconnecting"]', { timeout: 8000 });
    await f2.waitStatus(/מתחבר מחדש/, 'F2 reconnecting');
    await f2.shot('14-reconnecting');
    await F1.waitForSelector('.link-chip[data-link="reconnecting"]', { timeout: 8000 });
    await F2.waitForSelector('.link-chip[data-link="online"]', { timeout: 30000 });
    await F1.waitForSelector('.link-chip[data-link="online"]', { timeout: 30000 });
    await f2.move('g1f3');
    await f1.waitPiece('f3', 'wN', 'after the outage F1 sees Nf3');
    step('relay outage: both show "מתחבר מחדש…", reconnect with backoff, and play on');

    await F1.click('[data-testid="room-resign"]');
    await F1.click('.btn-danger:has-text("להיכנע")');
    await F2.waitForSelector('[data-testid="room-result"]');
    expect((await F2.textContent('[data-testid="room-result"]')).includes('ניצחת'), 'F2 won by resignation');
    await f2.shot('15-firebase-result');
    await F1.click('[data-testid="room-leave"]');
    await F1.waitForSelector('.home-head');
    await F2.waitForSelector('[data-testid="room-result"]:has-text("יצא מהחדר")');
    await F2.click('[data-testid="room-leave"]');
    await F2.waitForSelector('.home-head');
    await sleep(300);
    const after = await (await fetch(`http://localhost:${MOCK_PORT}/__state`)).json();
    expect(!after[fcode], 'Firebase: room deleted after both left');
    step('Firebase: resign, both leave, the room is deleted from the relay');
    await c1.close();
    await c2.close();

    // The hourly cleanup job (scripts/cleanup-rooms.mjs) against the same relay, as an admin.
    const M = `http://localhost:${MOCK_PORT}`;
    const seat = { name: 'x', avatar: '🙂', ticket: 'AbCdEfGhIjKlMnOpQrSt', seen: 1000 };
    const room = (t) => ({ v: 1, created: t, touched: t, seats: { host: seat }, game: { round: 0, white: 'host', start: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', moves: '', ply: 0 } });
    const old = Date.now() - 3 * 3600 * 1000;
    for (const [c, t] of [['CCCCC', old], ['DDDDD', old], ['EEEEE', Date.now() - 60000]]) {
      const r = await fetch(`${M}/rooms/${c}.json`, { method: 'PUT', body: JSON.stringify({ ...room(t), seats: { host: { ...seat, seen: t } } }) });
      expect(r.ok, 'seed room ' + c);
    }
    const out = execFileSync('node', [path.join(__dirname, '../../scripts/cleanup-rooms.mjs')], {
      env: { ...process.env, FIREBASE_DB_URL: M, CLEANUP_TOKEN: 'test-admin' },
      encoding: 'utf8'
    });
    const left = await (await fetch(`${M}/__state`)).json();
    expect(!left.CCCCC && !left.DDDDD && left.EEEEE, 'cleanup removed only the idle rooms: ' + Object.keys(left));
    step('cleanup job: ' + out.trim() + ' (a room active a minute ago stays)');
    mock.kill();
  }

  if (errors.length) {
    console.error('\nconsole errors:\n' + errors.join('\n'));
    process.exitCode = 1;
  }
  await b.close();
  fs.rmSync(qrPng, { force: true });
  console.log(errors.length ? '\nphase 6: FAILED (console errors)' : '\nphase 6: all checks passed');
})().catch(async (e) => {
  console.error('✗', e.message);
  process.exit(1);
});
