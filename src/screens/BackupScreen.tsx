// Backup of the whole family to a file, and restore from one. Loaded lazily (app/lazy.tsx).
// Saving: share sheet with the file when the phone can (iPhone: "Save to Files", WhatsApp to
// yourself…), and a plain download everywhere. Restoring: pick a file → it is checked and
// previewed, and nothing changes until the parent confirms "add" or "replace all".
// Text too: the same backup can be copied as text and pasted back – handy on iPhone, where the
// browser and the home-screen app keep separate data and moving a file between them is a chore.
import { useEffect, useRef, useState } from 'preact/hooks';
import { listProfiles, getProgress, type Profile, type Progress } from '../profiles/profiles';
import {
  backupFileName,
  backupJson,
  conflictsWith,
  errorText,
  makeBackup,
  MAX_BACKUP_BYTES,
  parseBackup,
  profileSummary,
  restoreBackup,
  type Backup,
  type Conflict
} from '../storage/backup';
import { loadBackupState, markBackedUp } from '../storage/backupState';
import { ParentCheck } from '../components/ParentCheck';
import { BrowserBanner } from '../components/BrowserNotice';
import './family.css';

interface Props {
  /** Where "back" goes: the settings of a profile, or the profile picker / first screen. */
  backLabel: string;
  onBack: () => void;
  /** A restore finished: the app reloads its profiles. */
  onRestored: () => void;
}

type Note = { tone: 'good' | 'bad' | 'info'; text: string } | null;
type View =
  | { name: 'main' }
  | { name: 'preview'; backup: Backup; file: string }
  | { name: 'conflicts'; backup: Backup }
  | { name: 'replace'; backup: Backup }
  | { name: 'done'; count: number; mode: 'add' | 'replace' };

const dateText = (iso: string | number) => {
  const d = new Date(iso);
  return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
};

function Summary({ progress }: { progress: Progress | undefined }) {
  const s = profileSummary(progress);
  if (!s.stations && !s.games) return <span class="fam-sub">עוד לא התחיל</span>;
  return (
    <span class="fam-sub">
      ★ <bdi dir="ltr">{s.stars}</bdi> · <bdi dir="ltr">{s.stations}</bdi> תחנות
      {s.games > 0 && (
        <>
          {' '}
          · <bdi dir="ltr">{s.games}</bdi> משחקים
        </>
      )}
    </span>
  );
}

function ProfileLine({ p, progress, badge }: { p: Profile; progress?: Progress; badge?: string }) {
  return (
    <li class="fam-line">
      <span class="avatar avatar-sm" aria-hidden="true">
        {p.avatar}
      </span>
      <span class="fam-text">
        <span class="fam-name">
          {p.name}
          {p.pinHash && <span aria-label="עם PIN"> 🔒</span>}
        </span>
        <Summary progress={progress} />
      </span>
      {badge && <span class="fam-badge">{badge}</span>}
    </li>
  );
}

