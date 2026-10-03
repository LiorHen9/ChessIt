const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const fs = require('fs');
const path = require('path');
const a11y = require('./a11y.cjs');
// Usage: node tests/e2e/phase7.cjs <screenshots-dir> [url]
// Polish and launch, at phone size:
// - backup: the reminder after 20 stations ("not now" hides it for good); a downloaded file that is a
//   valid backup (format, version, date, every profile with its progress and settings, the PIN only
//   as a hash, no open game or room);
// - restore in a clean browser: from the first screen, broken / foreign / future files are refused
//   with a clear line and nothing is written; a good file shows a preview and brings back the
//   profiles, the stars, the settings and the PIN;
// - "add" (a profile on both: keep or take from the backup, per profile) and "replace all" (a parent
//   question; an open game of a profile that is gone is closed);
// - About: version, privacy, credits; the problem report includes a recent error and is copied;
//   "delete all data" (two confirmations, the second a parent question) leaves an empty app;
// - touch targets of 44px and text contrast (WCAG AA) on the main screens, in light and dark, and
//   every icon button has a name; the board works with the keyboard; focus is visible;
// - reduced motion: no animations run, celebrations are hidden.
const SHOTS = process.argv[2] || '.';
const BASE = process.argv[3] || 'http://localhost:4173/';
const URL = BASE + (BASE.includes('?') ? '&' : '?') + 'seed=7&transport=local';
const TMP = fs.mkdtempSync(path.join(require('os').tmpdir(), 'chessit-p7-'));

const step = (s) => console.log('✓', s);
const expect = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

// IndexedDB from the page (the app's own database).
const DB = {
  all: (p, store) =>
    p.evaluate(
      (store) =>
        new Promise((res, rej) => {
          const r = indexedDB.open('chessit');
          r.onsuccess = () => {
            const q = r.result.transaction(store).objectStore(store).getAll();
            q.onsuccess = () => {
              r.result.close();
              res(q.result);
            };
            q.onerror = () => rej(q.error);
          };
          r.onerror = () => rej(r.error);
        }),
      store
    ),
  keys: (p, store) =>
    p.evaluate(
      (store) =>
        new Promise((res) => {
          const r = indexedDB.open('chessit');
          r.onsuccess = () => {
            const q = r.result.transaction(store).objectStore(store).getAllKeys();
            q.onsuccess = () => {
              r.result.close();
              res(q.result);
            };
          };
        }),
      store
    ),
  put: (p, store, key, value) =>
    p.evaluate(
      ([store, key, value]) =>
        new Promise((res) => {
          const r = indexedDB.open('chessit');
          r.onsuccess = () => {
            const tx = r.result.transaction(store, 'readwrite');
            tx.objectStore(store).put(value, key);
            tx.oncomplete = () => {
              r.result.close();
              res();
            };
          };
        }),
      [store, key, value]
    )
};

const progressWith = (profileId, stationIds, stars = 3) => ({
  profileId,
  stations: Object.fromEntries(stationIds.map((id, i) => [id, { stars, completedAt: 1759400000000 + i }])),
  review: {},
  engineLevel: 2,
  stats: { games: 4, wins: 3, draws: 0, puzzlesSolved: 5 },
  vsComputer: { 1: { games: 4, wins: 3, losses: 1, draws: 0 } },
  computerStreak: null,
  puzzles: { 'fork:abc12': { solvedAt: 1759400000000, clean: true } },
  daily: null,
  placement: null
});

const parentAnswer = async (p) => {
  const q = await p.textContent('.parent-q');
  const [a, b] = q.split('×').map((x) => Number(x.trim()));
  return String(a * b);
};

