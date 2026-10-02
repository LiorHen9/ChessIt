const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
// Usage: node tests/e2e/phase4.cjs <screenshots-dir> [url]
// The full learning path at phone size, from empty storage (?seed=7 makes the computer and
// the test hooks repeatable):
// - placement test for an adult that opens parts 1–6, and the map with 8 parts;
// - one station of every new goal kind: escapeCheck (with the "your king is in check" message
//   for an illegal move), mateIn 1 and 2, defend, findBestMove with a line, playOut against the
//   defender and a coached game against level 1;
// - the daily puzzle, a puzzle with a mistake going into review, and review after seeding dates;
// - puzzles screen (themes open by part), a child profile without the placement offer;
// - dark-mode screenshots.
const SHOTS = process.argv[2] || '.';
const BASE = process.argv[3] || 'http://localhost:4173/';
const URL = BASE + (BASE.includes('?') ? '&' : '?') + 'seed=7';
const FILES = 'abcdefgh';

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push('pageerror: ' + e));
  p.on('console', (m) => {
    const t = m.text();
    if ((m.type() === 'error' || m.type() === 'warning') && !t.includes('ERR_TUNNEL') && !t.includes('fonts.g')) errors.push(t);
  });
  const shot = async (n, full = false) => p.screenshot({ path: `${SHOTS}/${n}.png`, fullPage: full });
  const step = (s) => console.log('✓', s);
  const expect = (cond, msg) => {
    if (!cond) throw new Error(msg);
  };
  const text = async (sel) => (await p.textContent(sel)) ?? '';

  /** Board orientation: the side to move in the task (puzzles may be played as black). */
  const orientation = () => p.evaluate(() => window.__chessitTask.fen().split(' ')[1]);
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
    await p.waitForTimeout(90);
  };
  const move = async (uci) => {
    await tap(uci.slice(0, 2));
    await tap(uci.slice(2, 4));
    if (await p.$('.promo')) await p.click('.promo-btn >> nth=0');
    await p.waitForTimeout(150);
  };
  /** Wait until the task accepts a move (no reply or take-back running). */
  const ready = async () => {
    await p.waitForFunction(() => window.__chessitTask && !window.__chessitTask.busy(), null, { timeout: 8000 });
    await p.waitForTimeout(80);
  };
  const hintMove = () => p.evaluate(() => window.__chessitTask.hint());
  const starsShown = () => p.$$eval('.done .star-on', (els) => els.length);
  const waitDone = (timeout = 8000) => p.waitForSelector('.done', { timeout });
  const startPractice = async () => {
    await p.waitForSelector('.go-btn');
    await p.click('.go-btn');
    await p.waitForSelector('.task');
  };
  const toMap = async () => {
    await p.click('.done-actions .btn:has-text("למפה")');
    await p.waitForSelector('.map');
  };
  const openPart = async (part) => {
    const btn = await p.$(`[data-part="${part}"]`);
    if ((await btn.getAttribute('aria-expanded')) !== 'true') await btn.click();
    await p.waitForTimeout(100);
  };
  const openStation = async (part, id) => {
    await openPart(part);
    await p.click(`[data-station="${id}"]`);
  };
  async function createProfile(name, age, gender) {
    await p.fill('input.input', name);
    await p.click(`.seg:has-text("${age}")`);
    await p.click(`.seg:has-text("${gender}")`);
    await p.click('button[type=submit]');
    await p.waitForSelector('.who-name');
  }
  /** Read or change this profile's progress record in IndexedDB. */
  const editProgress = (fn) =>
    p.evaluate(async (src) => {
      const db = await new Promise((res) => {
        const r = indexedDB.open('chessit');
        r.onsuccess = () => res(r.result);
      });
      const last = await new Promise((res) => {
        const q = db.transaction('meta').objectStore('meta').get('lastProfileId');
        q.onsuccess = () => res(q.result);
      });
      const id = typeof last === 'object' && last ? last.value ?? last : last;
      const rec = await new Promise((res) => {
        const q = db.transaction('progress').objectStore('progress').get(id);
        q.onsuccess = () => res(q.result);
      });
      const next = new Function('p', src)(rec) ?? rec;
      await new Promise((res) => {
        const tx = db.transaction('progress', 'readwrite');
        tx.objectStore('progress').put(next, id);
        tx.oncomplete = res;
      });
      return next;
    }, `return (${fn.toString()})(p)`);

  // ---------- An adult profile and the placement test ----------
  await p.goto(URL);
  await p.waitForSelector('.form');
  await createProfile('אבא', '13+', 'בן');
  expect(await p.$('.action-placement'), 'placement offer on home for 13+');
  expect(await p.$('[data-testid="home-daily"]'), 'daily puzzle card on home');
  await shot('01-home-adult');
  step('home: placement offer and daily-puzzle card');

  await p.click('.action-placement');
  await p.waitForSelector('.placement-intro');
  await shot('02-placement-intro');
  await p.click('.placement-intro .btn-primary');
  // Right answers, except the fork question (part 7): parts 2–6 pass, 7 and 8 do not.
  const answers = ['d4e6', 'c1g5', 'e4f6', 'g3e5', 'd1d8', 'e1g1', 'b5d6', 'g1f3'];
  for (let i = 0; i < answers.length; i++) {
    await p.waitForSelector('.placement .task');
    await p.waitForFunction((n) => document.querySelector('.task .chip')?.textContent?.includes(`${n}/`), i + 1);
    await ready();
    if (i === 3) {
      // Escape check: first an illegal move – the knight-free king cannot ignore the check.
      await shot('03-placement-question');
    }
    await move(answers[i]);
    await p.waitForTimeout(i === 6 ? 2500 : 1700);
  }
  await p.waitForSelector('.placement-result');
  const result = await text('.placement-result');
  expect(result.includes('7') && result.includes('מתוך'), 'score 7 of 8, got: ' + result);
  expect(result.includes('חוקים מיוחדים') && !result.includes('טריקים'), 'parts up to 6 passed');
  expect(result.includes('שועל'), 'suggested level 5 (שועל)');
  await shot('04-placement-result');
  step('placement test: 7/8, parts 1–6 passed, level 5 suggested');

  await p.click('.placement-result .btn-primary');
  await p.waitForSelector('.map');
  const parts = await p.$$eval('.map-part-btn', (els) => els.length);
  expect(parts === 8, 'map shows 8 parts, got ' + parts);
  const states = await p.$$eval('.map-part-state', (els) => els.map((e) => e.textContent));
  expect(states.slice(0, 6).every((s) => s.includes('עברתי')), 'parts 1–6 marked passed: ' + states);
  expect(states[7].includes('🔒'), 'part 8 locked');
  expect((await p.getAttribute('.node.is-here .node-btn', 'data-station')) === 'tac-double', 'here = first tactics station');
  await p.waitForTimeout(300);
  await shot('05-map-8-parts');
  await p.evaluate(() => window.scrollTo(0, 0));
  await shot('05b-map-top');
  step('map: 8 collapsible parts, 1–6 passed, "you are here" on tactics');

  // ---------- escapeCheck: illegal move because of check, wrong way, block ----------
  await openStation(4, 'chk-block');
  await p.waitForSelector('.demo');
  await p.waitForTimeout(4500);
  await shot('06-check-lesson-demo');
  await startPractice();
  await ready();
  orient = 'w';
  await tap('c3');
  await tap('a4'); // the knight can jump there, but the king is in check
  expect((await text('.feedback')).includes('המלך שלך בשח'), 'illegal move because of check explained: ' + (await text('.feedback')));
  await shot('07-check-illegal');
  step('illegal move in check: "המלך שלך בשח! קודם צריך להציל אותו"');
  await tap('c3'); // put the knight down again
  await move('e1d1'); // escapes, but by moving: the wrong way for this lesson
  expect((await text('.feedback')).includes('יצאת מהשח'), 'wrong escape way explained');
  await ready();
  await move('c3e2');
  await p.waitForSelector('.round-next');
  await p.waitForSelector('.chip-progress:has-text("2/2")');
  await ready();
  await move('c2c3');
  await waitDone();
  expect((await starsShown()) === 2, 'one mistake: 2 stars');
  await p.waitForTimeout(900);
  await shot('08-check-done');
  step('escapeCheck: wrong way counted, block found, 2 rounds, 2 stars');
  await toMap();

  // ---------- escapeCheck findAll ----------
  await openStation(4, 'chk-three');
  await p.waitForSelector('.task');
  await ready();
  await move('g3e5');
  await p.waitForTimeout(1500);
  await ready();
  await move('c3e2');
  await p.waitForTimeout(1500);
  await ready();
  await move('e1d1');
  await waitDone();
  expect((await starsShown()) === 3, 'three ways without mistakes: 3 stars');
  step('escapeCheck findAll: capture, block and move, 3 stars');
  await toMap();

  // ---------- mateIn 1 with "check but not mate", then mateIn 2 ----------
  await openStation(5, 'mate-or-check');
  await startPractice();
  await ready();
  await move('d3h7'); // check, but the king takes the queen
  expect((await text('.feedback')).includes('לא מט'), 'check-not-mate explained');
  await ready();
  await move('d3d8');
  await waitDone();
  step('mateIn 1: "שח, אבל לא מט" and then mate');
  await toMap();

  await openStation(5, 'mate-two');
  await p.waitForSelector('.task');
  await ready();
  await move('a2a7');
  await p.waitForTimeout(400);
  await ready(); // the defence was played
  const fenAfter = await p.evaluate(() => window.__chessitTask.fen());
  expect(fenAfter.split(' ')[1] === 'w', 'the other side answered');
  await shot('09-mate-in-two');
  await move(await hintMove());
  await waitDone();
  expect((await starsShown()) === 3, 'mate in 2 without mistakes: 3 stars');
  step('mateIn 2: the other side defends, mate on the second move');
  await toMap();

  // ---------- playOut against the defender (rook ladder) ----------
  await openStation(5, 'mate-ladder');
  await startPractice();
  for (let i = 0; i < 30 && !(await p.$('.done')); i++) {
    await ready();
    if (await p.$('.done')) break;
    await move(await hintMove());
    if (i === 1) await shot('10-mate-minigame');
    await p.waitForTimeout(250);
  }
  await waitDone();
  step(`playOut: rook ladder won against the defender (${await text('.done-line')})`);
  await toMap();

  // ---------- defend (3 rounds, one mistake) ----------
  await openStation(3, 'cap-defend');
  await startPractice();
  await ready();
  await move('g1h1'); // the knight stays in danger
  expect((await text('.feedback')).includes('בסכנה'), 'still in danger explained');
  await ready();
  await move('d4f5');
  await p.waitForSelector('.chip-progress:has-text("2/3")');
  await ready();
  await move('e4d5');
  await p.waitForSelector('.chip-progress:has-text("3/3")');
  await ready();
  await move('d2d4');
  await waitDone();
  expect((await text('.done-line')).includes('טעות אחת'), 'one mistake reported');
  step('defend: 3 rounds, one mistake');
  await toMap();

  // ---------- findBestMove: a wrong move with a custom message, then the double attack ----------
  await openStation(7, 'tac-double');
  await startPractice();
  await ready();
  await move('d1d5'); // attacked by the rook
  expect((await text('.feedback')).length > 3, 'wrong-move feedback');
  await ready();
  await move('d1d3');
  await waitDone();
  step('findBestMove: wrong move explained, double attack found');
  await p.click('.done-actions .btn-primary'); // next station: tac-fork

  // ---------- findBestMove with a line (fork) ----------
  await startPractice();
  await ready();
  await move('b5c7');
  await p.waitForTimeout(300);
  await ready();
  expect((await p.evaluate(() => window.__chessitTask.fen())).startsWith('r7/2Nk4'), 'scripted reply Kd7 played');
  await move('c7a8');
  await waitDone();
  step('findBestMove line: fork, scripted reply, capture');
  await toMap();

  // ---------- Coached opening against level 1 (seed part 7 and the first lessons of part 8) ----------
  await editProgress((pr) => {
    for (const id of ['tac-double', 'tac-fork', 'tac-forks', 'tac-pin', 'tac-pin-use', 'tac-mix', 'op-center', 'op-pawn', 'op-develop', 'op-castle', 'op-queen'])
      pr.stations[id] = pr.stations[id] ?? { stars: 3, completedAt: 1 };
    return pr;
  });
  await p.reload();
  await p.waitForSelector('.who-name');
  await p.click('.action-learn');
  await p.waitForSelector('.map');
  await openStation(8, 'op-guided');
  await p.waitForSelector('.task');
  await ready();
  await move('a2a4'); // a weak opening move: the coach comments
  expect((await text('.feedback')).length > 3, 'coach comment shown');
  await ready();
  await p.click('.drill-actions .btn:has-text("בטל מסע")');
  await ready();
  expect((await p.evaluate(() => window.__chessitTask.fen())).startsWith('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP'), 'undo restored the start');
  for (let i = 0; i < 6 && !(await p.$('.done')); i++) {
    await ready();
    await move(await hintMove());
    if (i === 2) await shot('11-coached-game');
    await p.waitForTimeout(300);
  }
  await waitDone();
  step('coached opening: comment, undo, 6 moves against level 1');
  await toMap();

  // ---------- Daily puzzle ----------
  await p.click('.btn-back');
  await p.waitForSelector('[data-testid="home-daily"]');
  await shot('12-home-daily-card');
  await p.click('[data-testid="home-daily"]');
  await p.waitForSelector('.puzzle .task');
  await p.waitForTimeout(1000);
  await ready();
  orient = await orientation();
  await shot('13-daily-puzzle');
  for (let i = 0; i < 4 && !(await p.$('.done')); i++) {
    await ready();
    if (await p.$('.done')) break;
    await move(await hintMove());
    await p.waitForTimeout(900);
  }
  await waitDone();
  await p.click('.done-actions .btn:has-text("סיום")');
  await p.waitForSelector('[data-testid="home-daily"]');
  expect((await text('[data-testid="home-daily"]')).includes('נפתרה היום'), 'daily card shows solved');
  step('daily puzzle solved; home card shows ✅');

  // ---------- Puzzles screen and a puzzle with a mistake ----------
  await p.click('.action-puzzles');
  await p.waitForSelector('.theme-list');
  const openThemes = await p.$$eval('.theme-card:not([disabled])', (els) => els.map((e) => e.dataset.theme));
  expect(openThemes.includes('mateIn1') && openThemes.includes('hangingPiece') && openThemes.includes('fork'), 'themes open by part: ' + openThemes);
  await shot('14-puzzles-hub');
  await p.click('[data-theme="mateIn1"]');
  await p.waitForSelector('.puzzle .task');
  await p.waitForTimeout(1000);
  await ready();
  orient = await orientation();
  // A wrong move first: find a legal move that is not the solution.
  const right = await hintMove();
  const fen = await p.evaluate(() => window.__chessitTask.fen());
  const kingSq = (() => {
    const rows = fen.split(' ')[0].split('/');
    const me = fen.split(' ')[1];
    const k = me === 'w' ? 'K' : 'k';
    for (let i = 0; i < 8; i++) {
      let f = 0;
      for (const ch of rows[i]) {
        if (/\d/.test(ch)) f += Number(ch);
        else {
          if (ch === k) return FILES[f] + (8 - i);
          f++;
        }
      }
    }
  })();
  // Try king steps until one is accepted as a (wrong) move.
  for (const [df, dr] of [[0, 1], [1, 0], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const f = FILES.indexOf(kingSq[0]) + df;
    const r = Number(kingSq[1]) + dr;
    if (f < 0 || f > 7 || r < 1 || r > 8) continue;
    const to = FILES[f] + r;
    if (kingSq + to === right) continue;
    await move(kingSq + to);
    if ((await text('.feedback')).includes('נסה')) break;
  }
  await ready();
  await move(right);
  await waitDone();
  expect((await text('.done')).includes('תחזור'), 'puzzle with a mistake goes to review');
  await shot('15-puzzle-solved');
  step('mateIn1 puzzle: a mistake, then solved; scheduled for review');
  await p.click('.done-actions .btn:has-text("סיום")');
  await p.waitForSelector('.theme-list');
  await p.click('.btn-back');
  await p.waitForSelector('.who-name');

  // ---------- Spaced review: move the dates to the past ----------
  const before = await editProgress((pr) => {
    for (const k of Object.keys(pr.review)) pr.review[k].due = Date.now() - 1000;
    return pr;
  });
  const keys = Object.keys(before.review);
  expect(keys.some((k) => k.startsWith('s:chk-block')) && keys.some((k) => k.startsWith('p:mateIn1:')), 'station and puzzle in review: ' + keys);
  await p.reload();
  await p.waitForSelector('[data-testid="home-review"]');
  await shot('16-home-review-card');
  await p.click('[data-testid="home-review"]');
  await p.waitForSelector('.review-list');
  await shot('17-review-list');
  const puzzleKey = keys.find((k) => k.startsWith('p:mateIn1:')).slice(2);
  await p.click(`[data-review="${puzzleKey}"]`);
  await p.waitForSelector('.puzzle .task');
  await p.waitForTimeout(1000);
  await ready();
  orient = await orientation();
  await move(await hintMove());
  await waitDone();
  await p.click('.done-actions .btn:has-text("לחזרה")');
  await p.waitForSelector('.review');
  const after = await editProgress((pr) => pr);
  const entry = after.review['p:' + puzzleKey];
  expect(entry && entry.interval === 3 && entry.due > Date.now(), 'clean review moves the puzzle to 3 days: ' + JSON.stringify(entry));
  expect(!(await p.$(`[data-review="${puzzleKey}"]`)), 'puzzle left the due list');
  step('review: due items listed; a clean solve moves the puzzle to the 3-day interval');

  // ---------- A child profile: no placement, part 1 open ----------
  await p.click('.btn-back');
  await p.click('.who');
  await p.click('.btn:has-text("פרופיל חדש"), .profile-new');
  await p.waitForSelector('.form');
  await createProfile('נועה', '5–7', 'בת');
  expect(!(await p.$('.action-placement')), 'no placement offer for 5–7');
  await p.click('.action-learn');
  await p.waitForSelector('.map');
  expect((await p.getAttribute('[data-part="1"]', 'aria-expanded')) === 'true', 'part 1 open');
  expect((await p.getAttribute('[data-part="3"]', 'aria-expanded')) === 'false', 'part 3 collapsed');
  step('child profile: no placement offer, only part 1 open');

  // ---------- Dark mode ----------
  await p.emulateMedia({ colorScheme: 'dark' });
  await p.waitForTimeout(200);
  await shot('18-dark-map');
  await p.click('.btn-back');
  await p.click('.who');
  await p.click('.profile-pick:has-text("אבא")');
  await p.click('.action-learn');
  await p.waitForSelector('.map');
  await openStation(4, 'chk-run');
  await startPractice();
  await ready();
  await shot('19-dark-check-station');
  await p.click('.btn-back');
  await p.click('.btn-back');
  await p.waitForSelector('.who-name');
  await shot('20-dark-home');
  step('dark-mode screenshots');

  if (errors.length) {
    console.log('ERRORS:', errors);
    process.exitCode = 1;
  } else console.log('no page errors');
  await b.close();
})().catch((e) => {
  console.error('FAIL', e.message);
  process.exit(1);
});
