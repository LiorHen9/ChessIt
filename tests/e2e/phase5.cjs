const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
// Usage: node tests/e2e/phase5.cjs <screenshots-dir> [url]
// Themes and age fit, at phone size, from empty storage:
// - creating a profile suggests a theme by age and gender, and previews it live;
// - switching theme from home recolours the app and the pieces without a reload, and survives a reload;
// - SVG pieces on the board: move, capture, promotion (the picker shows SVG pieces too);
// - sounds are asked for on move / capture, and stop when the profile turns them off;
// - narration: with a mocked Hebrew voice the task is read with lang he-IL and clean text, and
//   reading stops when leaving the screen; without a Hebrew voice the 🔊 button is hidden and the
//   parent note is shown once;
// - PIN: set, wrong and right PIN on entry, PIN on edit, and reset by the parent question;
// - screenshots of the three themes (home, map, station) in light and dark, the picker and the PIN screen.
const SHOTS = process.argv[2] || '.';
const BASE = process.argv[3] || 'http://localhost:4173/';
const URL = BASE + (BASE.includes('?') ? '&' : '?') + 'seed=7';
const FILES = 'abcdefgh';

const MOCK_VOICE = () => {
  window.__spoken = [];
  window.__cancels = 0;
  const voice = { lang: 'he-IL', name: 'Carmit (mock)', localService: true, default: false, voiceURI: 'mock' };
  const fake = {
    getVoices: () => [voice],
    speak: (u) => window.__spoken.push({ text: u.text, lang: u.lang }),
    cancel: () => {
      window.__cancels++;
    },
    addEventListener() {},
    removeEventListener() {},
    pause() {},
    resume() {},
    speaking: false,
    pending: false,
    paused: false
  };
  Object.defineProperty(window, 'speechSynthesis', { value: fake, configurable: true });
};

