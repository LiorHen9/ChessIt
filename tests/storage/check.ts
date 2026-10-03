// Backup checks that need no browser: `bun tests/storage/check.ts`
// - a good backup passes and comes back clean (unknown fields dropped, missing fields filled);
// - anything else is refused with the right reason, before anything is written;
// - the restore plan: "add" writes new profiles and the chosen conflicts, "replace" clears first,
//   and meta entries of profiles that are gone (open game, room, last profile) are removed.
import { backupFileName, BACKUP_VERSION, checkBackup, parseBackup, restoreOps, type Backup } from '../../src/storage/backup';
import { emptyProgress, type Profile } from '../../src/profiles/profiles';

let failures = 0;
let passed = 0;
const ok = (cond: unknown, msg: string) => {
  if (cond) passed++;
  else {
    failures++;
    console.log('✗', msg);
  }
};

const dad: Profile = { id: 'p_dad', name: 'אבא', avatar: '🦁', ageGroup: 'teenAdult', themeId: 'forest', pinHash: 'a'.repeat(64), pinSalt: 'b'.repeat(32), createdAt: 1 };
const noa: Profile = { id: 'p_noa', name: 'נועה', avatar: '🦄', ageGroup: 'kids5_7', gender: 'girl', themeId: 'forest', createdAt: 2 };
const good: Backup = {
  format: 'chessit-backup',
  version: 1,
  exportedAt: '2026-10-03T07:00:00.000Z',
  schemaVersion: 1,
  app: '0.9.0',
  profiles: [dad, noa],
  progress: [{ ...emptyProgress(dad.id), stations: { 'rook-moves': { stars: 3, completedAt: 5 } } }, emptyProgress(noa.id)],
  settings: [{ profileId: dad.id, sound: false, narration: false, speechHelpSeen: true }]
};
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

// ---------- Good files ----------
{
  const r = parseBackup(JSON.stringify(good));
  ok(r.ok, 'a good backup passes');
  if (r.ok) {
    ok(r.backup.profiles.length === 2 && r.backup.profiles[0].pinHash === dad.pinHash, 'profiles and PIN hash kept');
    ok(r.backup.progress[0].stations['rook-moves'].stars === 3, 'stations kept');
    ok(r.backup.settings[0].sound === false, 'settings kept');
  }
  const bom = parseBackup('﻿' + JSON.stringify(good));
  ok(bom.ok, 'a byte-order mark at the start is fine');
  // An older-looking file: fields added later are missing, unknown fields are present.
  const old = clone(good) as unknown as Record<string, any>;
  delete old.settings;
  delete old.progress[0].vsComputer;
  delete old.progress[0].placement;
  delete old.progress[0].stats.puzzlesSolved;
  old.profiles[1].extra = 'ignored';
  delete old.profiles[1].themeId;
  const r2 = checkBackup(old);
  ok(r2.ok, 'missing newer fields are filled in');
  if (r2.ok) {
    ok(r2.backup.progress[0].vsComputer && r2.backup.progress[0].placement === null && r2.backup.progress[0].stats.puzzlesSolved === 0, 'defaults for missing progress fields');
    ok(!('extra' in r2.backup.profiles[1]) && r2.backup.profiles[1].themeId === 'clean', 'unknown fields dropped, missing theme = clean');
    ok(r2.backup.settings.length === 0, 'no settings = defaults later');
  }
}

// ---------- Refused ----------
const refused = (raw: unknown, code: string, what: string) => {
  const r = typeof raw === 'string' ? parseBackup(raw) : checkBackup(raw);
  ok(!r.ok && r.error.code === code, `${what}: expected ${code}, got ${r.ok ? 'ok' : r.error.code}`);
};
refused('not json at all', 'not-json', 'text');
refused(JSON.stringify(good).slice(0, 200), 'not-json', 'a cut file');
refused([1, 2], 'not-backup', 'an array');
refused({ ...good, format: 'other-app' }, 'not-backup', 'another format');
refused({ ...good, version: BACKUP_VERSION + 1 }, 'future', 'a newer version');
refused({ ...good, version: 0 }, 'invalid', 'version 0');
refused({ ...good, version: '1' }, 'invalid', 'version as text');
refused({ ...good, exportedAt: 'yesterday' }, 'invalid', 'a bad date');
refused({ ...good, profiles: 'x' }, 'invalid', 'profiles not a list');
refused({ ...good, profiles: [dad, dad] }, 'invalid', 'the same profile twice');
refused({ ...good, profiles: [{ ...dad, ageGroup: 'baby' }, noa] }, 'invalid', 'an unknown age group');
refused({ ...good, profiles: [{ ...dad, name: '' }, noa] }, 'invalid', 'an empty name');
refused({ ...good, profiles: [{ ...dad, name: 'x'.repeat(100) }, noa] }, 'invalid', 'a very long name');
refused({ ...good, profiles: [{ ...dad, id: 'guest' }, noa] }, 'invalid', 'the guest id');
refused({ ...good, profiles: [{ ...dad, id: '../../x' }, noa] }, 'invalid', 'a strange id');
refused({ ...good, profiles: [{ ...dad, pinSalt: undefined }, noa] }, 'invalid', 'a PIN hash without salt');
refused({ ...good, profiles: [{ ...dad, pinHash: '1234' }, noa] }, 'invalid', 'PIN digits instead of a hash');
refused({ ...good, profiles: [{ ...dad, gender: 'x' }, noa] }, 'invalid', 'an unknown gender');
refused({ ...good, progress: [...good.progress, emptyProgress('p_nobody')] }, 'invalid', 'progress of a profile that is not there');
refused({ ...good, progress: [good.progress[0], good.progress[0]] }, 'invalid', 'progress twice');
refused({ ...good, progress: [{ ...good.progress[0], stations: { a: { stars: 5 } } }] }, 'invalid', '5 stars');
refused({ ...good, progress: [{ ...good.progress[0], engineLevel: 99 }] }, 'invalid', 'level 99');
refused({ ...good, progress: [{ ...good.progress[0], daily: 'today' }] }, 'invalid', 'a bad daily date');
refused({ ...good, settings: [{ profileId: dad.id, sound: 'yes' }] }, 'invalid', 'a setting that is not on/off');
refused('x'.repeat(5 * 1024 * 1024 + 1), 'too-big', 'a huge file');

