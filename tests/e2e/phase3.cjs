const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
// Usage: node tests/e2e/phase3.cjs <screenshots-dir> [url]
// Playing against the computer at phone size, from empty storage:
// setup, level 1 with a fixed seed, undo, resume after reload, a full game from a handicap
// start, the level-up offer (seeded streak), the summary, Stockfish at level 3,
// the "Stockfish failed to load" fallback, and dark-mode screenshots.
const SHOTS = process.argv[2] || '.';
const BASE = process.argv[3] || 'http://localhost:4173/';
const URL = BASE + (BASE.includes('?') ? '&' : '?') + 'seed=7';
const FILES = 'abcdefgh';

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const errors = [];
  let allowEngineErrors = false;
  p.on('pageerror', (e) => errors.push('pageerror: ' + e));
  p.on('console', (m) => {
    const t = m.text();
    if (m.type() !== 'error' && m.type() !== 'warning') return;
    if (t.includes('ERR_TUNNEL') || t.includes('fonts.g')) return;
    if (allowEngineErrors) return;
    errors.push(t);
  });
  const shot = async (n, full = false) => p.screenshot({ path: `${SHOTS}/${n}.png`, fullPage: full });
  const step = (s) => console.log('✓', s);
  const expect = (cond, msg) => {
    if (!cond) throw new Error(msg);
  };

  let orient = 'w';
  const center = async (sq) => {
    const box = await (await p.$('main svg.board')).boundingBox();
    const f = FILES.indexOf(sq[0]);
    const r = Number(sq[1]);
    const col = orient === 'w' ? f : 7 - f;
    const row = orient === 'w' ? 8 - r : r - 1;
    return { x: box.x + (col + 0.5) * (box.width / 8), y: box.y + (row + 0.5) * (box.height / 8) };
  };
  const tap = async (sq) => {
    const c = await center(sq);
    await p.mouse.click(c.x, c.y);
    await p.waitForTimeout(60);
  };
  const fen = () => p.evaluate(() => window.__chessit.fen());
  /** The game screen publishes window.__chessit in test mode (?seed=); wait for the new game's hook. */
  const gameReady = async () => {
    await p.waitForSelector('main.game svg.board');
    await p.waitForFunction(() => !!window.__chessit);
  };
  const turnOf = async () => (await fen()).split(' ')[1];
  const plies = () =>
    p.evaluate(() => {
      const f = window.__chessit.fen().split(' ');
      return (Number(f[5]) - 1) * 2 + (f[1] === 'b' ? 1 : 0);
    });

  /** Make a move on the board by tapping; picks a queen when promoting. */
  const move = async (uci) => {
    await tap(uci.slice(0, 2));
    await tap(uci.slice(2, 4));
    if (await p.$('.promo')) await p.click('.promo-btn >> nth=0');
  };

  /** Greedy test player: mate, then big captures, then squeezing the enemy king; avoids stalemate. */
  const pickMove = () =>
    p.evaluate(() => {
      const C = window.__chessit.Chess;
      const c = new C(window.__chessit.fen());
      const val = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
      let best = null;
      let bestScore = -1e9;
      for (const m of c.moves({ verbose: true })) {
        let s = 0;
        if (m.san.includes('#')) s += 10000;
        if (m.captured) s += val[m.captured] * 10;
        if (m.promotion) s += m.promotion === 'q' ? 80 : -80;
        c.move(m);
        if (c.isStalemate() || c.isDraw()) s -= 5000;
        if (c.isAttacked(m.to, c.turn())) s -= val[m.piece] * 8;
        s -= c.moves().length * 0.6; // fewer replies = the enemy king is boxed in
        if (m.san.includes('+')) s += 2;
        c.undo();
        if (s > bestScore) {
          bestScore = s;
          best = m.from + m.to + (m.promotion || '');
        }
      }
      return best;
    });

  /** After the player's move: wait until it is the player's turn again (or the game ended). */
  const waitForReply = async (me, timeout = 20000) => {
    await p.waitForFunction(
      (color) => !!document.querySelector('.result') || window.__chessit.fen().split(' ')[1] === color,
      me,
      { timeout }
    );
    await p.waitForTimeout(120);
  };

  async function createProfile(name, age, gender) {
    await p.fill('input.input', name);
    await p.click(`.seg:has-text("${age}")`);
    await p.click(`.seg:has-text("${gender}")`);
    await p.click('button[type=submit]');
    await p.waitForSelector('.who-name');
  }

  // ---------- Home and setup ----------
  await p.goto(URL);
  await p.waitForSelector('.form');
  await createProfile('נועה', '5–7', 'בת');
  expect(await p.$('.action-computer'), 'home has an active "against the computer" button');
  const soon = await p.$$eval('.action-soon .action-title', (els) => els.map((e) => e.textContent));
  expect(!soon.includes('נגד המחשב'), 'computer is no longer listed under "soon"');
  expect((await p.textContent('.action-computer .action-sub')).includes('רמה'), 'home shows the current level');
  await shot('01-home');
  step('home: "נגד המחשב" is active and shows the level');

  await p.click('.action-computer');
  await p.waitForSelector('.level-grid');
  const levels = await p.$$('.level');
  expect(levels.length === 8, 'eight levels, got ' + levels.length);
  expect(await p.$('.level[data-level="1"].is-on'), 'level 1 preselected from progress');
  await shot('02-computer-setup', true);
  step('setup: 8 levels, level 1 preselected');

  // ---------- Level 1, seeded ----------
  await p.click('.btn-big');
  await gameReady();
  expect((await p.textContent('.topbar-title')) === 'נגד המחשב', 'title');
  orient = 'w';
  await move('e2e4');
  await p.waitForSelector('.game-status.is-thinking', { timeout: 2000 });
  await shot('03-thinking');
  expect(await p.$('.turn-badge.is-thinking'), 'computer bar shows "thinking"');
  step('computer turn shows "חושב…"');
  await waitForReply('w');
  expect((await plies()) === 2, 'computer answered');
  step('level 1 answered: ' + (await fen()));

  for (let i = 0; i < 2; i++) {
    await move(await pickMove());
    await waitForReply('w');
  }
  expect((await plies()) === 6, 'three full moves played, got ' + (await plies()));
  step('three moves, the computer answered each one');

  // Undo takes back the computer's answer and the player's move.
  const before = await fen();
  await move(await pickMove());
  await waitForReply('w');
  expect((await plies()) === 8, 'move 4 answered');
  await p.click('text=בטל מסע');
  await p.waitForTimeout(200);
  expect((await fen()) === before, 'undo restored the position before the player move');
  step('undo removed two half-moves');

  // Same move again gives the same seeded answer, then reload and resume.
  await move(await pickMove());
  await waitForReply('w');
  const saved = await fen();
  await p.reload();
  await p.waitForSelector('.action-resume');
  await p.click('.action-resume');
  await gameReady();
  expect((await fen()) === saved, 'resumed the same position');
  expect((await p.textContent('.topbar-title')) === 'נגד המחשב', 'resumed against the computer');
  const bottomName = await p.textContent('.player >> nth=1');
  expect(bottomName.includes('נועה'), 'the player is at the bottom after resume');
  const topName = await p.textContent('.player >> nth=0');
  expect(topName.includes('רמה 1'), 'the computer keeps its level after resume: ' + topName);
  step('reload: game resumed with level and colour');

  // ---------- Seed a 2-win streak, then win a handicap game ----------
  await p.evaluate(async () => {
    const open = () =>
      new Promise((res, rej) => {
        const r = indexedDB.open('chessit');
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
    const db = await open();
    const get = (store, key) =>
      new Promise((res) => {
        const r = db.transaction(store).objectStore(store).get(key);
        r.onsuccess = () => res(r.result);
      });
    const id = await get('meta', 'lastProfileId');
    const prog = (await get('progress', id)) || { profileId: id, stations: {}, review: {}, engineLevel: 1, stats: { games: 0, wins: 0, draws: 0, puzzlesSolved: 0 } };
    prog.engineLevel = 1;
    prog.computerStreak = { level: 1, result: 'win', count: 2 };
    prog.vsComputer = { 1: { games: 2, wins: 2, losses: 0, draws: 0 } };
    await new Promise((res) => {
      const tx = db.transaction('progress', 'readwrite');
      tx.objectStore('progress').put(prog, id);
      tx.oncomplete = res;
    });
  });
  await p.click('.btn-back');
  await p.waitForSelector('.action-computer');
  await p.click('.action-computer');
  await p.waitForSelector('.level-grid');
  await p.click('.level[data-level="1"]');
  await p.click('.handicap .toggle');
  await p.click('.handicap .seg:has-text("המחשב")');
  for (const id of ['ra', 'rh', 'nb', 'ng', 'bc', 'bf']) await p.click(`.piece-chip[data-piece="${id}"]`);
  expect((await p.$$('.piece-chip.is-on')).length === 7, 'all seven pieces chosen');
  await p.waitForTimeout(150);
  await shot('04-setup-handicap', true);
  step('handicap: the computer starts with king and pawns only');
  await p.click('.btn-big');
  await gameReady();
  const startFen = await fen();
  expect(startFen.startsWith('4k3/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQ'), 'handicap start position: ' + startFen);
  step('game starts from the handicap FEN');

  let guard = 0;
  while (!(await p.$('.result')) && guard++ < 150) {
    await move(await pickMove());
    await waitForReply('w');
  }
  await p.waitForSelector('.result', { timeout: 5000 });
  const title = await p.textContent('.result-title');
  expect(title.includes('ניצחת'), 'the player won: ' + title);
  step(`won the handicap game in ${guard} moves: "${title}"`);
  await p.waitForSelector('.level-offer[data-offer="up"]', { timeout: 3000 });
  await p.waitForTimeout(600);
  await shot('05-result-offer', true);
  step('three wins in a row: offer to move up');
  await p.click('.level-offer .btn-primary');
  await p.waitForSelector('.level-offer-text:has-text("מעכשיו")');
  step('accepted: ' + (await p.textContent('.level-offer-text')));

  // ---------- Summary ----------
  await p.click('.btn-summary');
  await p.waitForSelector('.summary');
  await p.waitForSelector('[data-review]', { timeout: 90000 });
  await p.waitForTimeout(300);
  await shot('06-summary', true);
  const reviews = await p.$$eval('[data-review]', (els) => els.map((e) => e.dataset.review));
  expect(reviews.includes('good'), 'summary shows a good move: ' + reviews);
  const goodText = await p.textContent('[data-review="good"] .review-text');
  step(`summary: ${reviews.join(' + ')} — "${goodText}"`);
  expect(await p.$('[data-review="good"] .mark-arrow-good'), 'good move drawn with an arrow');

  await p.emulateMedia({ colorScheme: 'dark' });
  await p.waitForTimeout(200);
  await shot('07-summary-dark', true);
  await p.emulateMedia({ colorScheme: 'light' });

  await p.click('text=לבית');
  await p.waitForSelector('.action-computer');
  expect((await p.textContent('.action-computer .action-sub')).includes('2'), 'engine level is now 2');
  step('home shows level 2 after accepting');

  // ---------- Level 3: Stockfish loads and answers ----------
  await p.click('.action-computer');
  await p.waitForSelector('.level-grid');
  expect(await p.$('.level[data-level="2"].is-on'), 'setup defaults to the new level 2');
  await p.click('.level[data-level="3"]');
  await p.click('.seg:has-text("שחור")');
  await p.click('.btn-big');
  await gameReady();
  orient = 'b';
  await waitForReply('b', 60000);
  expect(!(await p.$('.engine-failed')), 'stockfish did not fail');
  expect((await plies()) === 1, 'stockfish (white) made the first move');
  step('level 3: Stockfish loaded and played ' + (await fen()).split(' ')[0]);
  await move(await pickMove());
  await p.emulateMedia({ colorScheme: 'dark' });
  await p.waitForSelector('.game-status.is-thinking', { timeout: 2000 }).catch(() => {});
  await shot('08-level3-dark');
  await p.emulateMedia({ colorScheme: 'light' });
  await waitForReply('b', 30000);
  step('Stockfish answered the player move');

  // ---------- Stockfish unavailable: offer level 2 ----------
  const p2 = await ctx.newPage();
  allowEngineErrors = true;
  p2.on('pageerror', (e) => {
    if (!String(e).includes('stockfish')) errors.push('pageerror(p2): ' + e);
  });
  await p2.route('**/engine/**', (route) => route.abort());
  await p2.goto(URL);
  await p2.waitForSelector('.action-computer');
  await p2.click('.action-computer');
  await p2.waitForSelector('.level-grid');
  await p2.click('.level[data-level="5"]');
  await p2.click('.seg:has-text("שחור")');
  await p2.click('.btn-big');
  await p2.waitForSelector('main.game svg.board');
  await p2.waitForSelector('.engine-failed', { timeout: 60000 });
  await p2.screenshot({ path: `${SHOTS}/09-engine-failed.png` });
  await p2.click('.engine-failed .btn-primary');
  await p2.waitForFunction(() => window.__chessit.fen().split(' ')[1] === 'b', null, { timeout: 10000 });
  expect((await p2.textContent('.player >> nth=0')).includes('רמה 2'), 'switched to level 2');
  step('no Stockfish: "המחשב לא הצליח להתעורר", continued at level 2');
  allowEngineErrors = false;
  await p2.close();

  // Two-player game still uses the normal start and stays untouched.
  await p.click('.btn-back');
  await p.waitForSelector('.action-primary');
  await p.click('.action-primary');
  await p.waitForSelector('.opponent');
  await p.click('text=יוצאים לדרך!');
  await p.waitForSelector('main svg.board');
  expect((await p.textContent('.topbar-title')) === 'משחק לשניים', 'two-player title');
  step('two-player game still starts normally');

  if (errors.length) {
    console.log('Console errors:\n' + errors.join('\n'));
    process.exitCode = 1;
  } else step('no console errors');
  await b.close();
})().catch((e) => {
  console.error('✗', e.message);
  process.exit(1);
});