(async () => {
  const b = await chromium.launch();
  const errors = [];
  const watch = (p) => {
    p.on('pageerror', (e) => errors.push('pageerror: ' + e));
    p.on('console', (m) => {
      const t = m.text();
      if ((m.type() === 'error' || m.type() === 'warning') && !t.includes('ERR_TUNNEL') && !t.includes('fonts.g')) errors.push(t);
    });
  };
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  watch(p);
  const shot = async (n, full = false) => p.screenshot({ path: `${SHOTS}/${n}.png`, fullPage: full });
  const step = (s) => console.log('✓', s);
  const expect = (cond, msg) => {
    if (!cond) throw new Error(msg);
  };
  const theme = () => p.evaluate(() => document.documentElement.dataset.theme ?? 'clean');
  const cssVar = (name) => p.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);
  const sounds = () => p.evaluate(() => [...(window.__chessitSounds ?? [])]);

  const center = async (sq) => {
    const box = await (await p.$('main svg.board')).boundingBox();
    const f = FILES.indexOf(sq[0]);
    const r = Number(sq[1]);
    return { x: box.x + (f + 0.5) * (box.width / 8), y: box.y + (8 - r + 0.5) * (box.height / 8) };
  };
  const tap = async (sq) => {
    const c = await center(sq);
    await p.mouse.click(c.x, c.y);
    await p.waitForTimeout(80);
  };
  const move = async (uci) => {
    await tap(uci.slice(0, 2));
    await tap(uci.slice(2, 4));
    await p.waitForTimeout(260);
  };
  const pieceAt = (sq) =>
    p.evaluate((sq) => {
      // The board is drawn white at the bottom: find the piece group whose <use> sits on that square.
      const x = 'abcdefgh'.indexOf(sq[0]) * 100 + 4;
      const y = (8 - Number(sq[1])) * 100 + 4;
      const g = [...document.querySelectorAll('main svg.board g.piece')].find((g) => {
        const u = g.querySelector('use');
        return Number(u.getAttribute('x')) === x && Number(u.getAttribute('y')) === y;
      });
      return g ? g.dataset.piece : null;
    }, sq);

  // ---------- Profile with a suggested theme ----------
  await p.goto(URL);
  await p.waitForSelector('.form');
  await p.fill('.input', 'יואב');
  await p.click('.seg:has-text("5–7")');
  await p.click('.seg:has-text("בן")');
  await p.waitForTimeout(300);
  expect(await p.$('.theme-card[data-theme-id="space"][aria-checked="true"] .theme-badge'), 'boy 5–7: space suggested and chosen');
  expect((await theme()) === 'space', 'editor previews the suggested theme live');
  await p.click('.seg:has-text("בת")');
  await p.waitForTimeout(300);
  expect(await p.$('.theme-card[data-theme-id="forest"][aria-checked="true"] .theme-badge'), 'girl 5–7: forest suggested');
  await p.click('.seg:has-text("13+")');
  await p.waitForTimeout(300);
  expect(await p.$('.theme-card[data-theme-id="clean"][aria-checked="true"] .theme-badge'), '13+: clean suggested');
  await p.click('.seg:has-text("5–7")');
  await p.click('.seg:has-text("בן")');
  await p.waitForTimeout(300);
  const avatars = await p.$$eval('.avatar-option', (els) => els.slice(0, 3).map((e) => e.textContent));
  expect(avatars[0] === '🚀', 'space avatars come first: ' + avatars);
  await shot('01-editor-space', true);
  await p.click('button[type=submit]');
  await p.waitForSelector('.home-head');
  await p.waitForTimeout(300);
  expect((await theme()) === 'space', 'new profile uses space');
  expect((await cssVar('--sq-dark')) === '#7b83d6', 'space board colours');
  step('profile editor suggests a theme by age and gender (space / forest / clean) and previews it');

  // ---------- Switching theme from home, no reload ----------
  await p.evaluate(() => (window.__noReload = true));
  await p.click('[data-testid="home-theme"]');
  await p.waitForSelector('.sheet .theme-card');
  await p.waitForTimeout(300);
  await shot('02-theme-sheet');
  await p.click('.sheet .theme-card[data-theme-id="forest"]');
  await p.waitForTimeout(300);
  expect((await theme()) === 'forest', 'switched to forest');
  expect((await cssVar('--sq-dark')) === '#789852', 'forest board colours');
  expect((await cssVar('--pc-bf')) === '#3a2715', 'forest piece colours');
  expect(await p.evaluate(() => window.__noReload === true), 'no reload happened');
  await p.click('.sheet .btn-primary');
  await p.reload();
  await p.waitForSelector('.home-head');
  await p.waitForTimeout(300);
  expect((await theme()) === 'forest', 'theme kept after reload');
  step('theme changes from home without a reload (colours and pieces) and is kept after reload');

  // ---------- SVG pieces: move, capture, promotion; sounds ----------
  await p.click('.action-primary');
  await p.waitForSelector('text=יוצאים לדרך!');
  for (const t of await p.$$('.toggle input')) if (await t.isChecked()) await t.uncheck(); // no rotation, no hints
  await p.click('text=יוצאים לדרך!');
  await p.waitForSelector('main svg.board');
  expect((await p.$$('main svg.board g.piece use')).length === 32, '32 SVG pieces');
  expect(!(await p.$('main svg.board g.piece text')), 'no text glyphs on the board');
  expect((await pieceAt('g1')) === 'wN' && (await pieceAt('e8')) === 'bK', 'pieces on their squares');
  const href = await p.$eval('main svg.board g.piece use', (u) => u.getAttribute('href'));
  expect(/^#pc-[wb][KQRBNP]$/.test(href), 'pieces use the sprite: ' + href);
  await move('e2e4');
  await move('d7d5');
  await move('e4d5');
  expect((await p.$$('main svg.board g.piece')).length === 31, 'capture removes a piece');
  expect((await pieceAt('d5')) === 'wP', 'white pawn on d5');
  expect((await p.$$('.player .cap')).length === 1 && (await p.$('.player svg.cap[data-piece="bP"]')), 'captured pawn shown as SVG');
  let heard = await sounds();
  expect(heard.includes('move') && heard.includes('capture'), 'move and capture sounds: ' + heard);
  for (const m of ['c7c6', 'd5c6', 'g8f6', 'c6b7', 'c8d7']) await move(m);
  await tap('b7');
  await tap('a8');
  await p.waitForSelector('.promo');
  expect((await p.$$('.promo .promo-glyph')).length === 4, 'promotion picker shows 4 SVG pieces');
  await shot('03-promotion');
  await p.click('.promo-btn >> nth=3'); // knight
  await p.waitForTimeout(300);
  expect((await pieceAt('a8')) === 'wN', 'promoted to a knight: ' + (await pieceAt('a8')));
  await shot('04-board-forest');
  step('board with SVG pieces: move, capture (+ captured bar), promotion to a knight; move/capture sounds');

  // Sounds off
  await p.click('.btn-back');
  await p.waitForSelector('.home-head');
  await p.click('[data-testid="home-settings"]');
  await p.waitForSelector('[data-setting="sound"]');
  await p.uncheck('[data-setting="sound"]');
  await p.waitForTimeout(150);
  await p.click('.btn-back');
  await p.click('.action-resume');
  await p.waitForSelector('main svg.board');
  const before = (await sounds()).length;
  await move('f6e4');
  await move('a8b6');
  expect((await sounds()).length === before, 'no sounds once the setting is off');
  step('sounds setting off: moves make no sound');

  // ---------- Narration fallback (no Hebrew voice in headless Chromium) ----------
  const heVoices = await p.evaluate(() => speechSynthesis.getVoices().filter((v) => /^(he|iw)/i.test(v.lang)).length);
  await p.click('.btn-back');
  await p.waitForSelector('.home-head');
  await p.click('.action-learn');
  await p.waitForSelector('.map');
  await p.click('[data-station="board-colors"]');
  await p.waitForSelector('.speech');
  if (heVoices === 0) {
    expect(!(await p.$('.speak-btn')), 'no 🔊 without a Hebrew voice');
    await p.waitForSelector('.narration-help', { timeout: 4000 });
    await shot('05-no-voice-note');
    await p.click('.narration-help .btn');
    await p.waitForTimeout(150);
    expect(!(await p.$('.narration-help')), 'note dismissed');
    await p.reload();
    await p.waitForSelector('.home-head');
    await p.click('.action-learn');
    await p.click('[data-station="board-colors"]');
    await p.waitForSelector('.speech');
    await p.waitForTimeout(2000);
    expect(!(await p.$('.narration-help')), 'the note is shown only once');
    step('no Hebrew voice: 🔊 hidden, a one-time note for the parent');
  } else {
    console.log('(this browser has a Hebrew voice; fallback checked only in the mocked context)');
  }

  // ---------- PIN ----------
  await p.click('.btn-back');
  await p.waitForSelector('.map');
  await p.click('.btn-back');
  await p.waitForSelector('.home-head');
  await p.click('[data-testid="home-settings"]');
  await p.click('[data-pin="set"]');
  await p.waitForSelector('.pinpad');
  await p.keyboard.type('2580');
  await p.waitForSelector('.pin-title:has-text("עוד פעם")');
  await p.keyboard.type('2580');
  await p.waitForSelector('[data-pin="remove"]');
  const stored = await p.evaluate(
    () =>
      new Promise((res) => {
        const r = indexedDB.open('chessit');
        r.onsuccess = () => {
          const q = r.result.transaction('profiles').objectStore('profiles').getAll();
          q.onsuccess = () => res(q.result[0]);
        };
      })
  );
  expect(stored.pinHash && stored.pinHash.length === 64 && !JSON.stringify(stored).includes('2580'), 'PIN stored as a SHA-256 hash only');
  await shot('06-settings', true);
  // Entry asks for the PIN (also after a reload, the last profile is not opened directly)
  await p.reload();
  await p.waitForSelector('.pinpad');
  await shot('07-pin');
  await p.keyboard.type('1111');
  await p.waitForSelector('.pin-dots.is-wrong');
  expect(await p.$('.pinpad'), 'wrong PIN keeps the PIN screen');
  for (const k of '2580') await p.click(`.pin-key[data-key="${k}"]`);
  await p.waitForSelector('.home-head');
  step('PIN: set with confirmation, stored hashed; wrong PIN refused, right PIN enters (also after reload)');
  // Editing asks too
  await p.click('.who');
  await p.waitForSelector('.profile-edit');
  await p.click('.profile-edit');
  await p.waitForSelector('.pinpad');
  await p.keyboard.type('2580');
  await p.waitForSelector('.form');
  await p.click('.btn-back');
  // Forgot: the parent question
  await p.click('.profile-pick');
  await p.waitForSelector('.pinpad');
  await p.click('text=שכחתי את ה-PIN');
  await p.fill('.parent-check .input', '1');
  await p.click('.parent-check .btn-primary');
  await p.waitForSelector('.parent-wrong');
  const q = await p.textContent('.parent-q');
  const [a, bb] = q.split('×').map((x) => Number(x.trim()));
  await p.fill('.parent-check .input', String(a * bb));
  await shot('08-parent-question');
  await p.click('.parent-check .btn-primary');
  await p.waitForSelector('.home-head');
  await p.click('.who');
  await p.click('.profile-pick');
  await p.waitForSelector('.home-head');
  step('PIN asked before editing; "forgot" with a wrong then right parent answer removes the PIN');

  // ---------- Screenshots: every theme, light and dark ----------
  for (const id of ['clean', 'space', 'forest']) {
    await p.click('[data-testid="home-theme"]');
    await p.click(`.sheet .theme-card[data-theme-id="${id}"]`);
    await p.click('.sheet .btn-primary');
    await p.waitForTimeout(200);
    for (const scheme of ['light', 'dark']) {
      await p.emulateMedia({ colorScheme: scheme });
      await p.waitForTimeout(150);
      await shot(`10-${id}-${scheme}-home`);
      await p.click('.action-learn');
      await p.waitForSelector('.map');
      await p.waitForTimeout(200);
      await shot(`11-${id}-${scheme}-map`);
      await p.click('[data-station="board-colors"]');
      await p.click('.go-btn');
      await p.waitForSelector('.task');
      await tap('a1');
      await p.waitForTimeout(150);
      await shot(`12-${id}-${scheme}-station`);
      await p.click('.btn-back');
      await p.waitForSelector('.map');
      await p.click('.btn-back');
      await p.waitForSelector('.home-head');
    }
  }
  await p.emulateMedia({ colorScheme: 'light' });
  step('screenshots of clean / space / forest in light and dark');

  // ---------- Narration with a (mocked) Hebrew voice ----------
  const ctx2 = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await ctx2.addInitScript(MOCK_VOICE);
  const p2 = await ctx2.newPage();
  watch(p2);
  await p2.goto(URL);
  await p2.waitForSelector('.form');
  await p2.fill('.input', 'נועה');
  await p2.click('.seg:has-text("5–7")');
  await p2.click('.seg:has-text("בת")');
  await p2.click('button[type=submit]');
  await p2.waitForSelector('.home-head');
  await p2.click('.action-learn');
  await p2.click('[data-station="board-colors"]');
  await p2.waitForSelector('.speech .speak-btn');
  await p2.waitForTimeout(300);
  let spoken = await p2.evaluate(() => window.__spoken);
  expect(spoken.length >= 1 && spoken[0].lang === 'he-IL', 'the explanation is read aloud in he-IL: ' + JSON.stringify(spoken));
  await p2.click('.go-btn');
  await p2.waitForSelector('.task .speak-btn');
  await p2.waitForTimeout(300);
  spoken = await p2.evaluate(() => window.__spoken);
  const last = spoken[spoken.length - 1].text;
  expect(!/[\u{1F300}-\u{1FAFF}☀-➿︎️♔-♟]/u.test(last), 'spoken text has no emoji or symbols: ' + last);
  await p2.evaluate(() => (window.__spoken = []));
  await p2.click('.task .speak-btn');
  expect((await p2.evaluate(() => window.__spoken.length)) === 1, '🔊 reads the task');
  expect(!(await p2.$('.narration-help')), 'no install note when a Hebrew voice exists');
  const cancels = await p2.evaluate(() => window.__cancels);
  await p2.click('.btn-back');
  await p2.waitForSelector('.map');
  // (The App stops reading in an effect, just after the new screen renders.)
  await p2.waitForFunction((n) => window.__cancels > n, cancels, { timeout: 3000 }).catch(() => {});
  expect((await p2.evaluate(() => window.__cancels)) > cancels, 'reading stops when leaving the screen');
  await p2.screenshot({ path: `${SHOTS}/09-forest-girl-map.png` });
  step('mocked Hebrew voice: explanation and task read in he-IL with clean text, 🔊 works, stops on leaving');

  // An adult does not get automatic reading (the button still works).
  await p2.click('.btn-back');
  await p2.click('.who');
  await p2.click('text=+ פרופיל חדש');
  await p2.fill('.input', 'אמא');
  await p2.click('.seg:has-text("13+")');
  await p2.click('button[type=submit]');
  await p2.waitForSelector('.home-head');
  expect((await p2.evaluate(() => document.documentElement.dataset.theme ?? 'clean')) === 'clean', 'adult: clean theme');
  await p2.evaluate(() => (window.__spoken = []));
  await p2.click('.action-learn');
  await p2.click('[data-station="board-colors"]');
  await p2.waitForSelector('.speech .speak-btn');
  await p2.waitForTimeout(400);
  expect((await p2.evaluate(() => window.__spoken.length)) === 0, 'adult: no automatic reading by default');
  step('13+ profile: clean theme, narration off by default but 🔊 available');

  if (errors.length) throw new Error('console errors:\n' + errors.join('\n'));
  await b.close();
  console.log('phase 5 OK');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