// ---------- Restore plans ----------
const phone = { profiles: [dad, { ...noa, name: 'נועה (בטלפון)' }], metaKeys: ['currentGame', 'lastProfileId', `room:${noa.id}`, 'room:p_old', 'backup', 'errorLog'] };
{
  const grandpa: Profile = { id: 'p_grandpa', name: 'סבא', avatar: '🦉', ageGroup: 'teenAdult', themeId: 'clean', createdAt: 3 };
  const b: Backup = { ...good, profiles: [dad, noa, grandpa], progress: [...good.progress] };
  // add, conflicts: keep dad, take noa
  const { ops, written } = restoreOps(b, { mode: 'add', conflicts: { [noa.id]: 'replace' } }, { ...phone, openGame: { whiteId: dad.id, blackId: 'guest' }, lastProfileId: dad.id });
  ok(written.join() === [noa.id, grandpa.id].join(), 'add: writes the taken conflict and the new profile');
  ok(!ops.some((o) => o.op === 'clear'), 'add: never clears');
  ok(ops.some((o) => o.store === 'progress' && o.op === 'put' && o.key === grandpa.id), 'add: a profile without progress gets fresh progress');
  ok(ops.some((o) => o.store === 'settings' && o.op === 'delete' && o.key === noa.id), 'add: a taken profile without settings in the backup loses the old settings');
  ok(ops.some((o) => o.store === 'meta' && o.op === 'delete' && o.key === 'room:p_old'), 'add: a room of a profile that is not on the phone is removed');
  ok(!ops.some((o) => o.store === 'meta' && (o.key === 'currentGame' || o.key === 'lastProfileId' || o.key === `room:${noa.id}`)), 'add: open game, last profile and rooms of existing profiles stay');
  ok(!ops.some((o) => o.store === 'meta' && (o.key === 'backup' || o.key === 'errorLog')), 'add: backup state and error log untouched');
}
{
  const b: Backup = { ...good, profiles: [noa], progress: [], settings: [] };
  const { ops, written } = restoreOps(b, { mode: 'replace' }, { ...phone, openGame: { whiteId: dad.id, blackId: 'guest' }, lastProfileId: dad.id });
  ok(written.join() === noa.id, 'replace: writes the backup profiles');
  ok(['profiles', 'progress', 'settings'].every((s) => ops.some((o) => o.store === s && o.op === 'clear')), 'replace: clears the three stores first');
  ok(ops.findIndex((o) => o.op === 'clear') < ops.findIndex((o) => o.op === 'put'), 'replace: clears before writing');
  ok(ops.some((o) => o.store === 'meta' && o.key === 'currentGame' && o.op === 'delete'), 'replace: open game of a removed profile is closed');
  ok(ops.some((o) => o.store === 'meta' && o.key === 'lastProfileId' && o.op === 'delete'), 'replace: last profile that is gone is forgotten');
  ok(!ops.some((o) => o.store === 'meta' && o.key === `room:${noa.id}`), 'replace: room of a profile that stays is kept');
}
{
  // A game of a kept profile against the computer stays.
  const { ops } = restoreOps(good, { mode: 'replace' }, { ...phone, openGame: { whiteId: 'computer', blackId: dad.id } });
  ok(!ops.some((o) => o.key === 'currentGame'), 'replace: a game of a profile that stays is kept');
}

ok(backupFileName(new Date(2026, 0, 5)) === 'chessit-backup-2026-01-05.json', 'file name with the local date');

console.log(failures ? `${failures} failed, ${passed} passed` : `backup checks OK (${passed})`);
process.exit(failures ? 1 : 0);
