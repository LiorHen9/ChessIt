const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
// Usage: node tests/e2e/phase2.cjs <screenshots-dir> [url]
// Learning path at phone size, from empty storage: world 1, the rook world, stars,
// unlocking, saving after reload, and two profiles with separate progress.
const SHOTS = process.argv[2] || '.';
const URL = process.argv[3] || 'http://localhost:4173/';
const FILES = 'abcdefgh';

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push('pageerror: ' + e));
  p.on('console', (m) => {
    if ((m.type() === 'error' || m.type() === 'warning') && !m.text().includes('ERR_TUNNEL')) errors.push(m.text());
  });
  const shot = async (n, full = false) => p.screenshot({ path: `${SHOTS}/${n}.png`, fullPage: full });
  const step = (s) => console.log('✓', s);
  const expect = (cond, msg) => {
    if (!cond) throw new Error(msg);
  };

  const center = async (sq) => {
    const box = await (await p.$('main svg.board')).boundingBox();
    const f = FILES.indexOf(sq[0]);
    const r = Number(sq[1]);
    return { x: box.x + (f + 0.5) * (box.width / 8), y: box.y + (8 - r + 0.5) * (box.height / 8) };
  };
  const tap = async (sq) => {
    const c = await center(sq);
    await p.mouse.click(c.x, c.y);
    await p.waitForTimeout(120);
  };
  const move = async (uci) => {
    await tap(uci.slice(0, 2));
    await tap(uci.slice(2, 4));
    await p.waitForTimeout(200);
  };
  const starsShown = () => p.$$eval('.done .star-on', (els) => els.length);
  const waitDone = () => p.waitForSelector('.done', { timeout: 4000 });
  const startPractice = async () => {
    await p.waitForSelector('.go-btn');
    await p.click('.go-btn');
    await p.waitForSelector('.task');
  };
  const next = async () => {
    await p.click('.done-actions .btn-primary');
    await p.waitForTimeout(150);
  };

  async function createProfile(name, age, gender) {
    await p.fill('input.input', name);
    await p.click(`.seg:has-text("${age}")`);
    await p.click(`.seg:has-text("${gender}")`);
    await p.click('button[type=submit]');
    await p.waitForSelector('.who-name');
  }

  // ---------- Profile A ----------
  await p.goto(URL);
  await p.waitForSelector('.form');
  await createProfile('דנה', '5–7', 'בת');
  expect(await p.$('.action-learn'), 'learning button on home');
  await shot('01-home');
  step('home shows an active learning-path button');

  await p.click('.action-learn');
  await p.waitForSelector('.node');
  const open = await p.$$eval('.node-btn:not([disabled])', (els) => els.map((e) => e.dataset.station));
  expect(open.join() === 'board-colors', 'only the first station is open, got ' + open);
  expect((await p.textContent('.here-tag')).includes('את כאן'), 'here tag uses the profile gender');
  await p.waitForTimeout(400);
  await shot('02-map-start');
  step('map: only the first station is open, "את כאן" on it');

  // World 1, station 1: lesson with demo, then tap the dark squares
  await p.click('[data-station="board-colors"]');
  await p.waitForSelector('.demo');
  await p.waitForTimeout(4200);
  await shot('03-lesson-intro');
  await startPractice();
  await tap('b1'); // a light square: a mistake
  expect((await p.textContent('.feedback')).includes('b1'), 'mistake feedback names the square');
  await tap('a1');
  await tap('c1');
  await tap('e1');
  await shot('04-tap-practice');
  await tap('g1');
  await waitDone();
  await p.waitForTimeout(1300);
  await shot('05-done');
  expect((await starsShown()) === 2, 'one mistake gives 2 stars');
  step('board-colors: lesson demo, tap practice, 2 stars with one mistake');

  // "Again" for 3 stars
  await p.click('.done-actions .row .btn:has-text("שוב")');
  await p.waitForSelector('.task');
  for (const s of ['a1', 'c1', 'e1', 'g1']) await tap(s);
  await waitDone();
  expect((await starsShown()) === 3, 'no mistakes gives 3 stars');
  step('replay without mistakes: 3 stars');

  // The rest of world 1
  await next();
  await startPractice();
  await tap('c3');
  await waitDone();
  await next();
  await startPractice();
  expect((await p.textContent('.task-target')).trim() === 'e4', 'ordered target shown');
  await tap('e4');
  await tap('b6');
  await waitDone();
  await next(); // board-hunt: a minigame, no intro
  await p.waitForSelector('.task-target');
  for (const s of ['d4', 'a8', 'h1', 'f6', 'b3', 'g7']) await tap(s);
  await waitDone();
  await next();
  await startPractice();
  await tap('d1');
  await tap('d8');
  await waitDone();
  expect((await p.textContent('.done')).includes('סיימת את עולם הלוח'), 'world complete message');
  expect((await p.textContent('.done-actions .btn-primary')).includes('הצריח'), 'next world button');
  step('world 1 (5 stations) completed, next world offered');

  // Rook world
  await next();
  await p.waitForSelector('.speech-hello');
  expect((await p.textContent('.speech-hello')).includes('צביקה הצריח'), 'rook character says hello');
  await p.waitForTimeout(5200);
  await shot('06a-rook-lesson');
  await startPractice();
  await move('a1a5');
  await move('a5e5');
  await waitDone();
  expect((await starsShown()) === 3, 'rook lesson 3 stars');
  await next();

  // Rook minigame: illegal move feedback, then the best route for 3 stars
  await p.waitForSelector('.task');
  await shot('06b-minigame');
  await tap('a1');
  await tap('b2');
  expect((await p.textContent('.feedback')).includes('ישר'), 'illegal-move feedback explains the rook');
  step('illegal move explained: ' + (await p.textContent('.feedback')).trim());
  for (const m of ['a1a4', 'a4f4', 'f4f8']) await move(m);
  expect((await p.textContent('.chip-progress')).includes('3/4'), 'star counter');
  await move('f8c8');
  await waitDone();
  await p.waitForTimeout(1300);
  await shot('07-done-3-stars');
  expect((await starsShown()) === 3, 'rook minigame 3 stars');
  step('rook minigame completed in 4 moves with 3 stars');

  // Next station opens; try a hint there
  await next();
  await p.waitForSelector('.demo');
  await startPractice();
  await p.click('button:has-text("רמז")');
  expect((await p.$$('.mark-arrow')).length === 1, 'hint draws an arrow');
  await shot('08-hint');
  step('next station (rook-capture) opened; hint shows an arrow');

  await p.click('.btn-back');
  await p.waitForSelector('.node');
  await p.waitForTimeout(400); // the map scrolls to "you are here"
  const rookOpen = await p.$$eval('.node-btn:not([disabled])', (els) => els.map((e) => e.dataset.station));
  expect(rookOpen.includes('rook-capture') && !rookOpen.includes('rook-hungry'), 'unlock state on map ' + rookOpen);
  await shot('09-map-progress');
  step('map: rook-capture open, rook-hungry still locked');

  // ---------- Reload ----------
  await p.reload();
  await p.waitForSelector('.who-name');
  expect((await p.textContent('.action-learn')).includes('7'), 'home shows 7 stations done');
  await p.click('.action-learn');
  await p.waitForSelector('.node');
  const total = (await p.textContent('.map-total')).trim();
  // board: 3+3+3+3+3, rook: 3+3
  expect(total.includes('21'), 'total stars after reload: ' + total);
  step('progress survives a reload (21 stars)');

  // ---------- Profile B ----------
  await p.click('.btn-back');
  await p.click('.who');
  await p.waitForSelector('.profile-grid');
  await p.click('text=+ פרופיל חדש');
  await createProfile('יואב', '8–12', 'בן');
  await p.click('.action-learn');
  await p.waitForSelector('.node');
  const openB = await p.$$eval('.node-btn:not([disabled])', (els) => els.map((e) => e.dataset.station));
  expect(openB.join() === 'board-colors', 'new profile starts fresh, got ' + openB);
  expect((await p.textContent('.map-total')).includes('0'), 'profile B has 0 stars');
  expect((await p.textContent('.here-tag')).includes('אתה כאן'), 'masculine here tag');
  step('second profile has its own, empty progress');

  // Seed B's progress up to the pawn world and play the promotion lesson (promotion picker in a drill)
  await p.evaluate(async () => {
    const ids = await new Promise((res) => {
      const r = indexedDB.open('chessit');
      r.onsuccess = () => {
        const tx = r.result.transaction('profiles', 'readonly');
        const q = tx.objectStore('profiles').getAll();
        q.onsuccess = () => res(q.result);
      };
    });
    const yoav = ids.find((x) => x.name === 'יואב');
    const done = [
      'board-colors', 'board-lines', 'board-names', 'board-hunt', 'board-setup',
      'rook-moves', 'rook-stars', 'rook-capture', 'rook-hungry',
      'bishop-moves', 'bishop-stars', 'bishop-hungry',
      'queen-moves', 'queen-stars', 'queen-hungry',
      'king-moves', 'king-stars', 'king-hungry',
      'knight-moves', 'knight-stars', 'knight-flag', 'knight-hungry',
      'pawn-moves', 'pawn-capture'
    ];
    const stations = Object.fromEntries(done.map((id) => [id, { stars: 1, completedAt: 1 }]));
    await new Promise((res) => {
      const r = indexedDB.open('chessit');
      r.onsuccess = () => {
        const tx = r.result.transaction('progress', 'readwrite');
        tx.objectStore('progress').put(
          { profileId: yoav.id, stations, review: {}, engineLevel: 1, stats: { games: 0, wins: 0, draws: 0, puzzlesSolved: 0 } },
          yoav.id
        );
        tx.oncomplete = res;
      };
    });
  });
  await p.reload();
  await p.waitForSelector('.who-name');
  await p.click('.action-learn');
  await p.waitForSelector('.node.is-here');
  expect((await p.getAttribute('.node.is-here .node-btn', 'data-station')) === 'pawn-promote', 'here = pawn-promote');
  await p.click('.node.is-here .node-btn');
  await startPractice();
  await move('e6e7');
  await tap('e7');
  await tap('e8');
  await p.waitForSelector('.promo');
  await shot('10-promotion');
  await p.click('.promo-btn:has-text("מלכה")');
  await waitDone();
  expect((await starsShown()) === 3, 'promotion in 2 moves: 3 stars');
  step('pawn promotion lesson works with the promotion picker');

  // Last station of the pieces: since phase 4 the path continues to world 3
  await next();
  await p.waitForSelector('.task');
  for (const m of ['b2c3', 'c3d4', 'd4c5', 'c5b6']) await move(m);
  await waitDone();
  expect((await p.textContent('.done')).includes('סיימת את עולם החייל'), 'world complete message');
  expect((await p.textContent('.done-actions .btn-primary')).includes('אוכלים ושומרים'), 'next world (phase 4) offered');
  step('last pieces station leads on to world 3 (אוכלים ושומרים)');

  // Profile A unaffected
  await p.click('.done-actions .btn:has-text("למפה")');
  await p.click('.btn-back');
  await p.click('.who');
  await p.click('.profile-pick:has-text("דנה")');
  await p.click('.action-learn');
  await p.waitForSelector('.node');
  expect((await p.textContent('.map-total')).includes('21'), 'profile A still has 21 stars');
  step('profile A progress unchanged by profile B');

  if (errors.length) {
    console.log('ERRORS:', errors);
    process.exitCode = 1;
  } else console.log('no page errors');
  await b.close();
})().catch((e) => {
  console.error('FAIL', e.message);
  process.exit(1);
});
