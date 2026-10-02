const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
// Usage: node tests/e2e/phase1.cjs <screenshots-dir> [url]
// Runs against a served build at phone size; starts from empty storage.
const SHOTS = process.argv[2] || '.';
const URL = process.argv[3] || 'http://localhost:4173/';
const FILES = 'abcdefgh';
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: false });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push('pageerror: ' + e));
  p.on('console', m => { if (m.type() === 'error' && !m.text().includes('ERR_TUNNEL')) errors.push(m.text()); });
  const shot = async (n) => p.screenshot({ path: `${SHOTS}/${n}.png`, fullPage: true });
  const step = (s) => console.log('✓', s);

  await p.goto(URL);
  await p.waitForSelector('.form');
  await shot('01-first-profile');
  step('first launch opens new-profile form');

  // Profile 1
  await p.fill('input.input', 'דנה');
  await p.click('.seg:has-text("5–7")');
  await p.click('.seg:has-text("בת")');
  await shot('02-profile-filled');
  await p.click('button[type=submit]');
  await p.waitForSelector('.who-name');
  if ((await p.textContent('.who-name')) !== 'דנה') throw new Error('home name mismatch');
  step('profile 1 saved, home shown');
  await shot('03-home');

  // Profile 2
  await p.click('.who');
  await p.waitForSelector('.profile-grid');
  await p.click('text=+ פרופיל חדש');
  await p.fill('input.input', 'יואב');
  await p.click('.seg:has-text("8–12")');
  await p.click('.seg:has-text("בן")');
  await p.click('button[type=submit]');
  await p.waitForSelector('.who-name');
  step('profile 2 saved');
  await p.click('.who');
  await p.waitForSelector('.profile-grid');
  await shot('04-picker');
  const tiles = await p.$$eval('.profile-name', els => els.map(e => e.textContent));
  if (tiles.join(',') !== 'דנה,יואב') throw new Error('picker list ' + tiles);
  step('picker lists both profiles');
  await p.click('.profile-pick:has-text("יואב")');
  await p.waitForSelector('.who-name');

  // Setup a game: Yoav white vs Dana
  await p.click('.action-primary');
  await p.waitForSelector('.opponent');
  await shot('05-setup');
  await p.click('.opponent:has-text("דנה")');
  await p.click('text=יוצאים לדרך!');
  await p.waitForSelector('.board');
  step('game started');

  const center = async (sq, orient) => {
    const box = await (await p.$('svg.board')).boundingBox();
    const f = FILES.indexOf(sq[0]), r = Number(sq[1]);
    const col = orient === 'w' ? f : 7 - f;
    const row = orient === 'w' ? 8 - r : r - 1;
    return { x: box.x + (col + 0.5) * box.width / 8, y: box.y + (row + 0.5) * box.height / 8 };
  };
  let orient = 'w';
  const tap = async (from, to) => {
    let c = await center(from, orient); await p.mouse.click(c.x, c.y);
    c = await center(to, orient); await p.mouse.click(c.x, c.y);
    await p.waitForTimeout(260);
  };
  const dragMove = async (from, to) => {
    const a = await center(from, orient), z = await center(to, orient);
    await p.mouse.move(a.x, a.y); await p.mouse.down();
    await p.mouse.move((a.x + z.x) / 2, (a.y + z.y) / 2, { steps: 5 });
    await p.mouse.move(z.x, z.y, { steps: 5 }); await p.mouse.up();
    await p.waitForTimeout(260);
  };
  const play = async (moves, useDragAt = -1) => {
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      if (i === useDragAt) await dragMove(m.slice(0, 2), m.slice(2, 4));
      else await tap(m.slice(0, 2), m.slice(2, 4));
      orient = orient === 'w' ? 'b' : 'w'; // rotate-each-turn is on
    }
  };

  // Show legal-move hints for a selected piece
  let c = await center('g1', 'w'); await p.mouse.click(c.x, c.y);
  await p.waitForTimeout(100);
  const hints = await p.$$eval('.hint-move', els => els.length);
  if (hints !== 2) throw new Error('knight g1 should show 2 hints, got ' + hints);
  await shot('06-hints');
  await p.mouse.click(c.x, c.y); // put it back down
  step('selecting a knight shows its 2 legal squares');

  // Scholar's mate; the bishop move is made by dragging
  await play(['e2e4', 'e7e5', 'f1c4', 'b8c6', 'd1h5', 'g8f6'], 2);
  await shot('07-midgame');
  const capturedBefore = await p.$$eval('.cap', els => els.length);
  await play(['h5f7']);
  await p.waitForSelector('.result');
  const title = await p.textContent('.result-title');
  const reason = await p.textContent('.result-reason');
  if (!title.includes('יואב') || !reason.includes('מט')) throw new Error('result: ' + title + ' / ' + reason);
  await shot('08-checkmate');
  step(`checkmate detected: "${title}" (${reason})`);
  const capturedAfter = await p.$$eval('.cap', els => els.length);
  if (capturedAfter !== capturedBefore + 1) throw new Error('capture not shown');
  step('captured pawn shown in player bar');

  // Stats recorded
  await p.click('text=לבית');
  await p.waitForSelector('.stats');
  const stats = await p.textContent('.stats');
  if (!stats.includes('1 משחקים') || !stats.includes('1 ניצחונות')) throw new Error('stats ' + stats);
  step('stats updated: ' + stats);

  // Promotion line + resume after reload
  await p.click('.action-primary');
  await p.waitForSelector('.opponent');
  await p.click('.opponent:has-text("דנה")');
  await p.click('text=יוצאים לדרך!');
  await p.waitForSelector('.board');
  orient = 'w';
  await play(['a2a4', 'b7b5', 'a4b5', 'a7a6']);
  await p.reload();
  await p.waitForSelector('.action-resume');
  await shot('09-resume-offer');
  await p.click('.action-resume');
  await p.waitForSelector('.board');
  orient = 'w';
  const pieceCount = await p.$$eval('.piece', els => els.length);
  if (pieceCount !== 31) throw new Error('after resume expected 31 pieces, got ' + pieceCount);
  step('game survives reload and resumes (31 pieces on board)');

  await play(['b5a6', 'c8b7', 'a6b7', 'b8c6']);
  c = await center('b7', orient); await p.mouse.click(c.x, c.y);
  c = await center('a8', orient); await p.mouse.click(c.x, c.y);
  await p.waitForSelector('.promo');
  await p.waitForTimeout(400); await shot('10-promotion');
  await p.click('.promo-btn:has-text("פרש")');
  await p.waitForTimeout(260);
  orient = 'b';
  const a8 = await p.$$eval('.piece text', els => els.map(e => e.textContent));
  if (!a8.some(t => t.startsWith('♞'))) throw new Error('no knight after promotion');
  step('promotion picker works (chose a knight)');
  await shot('11-after-promotion');

  // Undo
  await p.click('text=בטל מסע');
  await p.waitForTimeout(200);
  if (await p.$('.promo')) throw new Error('promo still open');
  step('undo works');

  if (errors.length) { console.log('ERRORS:', errors); process.exitCode = 1; }
  else console.log('no page errors');
  await b.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
