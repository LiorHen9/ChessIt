// Screenshots for the README (docs/screenshots/*.png), at phone size, light mode.
// Usage: NODE_PATH=$(npm root -g) node scripts/screenshots.cjs [url]   (a built site, e.g. http://localhost:4173/)
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = (process.argv[2] || 'http://localhost:4173/') + '?seed=7&transport=local';
const OUT = path.join(__dirname, '..', 'docs', 'screenshots');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, colorScheme: 'light' });
  const p = await ctx.newPage();
  const shot = (name) => p.screenshot({ path: path.join(OUT, `${name}.png`) });
  await p.goto(BASE);
  await p.waitForSelector('.form');
  await p.fill('.input', 'מאיה');
  await p.click('.seg:has-text("8–12")');
  await p.click('.seg:has-text("בת")');
  await p.waitForTimeout(400);
  await p.click('button[type=submit]');
  await p.waitForSelector('.home-head');
  // A little progress, so the map and home look lived in.
  await p.evaluate(
    () =>
      new Promise((res) => {
        const r = indexedDB.open('chessit');
        r.onsuccess = () => {
          const db = r.result;
          const tx = db.transaction(['profiles', 'progress'], 'readwrite');
          const q = tx.objectStore('profiles').getAll();
          q.onsuccess = () => {
            const id = q.result[0].id;
            const done = ['board-colors', 'board-lines', 'board-names', 'board-hunt', 'board-setup', 'rook-moves', 'rook-stars'];
            tx.objectStore('progress').put(
              {
                profileId: id,
                stations: Object.fromEntries(done.map((s, i) => [s, { stars: i % 3 === 2 ? 2 : 3, completedAt: 1 }])),
                review: {},
                engineLevel: 2,
                stats: { games: 5, wins: 3, draws: 1, puzzlesSolved: 4 },
                vsComputer: {},
                computerStreak: null,
                puzzles: {},
                daily: null,
                placement: null
              },
              id
            );
          };
          tx.oncomplete = () => res();
        };
      })
  );
  await p.reload();
  await p.waitForSelector('.home-head');
  await p.waitForTimeout(500);
  await shot('home');
  await p.click('.action-learn');
  await p.waitForSelector('.node.is-here');
  await p.waitForTimeout(600);
  await shot('map');
  await p.click('.node.is-here .node-btn');
  await p.waitForSelector('main svg.board');
  await p.waitForTimeout(2500);
  await shot('station');
  await p.goto(BASE);
  await p.waitForSelector('.home-head');
  await p.click('.action-computer');
  await p.waitForSelector('.level-grid');
  await p.click('.btn-big');
  await p.waitForSelector('main svg.board');
  const FILES = 'abcdefgh';
  const tap = async (sq) => {
    const box = await (await p.$('main svg.board')).boundingBox();
    await p.mouse.click(box.x + (FILES.indexOf(sq[0]) + 0.5) * (box.width / 8), box.y + (8 - Number(sq[1]) + 0.5) * (box.height / 8));
    await p.waitForTimeout(120);
  };
  for (const m of ['e2e4', 'g1f3', 'f1c4']) {
    await tap(m.slice(0, 2));
    await tap(m.slice(2));
    await p.waitForTimeout(1600);
  }
  await tap('d2');
  await p.waitForTimeout(300);
  await shot('game');
  await p.goto(BASE);
  await p.waitForSelector('.home-head');
  await p.click('[data-testid="home-room"]');
  await p.click('text=פתיחת חדר');
  await p.click('[data-testid="room-open"]');
  await p.waitForSelector('[data-testid="room-qr"]');
  await p.waitForTimeout(400);
  await shot('room');
  await b.close();
  console.log('wrote', fs.readdirSync(OUT).join(', '));
})();