(async () => {
  const b = await chromium.launch();
  const errors = [];
  const watch = (p, name) => {
    p.on('pageerror', (e) => {
      if (!String(e).includes('phase7 boom')) errors.push(`${name} pageerror: ${e}`);
    });
    p.on('console', (m) => {
      const t = m.text();
      if (m.type() !== 'error') return;
      if (t.includes('ERR_TUNNEL') || t.includes('phase7 boom')) return;
      errors.push(`${name}: ${t}`);
    });
  };
  const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, acceptDownloads: true };

  // ---------- Phone A: a family with progress, a PIN and settings ----------
  const ctxA = await b.newContext(phone);
  const p = await ctxA.newPage();
  watch(p, 'A');
  const shot = (n, full = false, page = p) => page.screenshot({ path: `${SHOTS}/${n}.png`, fullPage: full });
  await p.goto(URL);
  await p.waitForSelector('.form');
  await p.fill('.input', 'אבא');
  await p.click('.seg:has-text("13+")');
  await p.click('.theme-card[data-theme-id="forest"]');
  await p.click('button[type=submit]');
  await p.waitForSelector('.home-head');
  // PIN and sound off
  await p.click('[data-testid="home-settings"]');
  await p.click('[data-pin="set"]');
  await p.waitForSelector('.pinpad');
  await p.keyboard.type('1234');
  await p.waitForSelector('.pin-title:has-text("עוד פעם")');
  await p.keyboard.type('1234');
  await p.waitForSelector('[data-pin="remove"]');
  await p.uncheck('[data-setting="sound"]');
  await p.click('.btn-back');
  await p.click('.who');
  await p.click('text=+ פרופיל חדש');
  await p.fill('.input', 'נועה');
  await p.click('.seg:has-text("5–7")');
  await p.click('.seg:has-text("בת")');
  await p.click('button[type=submit]');
  await p.waitForSelector('.home-head');

  const profilesA = await DB.all(p, 'profiles');
  const dad = profilesA.find((x) => x.name === 'אבא');
  const noa = profilesA.find((x) => x.name === 'נועה');
  // Progress as if played: 20 stations for אבא (the reminder), 3 for נועה.
  // Real station ids (the first 20 of the path), so the home screen counts them.
  const ids = [
    'board-colors', 'board-lines', 'board-names', 'board-hunt', 'board-setup',
    'rook-moves', 'rook-stars', 'rook-capture', 'rook-hungry', 'bishop-moves',
    'bishop-stars', 'bishop-hungry', 'queen-moves', 'queen-stars', 'queen-hungry',
    'king-moves', 'king-stars', 'king-hungry', 'knight-moves', 'knight-stars'
  ];
  await DB.put(p, 'progress', dad.id, progressWith(dad.id, ids, 2));
  await DB.put(p, 'progress', noa.id, progressWith(noa.id, ids.slice(0, 3), 3));
  // An open game and a room seat: device state that must not go into the backup.
  await DB.put(p, 'meta', 'currentGame', { whiteId: noa.id, blackId: 'guest', moves: ['e2e4'], options: { rotate: false, hints: true }, startedAt: 1 });
  await DB.put(p, 'meta', `room:${noa.id}`, { code: 'ACDEF', seat: 'host', ticket: 'x'.repeat(24), transport: 'local', joinedAt: 1 });

  // The reminder: אבא has 20 stations, no backup yet.
  // The last profile was נועה (no PIN): switch to אבא.
  await p.reload();
  await p.waitForSelector('.home-head');
  await p.click('.who');
  await p.click('.profile-pick:has-text("אבא")');
  await p.waitForSelector('.pinpad');
  await p.keyboard.type('1234');
  await p.waitForSelector('.home-head');
  await p.waitForSelector('[data-testid="backup-nudge"]');
  await shot('01-backup-nudge');
  await p.click('[data-testid="nudge-dismiss"]');
  await p.waitForTimeout(200);
  expect(!(await p.$('[data-testid="backup-nudge"]')), 'nudge hidden after "not now"');
  await p.reload();
  await p.waitForSelector('.pinpad');
  await p.keyboard.type('1234');
  await p.waitForSelector('.home-head');
  expect(!(await p.$('[data-testid="backup-nudge"]')), 'nudge stays hidden after a reload');
  step('backup reminder after 20 stations; "not now" hides it for good');

  // Back up from the settings.
  await p.click('[data-testid="home-settings"]');
  await p.click('[data-testid="settings-backup"]');
  await p.waitForSelector('[data-view="main"]');
  expect((await p.textContent('[data-testid="last-backup"]')).includes('עוד לא'), 'no backup yet');
  await shot('02-backup', true);
  const [download] = await Promise.all([p.waitForEvent('download'), p.click('[data-backup="download"]')]);
  const name = download.suggestedFilename();
  expect(/^chessit-backup-\d{4}-\d{2}-\d{2}\.json$/.test(name), 'file name with the date: ' + name);
  const file = path.join(TMP, name);
  await download.saveAs(file);
  const text = fs.readFileSync(file, 'utf8');
  const backup = JSON.parse(text);
  expect(backup.format === 'chessit-backup' && backup.version === 1 && backup.schemaVersion === 1, 'format, version and schema');
  expect(!Number.isNaN(Date.parse(backup.exportedAt)) && backup.app === '0.9.0', 'export time and app version');
  expect(backup.profiles.length === 2 && backup.progress.length === 2, 'both profiles and their progress');
  expect(Object.keys(backup.progress.find((x) => x.profileId === dad.id).stations).length === 20, 'stations in the file');
  const dadInFile = backup.profiles.find((x) => x.id === dad.id);
  expect(dadInFile.pinHash && dadInFile.pinHash.length === 64 && dadInFile.pinSalt, 'PIN as a hash and salt');
  expect(!text.includes('1234'), 'the PIN digits are not in the file');
  expect(backup.settings.find((s) => s.profileId === dad.id)?.sound === false, 'settings in the file');
  expect(!('meta' in backup) && !text.includes('ACDEF') && !text.includes('currentGame'), 'no open game or room in the file');
  await p.waitForSelector('[data-testid="backup-note"].is-good');
  expect(!(await p.textContent('[data-testid="last-backup"]')).includes('עוד לא'), 'last backup date shown');
  step(`backup file downloaded and valid (${name}, ${Math.round(text.length / 1024)}KB): profiles, progress, settings, PIN hash only, no device state`);

  // ---------- Phone B: a clean browser restores it ----------
  const ctxB = await b.newContext(phone);
  const q = await ctxB.newPage();
  watch(q, 'B');
  await q.goto(URL);
  await q.waitForSelector('.form');
  await q.click('[data-testid="editor-restore"]');
  await q.waitForSelector('[data-view="main"]');
  // Files that are not a (good) backup: refused, nothing written.
  const bad = [
    ['garbage.json', 'hello, this is not json', 'לא קובץ גיבוי'],
    ['other.json', JSON.stringify({ hello: 'world' }), 'לא קובץ גיבוי'],
    ['future.json', JSON.stringify({ ...backup, version: 99 }), 'גרסה חדשה יותר'],
    ['broken.json', JSON.stringify({ ...backup, profiles: [{ ...backup.profiles[0], ageGroup: 'baby' }, backup.profiles[1]] }), 'פגום'],
    ['orphan.json', JSON.stringify({ ...backup, progress: [...backup.progress, { ...backup.progress[0], profileId: 'p_nobody' }] }), 'פגום'],
    ['cut.json', text.slice(0, Math.floor(text.length / 2)), 'לא קובץ גיבוי']
  ];
  for (const [fname, content, want] of bad) {
    fs.writeFileSync(path.join(TMP, fname), content);
    await q.setInputFiles('[data-testid="backup-file"]', path.join(TMP, fname));
    await q.waitForSelector('[data-testid="backup-note"].is-bad');
    const msg = await q.textContent('[data-testid="backup-note"]');
    expect(msg.includes(want), `${fname}: "${msg}" should say "${want}"`);
    expect((await DB.all(q, 'profiles')).length === 0, `${fname}: nothing written`);
  }
  await shot('03-restore-refused', false, q);
  step('broken, foreign, cut and future files are refused with a clear line, and nothing is written');

  await q.setInputFiles('[data-testid="backup-file"]', file);
  await q.waitForSelector('[data-view="preview"]');
  expect((await q.textContent('[data-testid="backup-found"]')).includes('נמצאו'), 'preview line');
  expect(await q.$('.fam-line:has-text("אבא")'), 'preview lists אבא');
  expect(await q.$('.fam-line:has-text("נועה")'), 'preview lists נועה');
  await shot('04-restore-preview', true, q);
  expect((await DB.all(q, 'profiles')).length === 0, 'preview writes nothing');
  await q.click('[data-restore="add"]');
  await q.waitForSelector('[data-view="done"]');
  await shot('05-restore-done', false, q);
  await q.click('[data-restore="continue"]');
  await q.waitForSelector('.profile-grid');
  expect((await q.$$('.profile-pick')).length === 2, 'two profiles after restore');
  await q.click('.profile-pick:has-text("אבא")');
  await q.waitForSelector('.pinpad');
  await q.keyboard.type('9999');
  await q.waitForSelector('.pin-dots.is-wrong');
  await q.keyboard.type('1234');
  await q.waitForSelector('.home-head');
  // The theme is a lazy chunk: wait for it to apply.
  await q.waitForFunction(() => document.documentElement.dataset.theme === 'forest', null, { timeout: 5000 }).catch(() => {
    throw new Error('theme restored');
  });
  expect((await q.textContent('.action-learn')).includes('20'), 'stations restored on home');
  await q.click('[data-testid="home-settings"]');
  expect(!(await q.isChecked('[data-setting="sound"]')), 'sound setting restored (off)');
  expect(await q.$('[data-pin="remove"]'), 'PIN restored');
  step('restore in a clean browser: preview, then profiles, stars, theme, settings and PIN are back');

  // ---------- Add: one new profile, one conflict taken from the backup, one kept ----------
  // An open game of אבא on phone B (must survive "add").
  await DB.put(q, 'meta', 'currentGame', { whiteId: dad.id, blackId: 'guest', moves: ['e2e4'], options: { rotate: false, hints: true }, startedAt: 2 });
  const grandpa = { id: 'p_grandpa_1', name: 'סבא', avatar: '🦉', ageGroup: 'teenAdult', themeId: 'clean', createdAt: 1759000000000 };
  const newer = {
    ...backup,
    profiles: [...backup.profiles, grandpa],
    progress: [
      backup.progress.find((x) => x.profileId === dad.id),
      progressWith(noa.id, ids.slice(0, 8), 3), // נועה went further on another phone
      progressWith(grandpa.id, ids.slice(0, 1), 1)
    ]
  };
  fs.writeFileSync(path.join(TMP, 'newer.json'), JSON.stringify(newer));
  await q.click('[data-testid="settings-backup"]');
  await q.waitForSelector('[data-view="main"]');
  await q.setInputFiles('[data-testid="backup-file"]', path.join(TMP, 'newer.json'));
  await q.waitForSelector('[data-view="preview"]');
  expect((await q.$$('.fam-badge')).length === 2, 'two profiles marked "already on the phone"');
  await q.click('[data-restore="add"]');
  await q.waitForSelector('[data-view="conflicts"]');
  expect((await q.$$('[data-conflict]')).length === 2, 'a choice for each conflict');
  await q.click(`[data-conflict="${noa.id}"] [data-choice="replace"]`);
  await shot('06-restore-conflicts', true, q);
  await q.click('[data-restore="confirm-add"]');
  await q.waitForSelector('[data-view="done"]');
  expect((await q.textContent('[data-view="done"]')).includes('2'), 'two profiles written (סבא, נועה)');
  const afterAdd = await DB.all(q, 'progress');
  expect((await DB.all(q, 'profiles')).length === 3, 'three profiles after add');
  expect(Object.keys(afterAdd.find((x) => x.profileId === noa.id).stations).length === 8, 'נועה taken from the backup');
  expect(Object.keys(afterAdd.find((x) => x.profileId === dad.id).stations).length === 20, 'אבא kept');
  expect((await DB.keys(q, 'meta')).includes('currentGame'), 'open game of a kept profile stays');
  step('"add": new profile added; per conflict, keep the phone\'s or take the backup\'s; open game kept');

  // ---------- Replace all ----------
  const grandma = { id: 'p_grandma_1', name: 'סבתא', avatar: '🐢', ageGroup: 'teenAdult', themeId: 'space', createdAt: 1759000000000 };
  fs.writeFileSync(path.join(TMP, 'grandma.json'), JSON.stringify({ ...backup, profiles: [grandma], progress: [], settings: [] }));
  await q.click('[data-restore="continue"]');
  await q.waitForSelector('.profile-grid');
  await q.click('[data-testid="picker-backup"]');
  await q.waitForSelector('[data-view="main"]');
  await q.setInputFiles('[data-testid="backup-file"]', path.join(TMP, 'grandma.json'));
  await q.waitForSelector('[data-view="preview"]');
  await q.click('[data-restore="replace"]');
  await q.waitForSelector('[data-view="replace"]');
  await q.fill('.parent-check .input', '1');
  await q.click('.parent-check .btn-danger');
  await q.waitForSelector('.parent-wrong');
  expect((await DB.all(q, 'profiles')).length === 3, 'wrong answer: nothing replaced');
  await q.fill('.parent-check .input', await parentAnswer(q));
  await shot('07-restore-replace', true, q);
  await q.click('.parent-check .btn-danger');
  await q.waitForSelector('[data-view="done"]');
  await q.click('[data-restore="continue"]');
  await q.waitForSelector('.profile-grid');
  const left = await DB.all(q, 'profiles');
  expect(left.length === 1 && left[0].name === 'סבתא', 'only סבתא after replace');
  expect(!(await DB.keys(q, 'meta')).includes('currentGame'), 'open game of a removed profile closed');
  await q.click('.profile-pick');
  await q.waitForSelector('.home-head');
  expect(!(await q.$('text=המשך המשחק')), 'no "continue the game" for a game that is gone');
  step('"replace all": parent question (wrong answer changes nothing), then only the backup\'s profiles; stale open game removed');

  // ---------- About, problem report, delete everything ----------
  await q.click('[data-testid="home-settings"]');
  await q.click('[data-testid="settings-about"]');
  await q.waitForSelector('.about');
  const about = await q.textContent('.about');
  expect((await q.textContent('[data-testid="about-version"]')).includes('0.9.0'), 'version shown');
  for (const w of ['רק בטלפון הזה', 'בלי פרסומות', 'Stockfish', 'chess.js', 'Preact', 'cburnett', 'Lichess', 'Nayuki', 'GPL-3.0', 'CC0', 'Rubik'])
    expect(about.includes(w), 'About mentions ' + w);
  await shot('08-about', false, q);
  await shot('08-about-full', true, q);
  // A recent error goes into the local log, and from there into the report.
  await q.evaluate(() => setTimeout(() => {
    throw new Error('phase7 boom');
  }));
  await q.waitForTimeout(300);
  await q.click('.btn-back');
  await q.click('[data-testid="settings-report"]');
  await q.waitForSelector('[data-testid="report-text"]');
  await q.waitForFunction(() => document.querySelector('[data-testid="report-text"]').textContent.includes('phase7 boom'));
  const report = await q.textContent('[data-testid="report-text"]');
  expect(report.includes('ChessIt 0.9.0') && report.includes('מכשיר:') && report.includes('שגיאות אחרונות (1)'), 'report: version, device, errors');
  expect(!report.includes('סבתא'), 'report has no names');
  await ctxB.grantPermissions(['clipboard-read', 'clipboard-write']);
  await q.click('[data-report="copy"]');
  await q.waitForSelector('[data-testid="report-copied"].is-good');
  expect((await q.evaluate(() => navigator.clipboard.readText())).includes('phase7 boom'), 'report copied');
  await shot('09-report', false, q);
  step('About: version, privacy, credits; the report lists version, device and the recent error (no names) and copies');

  await q.click('[data-delete="start"]');
  await q.click('[data-delete="sure"]');
  await q.waitForSelector('[data-testid="parent-check"]');
  await shot('10-delete-all', false, q);
  await q.fill('.parent-check .input', await parentAnswer(q));
  await Promise.all([q.waitForNavigation(), q.click('.parent-check .btn-danger')]);
  await q.waitForSelector('.form');
  for (const s of ['profiles', 'progress', 'settings', 'meta']) expect((await DB.keys(q, s)).length === 0, `${s} empty after delete all`);
  step('delete all data: two confirmations (the second a parent question), then the app starts empty');

  // ---------- Touch targets, contrast and names on the main screens ----------
  const ctxC = await b.newContext({ ...phone, viewport: { width: 360, height: 740 } });
  const r = await ctxC.newPage();
  watch(r, 'C');
  const problems = [];
  const audit = async (name, opts = { contrast: true }) => {
    await r.waitForTimeout(350);
    for (const x of await a11y.touchTargets(r)) problems.push(`${name}: small target ${x}`);
    for (const x of await a11y.unlabelled(r)) problems.push(`${name}: no name ${x}`);
    if (opts.contrast)
      for (const x of await a11y.textContrast(r)) problems.push(`${name}: contrast ${x.ratio}<${x.min} "${x.text}" (${x.cls})${x.disabled ? ' disabled' : ''}`);
  };
  const scheme = async (s) => r.emulateMedia({ colorScheme: s });
  await r.goto(URL);
  await r.waitForSelector('.form');
  await audit('editor');
  await r.fill('.input', 'דנה');
  await r.click('.seg:has-text("8–12")');
  await r.click('button[type=submit]');
  await r.waitForSelector('.home-head');
  await DB.put(r, 'progress', (await DB.all(r, 'profiles'))[0].id, progressWith((await DB.all(r, 'profiles'))[0].id, ids, 2));
  await r.reload();
  await r.waitForSelector('[data-testid="backup-nudge"]');
  const screens = [
    ['home', async () => {}],
    ['theme sheet', async () => r.click('[data-testid="home-theme"]'), async () => r.click('.sheet .btn-primary')],
    ['settings', async () => r.click('[data-testid="home-settings"]')],
    ['pin set', async () => r.click('[data-pin="set"]')],
    ['about', async () => {
      await r.goto(URL);
      await r.waitForSelector('.home-head');
      await r.click('[data-testid="home-settings"]');
      await r.click('[data-testid="settings-about"]');
      await r.waitForSelector('.about');
    }],
    ['backup', async () => {
      await r.click('.btn-back');
      await r.click('[data-testid="settings-backup"]');
      await r.waitForSelector('[data-view="main"]');
    }],
    ['backup preview', async () => {
      await r.setInputFiles('[data-testid="backup-file"]', path.join(TMP, 'newer.json'));
      await r.waitForSelector('[data-view="preview"]');
    }],
    ['picker', async () => {
      await r.goto(URL);
      await r.waitForSelector('.home-head');
      await r.click('.who');
      await r.waitForSelector('.profile-grid');
    }],
    ['map', async () => {
      await r.click('.profile-pick');
      await r.waitForSelector('.home-head');
      await r.click('.action-learn');
      await r.waitForSelector('.map');
    }],
    ['station', async () => {
      await r.click('.node-btn >> nth=0');
      await r.waitForSelector('.station');
      await r.waitForTimeout(600);
    }],
    ['game setup', async () => {
      await r.goto(URL);
      await r.waitForSelector('.home-head');
      await r.click('.action-primary');
      await r.waitForSelector('text=יוצאים לדרך!');
    }],
    ['game', async () => {
      await r.click('text=יוצאים לדרך!');
      await r.waitForSelector('main svg.board');
    }],
    ['computer setup', async () => {
      await r.goto(URL);
      await r.waitForSelector('.home-head');
      await r.click('.action-computer');
      await r.waitForSelector('.level-grid');
    }],
    ['puzzles', async () => {
      await r.goto(URL);
      await r.waitForSelector('.home-head');
      await r.click('.action-puzzles');
      await r.waitForTimeout(500);
    }],
    ['daily puzzle', async () => {
      await r.goto(URL);
      await r.waitForSelector('.home-head');
      await r.click('[data-testid="home-daily"]');
      await r.waitForSelector('main svg.board');
      await r.waitForTimeout(800);
    }],
    ['room menu', async () => {
      await r.goto(URL);
      await r.waitForSelector('.home-head');
      await r.click('[data-testid="home-room"]');
      await r.waitForSelector('text=פתיחת חדר');
    }],
    ['room join keypad', async () => {
      await r.click('text=הצטרפות לחדר');
      await r.waitForTimeout(400);
    }],
    ['room waiting', async () => {
      await r.goto(URL);
      await r.waitForSelector('.home-head');
      await r.click('[data-testid="home-room"]');
      await r.click('text=פתיחת חדר');
      await r.waitForTimeout(300);
      await r.click('[data-testid="room-open"]');
      await r.waitForSelector('[data-testid="room-qr"]');
      await r.waitForTimeout(600);
    }]
  ];
  for (const s of ['light', 'dark']) {
    await scheme(s);
    await r.goto(URL);
    await r.waitForSelector('.home-head');
    for (const [name, open, close] of screens) {
      await open();
      await audit(`${s}/${name}`);
      if (close) await close();
    }
  }
  // The other two themes, light and dark, on the screens with the most colour.
  for (const theme of ['space', 'forest']) {
    for (const s of ['light', 'dark']) {
      await scheme(s);
      await r.goto(URL);
      await r.waitForSelector('.home-head');
      await r.click('[data-testid="home-theme"]');
      await r.click(`.sheet .theme-card[data-theme-id="${theme}"]`);
      await r.click('.sheet .btn-primary');
      await audit(`${theme}/${s}/home`);
      await r.click('.action-learn');
      await r.waitForSelector('.map');
      await audit(`${theme}/${s}/map`);
      await r.click('.node-btn >> nth=0');
      await r.waitForSelector('.station');
      await audit(`${theme}/${s}/station`);
      await r.goto(URL);
      await r.waitForSelector('.home-head');
      await r.click('[data-testid="home-settings"]');
      await r.click('[data-testid="settings-about"]');
      await r.waitForSelector('.about');
      await audit(`${theme}/${s}/about`);
      await shot(`11-dark-${theme}-${s}`, false, r);
      if (s === 'dark') {
        await r.click('.btn-back');
        await r.click('.btn-back');
        await shot(`12-home-${theme}-dark`, false, r);
      }
    }
  }
  await scheme('dark');
  await r.goto(URL);
  await r.waitForSelector('.home-head');
  await r.click('[data-testid="home-theme"]');
  await r.click('.sheet .theme-card[data-theme-id="clean"]');
  await r.click('.sheet .btn-primary');
  await shot('12-home-clean-dark', false, r);
  await scheme('light');
  if (problems.length) {
    console.log(problems.join('\n'));
    throw new Error(`${problems.length} accessibility problems`);
  }
  step('44px touch targets, WCAG AA text contrast and named buttons on 18 screens (light + dark), and in all three themes');

  // ---------- Keyboard: focus ring, and a move on the board ----------
  await r.goto(URL);
  await r.waitForSelector('.home-head');
  await r.keyboard.press('Tab');
  const ring = await r.evaluate(() => {
    const el = document.activeElement;
    const st = getComputedStyle(el);
    return { tag: el.tagName, style: st.outlineStyle, width: parseFloat(st.outlineWidth) };
  });
  expect(ring.style === 'solid' && ring.width >= 2, 'visible focus ring: ' + JSON.stringify(ring));
  await r.click('.action-primary');
  await r.waitForSelector('text=יוצאים לדרך!');
  for (const t of await r.$$('.toggle input')) if (await t.isChecked()) await t.uncheck();
  await r.click('text=יוצאים לדרך!');
  await r.waitForSelector('main svg.board[role=application]');
  await r.focus('main svg.board');
  await r.keyboard.press('ArrowUp'); // shows the cursor
  // Walk the cursor to e2 from wherever it starts.
  const at = async () => (await r.textContent('[data-testid="board-cursor"]')).slice(0, 2);
  const goTo = async (sq) => {
    for (let i = 0; i < 20 && (await at()) !== sq; i++) {
      const cur = await at();
      const df = 'abcdefgh'.indexOf(sq[0]) - 'abcdefgh'.indexOf(cur[0]);
      const dr = Number(sq[1]) - Number(cur[1]);
      await r.keyboard.press(df > 0 ? 'ArrowRight' : df < 0 ? 'ArrowLeft' : dr > 0 ? 'ArrowUp' : 'ArrowDown');
    }
  };
  await goTo('e2');
  expect((await r.textContent('[data-testid="board-cursor"]')).includes('רגלי לבן'), 'cursor reads the piece');
  await r.keyboard.press('Enter');
  await goTo('e4');
  expect((await r.textContent('[data-testid="board-cursor"]')).includes('אפשר לזוז לכאן'), 'cursor says the move is possible');
  await shot('13-keyboard', false, r);
  await r.keyboard.press(' ');
  await r.waitForTimeout(400);
  const e4 = await r.evaluate(() => {
    const g = [...document.querySelectorAll('main svg.board g.piece')].find((g) => {
      const u = g.querySelector('use');
      return Number(u.getAttribute('x')) === 404 && Number(u.getAttribute('y')) === 404;
    });
    return g?.dataset.piece;
  });
  expect(e4 === 'wP', 'keyboard moved the pawn to e4');
  step('keyboard: visible focus ring; on the board arrows move a cursor (read out), Enter/Space pick and move (e2–e4)');

  // ---------- Reduced motion ----------
  const ctxD = await b.newContext({ ...phone, reducedMotion: 'reduce' });
  const d = await ctxD.newPage();
  watch(d, 'D');
  await d.goto(URL);
  await d.waitForSelector('.form');
  await d.fill('.input', 'יואב');
  await d.click('.seg:has-text("5–7")');
  await d.click('button[type=submit]');
  await d.waitForSelector('.home-head');
  await d.click('.action-learn');
  await d.waitForSelector('.node.is-here');
  expect((await d.evaluate(() => document.getAnimations().length)) === 0, 'map: "you are here" does not pulse');
  await d.goto(URL);
  await d.waitForSelector('.home-head');
  await d.click('[data-testid="home-room"]');
  await d.click('text=פתיחת חדר');
  await d.waitForTimeout(300);
  await d.click('[data-testid="room-open"]');
  await d.waitForSelector('[data-testid="room-qr"]');
  await d.waitForTimeout(600);
  expect((await d.evaluate(() => document.getAnimations().length)) === 0, 'room: the waiting dot does not pulse');
  const hidden = await d.evaluate(() => {
    const c = document.createElement('div');
    c.className = 'confetti';
    c.innerHTML = '<span class="confetti-bit"></span>';
    document.body.appendChild(c);
    const r = getComputedStyle(c).display;
    c.remove();
    return r;
  });
  expect(hidden === 'none', 'celebrations hidden');
  step('reduced motion: no running animations (map, room), celebrations hidden');

  if (errors.length) {
    console.log(errors.join('\n'));
    throw new Error('page errors');
  }
  console.log('no page errors');
  console.log('phase 7: all checks passed');
  await b.close();
})().catch((e) => {
  console.error('✗', e.message);
  process.exit(1);
});