export function BackupScreen({ backLabel, onBack, onRestored }: Props) {
  const [view, setView] = useState<View>({ name: 'main' });
  const [phone, setPhone] = useState<{ profiles: Profile[]; progress: Map<string, Progress> } | null>(null);
  const [lastBackup, setLastBackup] = useState<number | undefined>(undefined);
  const [note, setNote] = useState<Note>(null);
  const [busy, setBusy] = useState(false);
  const [choices, setChoices] = useState<Record<string, Conflict>>({});
  /** The backup as text, shown when the phone did not let us copy it (select and copy by hand). */
  const [copyBox, setCopyBox] = useState<string | null>(null);
  /** The paste box is open. */
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState('');
  const canReadClipboard = typeof navigator.clipboard?.readText === 'function';
  const fileInput = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  async function loadPhone() {
    const profiles = await listProfiles();
    const progress = new Map(await Promise.all(profiles.map(async (p) => [p.id, await getProgress(p.id)] as const)));
    setPhone({ profiles, progress });
    setLastBackup((await loadBackupState()).lastBackupAt);
  }
  useEffect(() => void loadPhone(), []);
  // Moving between steps: bring the new step's title into view and focus (screen readers).
  useEffect(() => {
    window.scrollTo(0, 0);
    heading.current?.focus();
  }, [view.name]);

  const canShareFiles = (() => {
    try {
      const probe = new File(['{}'], 'x.json', { type: 'application/json' });
      return typeof navigator.canShare === 'function' && navigator.canShare({ files: [probe] });
    } catch {
      return false;
    }
  })();

  async function save(how: 'share' | 'download') {
    setBusy(true);
    setNote(null);
    try {
      const now = new Date();
      const json = backupJson(await makeBackup(now));
      const name = backupFileName(now);
      if (how === 'share') {
        const file = new File([json], name, { type: 'application/json' });
        try {
          await navigator.share({ files: [file], title: 'גיבוי ChessIt' });
        } catch (e) {
          // Closing the share sheet is not an error.
          if ((e as Error)?.name === 'AbortError') return;
          throw e;
        }
      } else {
        const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30_000);
      }
      await markBackedUp(now.getTime());
      setLastBackup(now.getTime());
      setNote({ tone: 'good', text: `✓ הגיבוי מוכן: ${name}` });
    } catch (e) {
      console.error('[backup] save failed', e);
      setNote({ tone: 'bad', text: 'לא הצלחנו לשמור את הגיבוי. אפשר לנסות שוב, או לנסות את הכפתור השני.' });
    } finally {
      setBusy(false);
    }
  }

  async function copyText() {
    setBusy(true);
    setNote(null);
    setCopyBox(null);
    const now = new Date();
    let text = '';
    try {
      // One line (no spaces): shorter to paste into notes or a message to yourself.
      text = JSON.stringify(await makeBackup(now));
      await navigator.clipboard.writeText(text);
      await markBackedUp(now.getTime());
      setLastBackup(now.getTime());
      setNote({ tone: 'good', text: '✓ הגיבוי הועתק. עכשיו מדביקים אותו במקום שבו משחזרים (או בפתקים, כדי לשמור).' });
    } catch (e) {
      console.warn('[backup] copy failed', e);
      if (text) {
        setCopyBox(text);
        setNote({ tone: 'info', text: 'הטלפון לא נתן להעתיק אוטומטית. מסמנים את כל הטקסט בתיבה ומעתיקים.' });
      } else {
        setNote({ tone: 'bad', text: 'לא הצלחנו להכין את הגיבוי. אפשר לנסות שוב.' });
      }
    } finally {
      setBusy(false);
    }
  }

  /** Check a backup (from a file or pasted text) and show what is in it. */
  function check(text: string, source: string) {
    setNote(null);
    const result = parseBackup(text.trim());
    if (!result.ok) {
      console.warn('[backup] refused', result.error);
      const msg = source === 'text' && (result.error.code === 'not-json' || result.error.code === 'not-backup') ? 'זה לא טקסט של גיבוי ChessIt. צריך להדביק את כל הטקסט שהועתק, מההתחלה ועד הסוף.' : errorText(result.error);
      setNote({ tone: 'bad', text: msg });
      return;
    }
    if (result.backup.profiles.length === 0) {
      setNote({ tone: 'bad', text: 'בגיבוי הזה אין אף פרופיל, אז אין מה לשחזר.' });
      return;
    }
    setPasting(false);
    setPasted('');
    setView({ name: 'preview', backup: result.backup, file: source });
  }

  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      setPasted(text);
      if (text.trim()) check(text, 'text');
    } catch (e) {
      console.warn('[backup] clipboard read failed', e);
      setNote({ tone: 'info', text: 'לא הצלחנו לקרוא מההעתקה. לוחצים לחיצה ארוכה בתיבה ← "הדבק".' });
    }
  }

  async function pick(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // picking the same file again should work too
    if (!file) return;
    setNote(null);
    if (file.size > MAX_BACKUP_BYTES) {
      setNote({ tone: 'bad', text: errorText({ code: 'too-big' }) });
      return;
    }
    check(await file.text(), file.name);
  }

  async function restore(backup: Backup, mode: 'add' | 'replace') {
    setBusy(true);
    try {
      const written = await restoreBackup(backup, { mode, conflicts: choices });
      setView({ name: 'done', count: written.length, mode });
    } catch (e) {
      console.error('[backup] restore failed', e);
      setNote({ tone: 'bad', text: 'השחזור נכשל, ושום דבר לא השתנה. אפשר לנסות שוב.' });
      setView({ name: 'main' });
    } finally {
      setBusy(false);
    }
  }

  const back = (
    <header class="topbar">
      <button class="btn btn-ghost btn-back" onClick={view.name === 'main' || view.name === 'done' ? onBack : () => setView({ name: 'main' })}>
        → {view.name === 'main' || view.name === 'done' ? backLabel : 'חזרה'}
      </button>
      <h1 class="topbar-title" tabIndex={-1} ref={heading}>
        גיבוי ושחזור
      </h1>
      <span />
    </header>
  );

  if (!phone) return <main class="screen loading" aria-busy="true" />;
  const noteLine = note && (
    <p class={`feedback is-${note.tone}`} role={note.tone === 'bad' ? 'alert' : 'status'} data-testid="backup-note">
      {note.text}
    </p>
  );

  switch (view.name) {
    case 'main':
      return (
        <main class="screen family" data-view="main">
          {back}
          <section class="settings-section">
            <h2 class="section-title">💾 גיבוי כל המשפחה</h2>
            <p class="settings-note">
              כל הפרופילים, הכוכבים, החידות וההגדרות נשמרים בקובץ אחד. אפשר לשמור אותו בדרייב, לשלוח לעצמך, או להעביר לטלפון חדש.
            </p>
            {phone.profiles.length > 0 ? (
              <>
                <ul class="fam-list">
                  {phone.profiles.map((p) => (
                    <ProfileLine key={p.id} p={p} progress={phone.progress.get(p.id)} />
                  ))}
                </ul>
                <p class="settings-note" data-testid="last-backup">
                  {lastBackup ? <>גיבוי אחרון מהטלפון הזה: {dateText(lastBackup)}</> : 'עוד לא נעשה גיבוי מהטלפון הזה.'}
                </p>
                <div class="row">
                  {canShareFiles && (
                    <button class="btn btn-primary" data-backup="share" disabled={busy} onClick={() => void save('share')}>
                      📤 שליחה או שמירה
                    </button>
                  )}
                  <button class={`btn ${canShareFiles ? 'btn-secondary' : 'btn-primary'}`} data-backup="download" disabled={busy} onClick={() => void save('download')}>
                    ⬇️ הורדת קובץ
                  </button>
                  <button class="btn btn-secondary" data-backup="copy" disabled={busy} onClick={() => void copyText()}>
                    📋 העתקה כטקסט
                  </button>
                </div>
                {copyBox !== null && (
                  <textarea
                    class="input backup-text"
                    readOnly
                    aria-label="הגיבוי כטקסט"
                    data-testid="backup-copy-box"
                    value={copyBox}
                    onFocus={(e) => (e.target as HTMLTextAreaElement).select()}
                  />
                )}
                <p class="fineprint fam-fine">ה-PIN נשמר בקובץ כמו בטלפון: בלי הספרות עצמן.</p>
              </>
            ) : (
              <p class="settings-note">אין עדיין פרופילים בטלפון הזה, אז אין מה לגבות.</p>
            )}
          </section>

          <section class="settings-section">
            <h2 class="section-title">📥 שחזור מגיבוי</h2>
            <BrowserBanner what="השחזור" />
            <p class="settings-note">בוחרים קובץ גיבוי, או מדביקים גיבוי שהועתק כטקסט. קודם נראה מה יש בו, ושום דבר לא משתנה עד שמאשרים.</p>
            <input ref={fileInput} type="file" class="visually-hidden" tabIndex={-1} aria-hidden="true" data-testid="backup-file" onChange={(e) => void pick(e)} />
            <button class="btn btn-secondary" data-backup="pick" onClick={() => fileInput.current?.click()}>
              📂 בחירת קובץ גיבוי
            </button>
            {pasting ? (
              <div class="backup-paste">
                <textarea
                  class="input backup-text"
                  aria-label="הדבקת הגיבוי כטקסט"
                  placeholder="לחיצה ארוכה כאן ← הדבק"
                  data-testid="backup-paste-box"
                  value={pasted}
                  onInput={(e) => setPasted((e.target as HTMLTextAreaElement).value)}
                />
                <div class="row">
                  <button class="btn btn-primary" data-backup="paste-check" disabled={!pasted.trim()} onClick={() => check(pasted, 'text')}>
                    המשך
                  </button>
                  {canReadClipboard && (
                    <button class="btn btn-secondary" data-backup="paste-clipboard" onClick={() => void pasteFromClipboard()}>
                      📋 הדבקה מההעתקה
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <button class="btn btn-secondary" data-backup="paste" onClick={() => setPasting(true)}>
                📋 הדבקת גיבוי כטקסט
              </button>
            )}
          </section>
          {noteLine}
        </main>
      );

    case 'preview': {
      const { backup } = view;
      const clash = new Set(conflictsWith(backup, phone.profiles).map((p) => p.id));
      const empty = phone.profiles.length === 0;
      return (
        <main class="screen family" data-view="preview">
          {back}
          <section class="card fam-card">
            <p class="fam-title" data-testid="backup-found">
              {backup.profiles.length === 1 ? 'נמצא פרופיל אחד' : <>נמצאו <bdi dir="ltr">{backup.profiles.length}</bdi> פרופילים</>} בגיבוי מ-
              {dateText(backup.exportedAt)}:
            </p>
            <ul class="fam-list">
              {backup.profiles.map((p) => (
                <ProfileLine key={p.id} p={p} progress={backup.progress.find((x) => x.profileId === p.id)} badge={clash.has(p.id) ? 'כבר בטלפון' : undefined} />
              ))}
            </ul>
          </section>
          {empty ? (
            <button class="btn btn-primary btn-big" data-restore="add" disabled={busy} onClick={() => void restore(backup, 'add')}>
              שחזור
            </button>
          ) : (
            <div class="fam-choices">
              <button
                class="action"
                data-restore="add"
                disabled={busy}
                onClick={() => {
                  if (clash.size === 0) void restore(backup, 'add');
                  else {
                    setChoices(Object.fromEntries([...clash].map((id) => [id, 'keep' as Conflict])));
                    setView({ name: 'conflicts', backup });
                  }
                }}
              >
                <span class="action-icon" aria-hidden="true">
                  ➕
                </span>
                <span class="action-text">
                  <span class="action-title">להוסיף לטלפון</span>
                  <span class="action-sub">הפרופילים מהגיבוי מצטרפים לאלה שכבר כאן</span>
                </span>
              </button>
              <button class="action" data-restore="replace" disabled={busy} onClick={() => setView({ name: 'replace', backup })}>
                <span class="action-icon" aria-hidden="true">
                  ♻️
                </span>
                <span class="action-text">
                  <span class="action-title">להחליף הכול</span>
                  <span class="action-sub">מה שבטלפון נמחק, ובמקומו מה שבגיבוי</span>
                </span>
              </button>
            </div>
          )}
          <button class="btn btn-ghost" onClick={() => setView({ name: 'main' })}>
            ביטול
          </button>
        </main>
      );
    }

    case 'conflicts': {
      const { backup } = view;
      const clash = conflictsWith(backup, phone.profiles);
      return (
        <main class="screen family" data-view="conflicts">
          {back}
          <p class="settings-note">
            {clash.length === 1 ? 'פרופיל אחד' : <><bdi dir="ltr">{clash.length}</bdi> פרופילים</>} כבר בטלפון. מה לעשות עם {clash.length === 1 ? 'הפרופיל' : 'כל אחד'}?
          </p>
          {clash.map((p) => {
            const mine = phone.profiles.find((x) => x.id === p.id)!;
            const choice = choices[p.id] ?? 'keep';
            const set = (c: Conflict) => setChoices({ ...choices, [p.id]: c });
            return (
              <fieldset class="card fam-card" key={p.id} data-conflict={p.id}>
                <legend class="fam-title">
                  {p.avatar} {p.name}
                </legend>
                <div class="fam-options" role="radiogroup" aria-label={`מה לעשות עם ${p.name}`}>
                  <button type="button" role="radio" aria-checked={choice === 'keep'} class={`fam-option ${choice === 'keep' ? 'is-on' : ''}`} data-choice="keep" onClick={() => set('keep')}>
                    <span class="fam-name">להשאיר את מה שבטלפון</span>
                    <Summary progress={phone.progress.get(mine.id)} />
                  </button>
                  <button type="button" role="radio" aria-checked={choice === 'replace'} class={`fam-option ${choice === 'replace' ? 'is-on' : ''}`} data-choice="replace" onClick={() => set('replace')}>
                    <span class="fam-name">לקחת מהגיבוי</span>
                    <Summary progress={backup.progress.find((x) => x.profileId === p.id)} />
                  </button>
                </div>
              </fieldset>
            );
          })}
          <button class="btn btn-primary btn-big" data-restore="confirm-add" disabled={busy} onClick={() => void restore(backup, 'add')}>
            להוסיף
          </button>
        </main>
      );
    }

    case 'replace': {
      const { backup } = view;
      return (
        <main class="screen family" data-view="replace">
          {back}
          <section class="card fam-card fam-warn">
            <p class="fam-title">⚠️ כל מה שבטלפון יימחק</p>
            <ul class="fam-list">
              {phone.profiles.map((p) => (
                <ProfileLine key={p.id} p={p} progress={phone.progress.get(p.id)} />
              ))}
            </ul>
            <p class="settings-note">
              {backup.profiles.length === 1 ? (
                'ובמקומם יבוא הפרופיל מהגיבוי.'
              ) : (
                <>
                  ובמקומם יבואו <bdi dir="ltr">{backup.profiles.length}</bdi> הפרופילים מהגיבוי.
                </>
              )}{' '}
              גם משחק פתוח וחדר פתוח של פרופילים שנמחקים ייסגרו.
            </p>
          </section>
          <ParentCheck danger confirmLabel="להחליף הכול" onCancel={() => setView({ name: 'preview', backup, file: '' })} onPass={() => restore(backup, 'replace')}>
            פתרון נכון מחליף את כל הנתונים בטלפון בגיבוי.
          </ParentCheck>
        </main>
      );
    }

    case 'done':
      return (
        <main class="screen family" data-view="done">
          {back}
          <section class="card fam-card fam-done">
            <p class="fam-title" role="status" data-testid="restore-done">
              ✓ השחזור הסתיים
            </p>
            <p class="settings-note">
              {view.count === 0 ? (
                'שום פרופיל לא השתנה: השארנו את מה שבטלפון.'
              ) : view.count === 1 ? (
                'פרופיל אחד שוחזר מהגיבוי.'
              ) : (
                <>
                  <bdi dir="ltr">{view.count}</bdi> פרופילים שוחזרו מהגיבוי.
                </>
              )}
            </p>
            <button class="btn btn-primary btn-big" data-restore="continue" onClick={onRestored}>
              לבחירת פרופיל
            </button>
          </section>
        </main>
      );
  }
}
