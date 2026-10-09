// About ChessIt: what it is, the version, privacy in plain words, credits and licences, "found a
// problem?" (details to copy, no sending anywhere) and "delete all data on this phone".
// Loaded lazily (app/lazy.tsx), from the settings and from the profile picker.
import { useEffect, useRef, useState } from 'preact/hooks';
import { APP_VERSION, BUILD_TIME, COMMIT, versionLabel } from '../app/version';
import { clearErrorLog, readErrorLog, type ErrorEntry } from '../app/errorLog';
import { listProfiles } from '../profiles/profiles';
import { hasHebrewVoice } from '../audio/speech';
import { deleteEverything } from '../storage/backup';
import { ParentCheck } from '../components/ParentCheck';
import './family.css';

export const REPO_URL = 'https://github.com/LiorHen9/ChessIt';
export const ISSUES_URL = `${REPO_URL}/issues/new`;

interface Props {
  backLabel: string;
  onBack: () => void;
  /** Open at the "found a problem?" part. */
  focus?: 'report';
  /** Everything was deleted: the app starts over. */
  onDeleted: () => void;
}

const CREDITS: { name: string; what: string; licence: string; url: string }[] = [
  { name: 'ChessIt', what: 'האפליקציה עצמה, קוד פתוח', licence: 'GPL-3.0', url: REPO_URL },
  { name: 'Stockfish', what: 'המנוע של רמות 3–8 והסיכום', licence: 'GPL-3.0', url: 'https://stockfishchess.org' },
  { name: 'chess.js', what: 'חוקי השחמט', licence: 'BSD-2-Clause', url: 'https://github.com/jhlywa/chess.js' },
  { name: 'Preact', what: 'בניית המסכים', licence: 'MIT', url: 'https://preactjs.com' },
  { name: 'cburnett', what: 'ציורי הכלים, של Colin M.L. Burnett', licence: 'GPLv2+', url: 'https://github.com/lichess-org/lila/tree/master/public/piece/cburnett' },
  { name: 'Lichess', what: 'מאגר החידות', licence: 'CC0', url: 'https://database.lichess.org/#puzzles' },
  { name: 'QR', what: 'מימוש משלנו, לפי הספרייה של Nayuki', licence: 'MIT', url: 'https://www.nayuki.io/page/qr-code-generator-library' },
  { name: 'Rubik', what: 'הגופן', licence: 'SIL OFL 1.1', url: 'https://github.com/googlefonts/rubik' }
];

function standalone(): boolean {
  try {
    return matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
  } catch {
    return false;
  }
}

/** The details for a problem report: the app and the phone, and recent errors. No names. */
export async function reportText(errors: ErrorEntry[], profiles: number): Promise<string> {
  // Labels in English: the text is pasted into messages and GitHub issues, and Hebrew mixed into
  // left-to-right lines comes out scrambled.
  let persisted = '?';
  try {
    persisted = (await navigator.storage?.persisted?.()) ? 'yes' : 'no';
  } catch {
    // unknown
  }
  const yn = (b: boolean) => (b ? 'yes' : 'no');
  const lines = [
    `ChessIt ${APP_VERSION}${COMMIT ? ` (${COMMIT})` : ''}${BUILD_TIME ? `, built ${BUILD_TIME.slice(0, 16).replace('T', ' ')}` : ''}`,
    `Now: ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`,
    `Device: ${navigator.userAgent}`,
    `Screen: ${screen.width}x${screen.height}, window ${innerWidth}x${innerHeight}, DPR ${devicePixelRatio}`,
    `Installed: ${yn(standalone())} · Online: ${yn(navigator.onLine)} · Persistent storage: ${persisted}`,
    `Language: ${navigator.language} · Dark mode: ${yn(matchMedia('(prefers-color-scheme: dark)').matches)} · Hebrew voice: ${yn(hasHebrewVoice())}`,
    `Profiles: ${profiles} · Theme: ${document.documentElement.dataset.theme ?? 'clean'}`,
    errors.length ? `Recent errors (${errors.length}):` : 'Recent errors: none'
  ];
  for (const e of errors.slice(-10).reverse()) {
    lines.push(`- ${new Date(e.at).toISOString().slice(5, 16).replace('T', ' ')} ${e.message}${e.where ? ` @ ${e.where}` : ''}${e.count > 1 ? ` x${e.count}` : ''}`);
  }
  return lines.join('\n');
}

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older phones, or no permission: select a hidden text area and copy.
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;inset-inline-start:-9999px;top:0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

export function AboutScreen({ backLabel, onBack, focus, onDeleted }: Props) {
  const [report, setReport] = useState('');
  const [errors, setErrors] = useState<ErrorEntry[]>([]);
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null);
  const [del, setDel] = useState<'idle' | 'confirm' | 'parent' | 'deleting'>('idle');
  const reportRef = useRef<HTMLElement>(null);
  const delRef = useRef<HTMLElement>(null);

  async function refreshReport() {
    const errs = await readErrorLog();
    setErrors(errs);
    setReport(await reportText(errs, (await listProfiles()).length));
  }
  useEffect(() => {
    void refreshReport();
  }, []);
  useEffect(() => {
    if (focus === 'report') reportRef.current?.scrollIntoView({ block: 'start' });
  }, [report !== '']);
  useEffect(() => {
    if (del !== 'idle') delRef.current?.scrollIntoView({ block: 'center' });
  }, [del]);

  const canShare = typeof navigator.share === 'function';

  return (
    <main class="screen family about">
      <header class="topbar">
        <button class="btn btn-ghost btn-back" onClick={onBack}>
          → {backLabel}
        </button>
        <h1 class="topbar-title">אודות ופרטיות</h1>
        <span />
      </header>

      <section class="about-hero">
        <p class="logo">ChessIt</p>
        <p class="lead">לומדים שחמט ביחד, בעברית.</p>
        <p class="settings-note">
          מסלול לימוד מהצעד הראשון (מגיל <bdi dir="ltr">5</bdi>) ועד משחק שלם, חידות, משחק נגד המחשב, ומשחק בין שני טלפונים. לילדים ולמבוגרים, כל אחד בקצב שלו.
        </p>
        <p class="about-version" data-testid="about-version">
          גרסה <bdi dir="ltr">{versionLabel()}</bdi>
          {COMMIT && (
            <>
              {' '}
              · <bdi dir="ltr">{COMMIT}</bdi>
            </>
          )}
        </p>
        <a class="btn btn-secondary about-link" href={REPO_URL} target="_blank" rel="noopener">
          הקוד של ChessIt ב-GitHub
        </a>
      </section>

      <section class="settings-section" aria-labelledby="privacy-title">
        <h2 class="section-title" id="privacy-title">
          🔒 פרטיות, בקצרה
        </h2>
        <ul class="about-list">
          <li>
            <strong>הכול נשמר רק בטלפון הזה:</strong> פרופילים, כוכבים, משחקים והגדרות. אין הרשמה, אין חשבון ואין שרת שאוסף נתונים.
          </li>
          <li>
            <strong>בחדר לשני טלפונים</strong> עוברים רק השם, הדמות, המין (כדי לפנות נכון בעברית), המסעים וסמלי הרגש. בלי צ׳אט ובלי מיקום. החדר נמחק כששני השחקנים יוצאים, וחדר שננטש נמחק בניקוי אוטומטי.
          </li>
          <li>
            <strong>בלי פרסומות, בלי מעקב ובלי אנליטיקס.</strong> האפליקציה לא שולחת לאף אחד מה עושים בה.
          </li>
          <li>
            <strong>הגופן והקוד</strong> נטענים מהאתר של ChessIt עצמו (Firebase Hosting), ולא משירותים אחרים. אחרי הפעם הראשונה הכול עובד גם בלי אינטרנט, חוץ מהחדר.
          </li>
          <li>
            <strong>יומן שגיאות קטן</strong> נשמר בטלפון כדי לעזור בדיווח על בעיה. הוא לא נשלח לשום מקום, אלא אם מעתיקים אותו בעצמכם.
          </li>
        </ul>
      </section>

      <section class="settings-section" aria-labelledby="credits-title">
        <h2 class="section-title" id="credits-title">
          🙏 תודות ורישיונות
        </h2>
        <p class="settings-note">
          ChessIt הוא קוד פתוח ברישיון <bdi dir="ltr">GPL-3.0</bdi>, ונבנה על העבודה של:
        </p>
        <ul class="credits">
          {CREDITS.map((c) => (
            <li key={c.name}>
              <a href={c.url} target="_blank" rel="noopener" class="credit">
                <span class="credit-name">
                  <bdi dir="ltr">{c.name}</bdi>
                </span>
                <span class="credit-what">{c.what}</span>
                <span class="credit-licence">
                  <bdi dir="ltr">{c.licence}</bdi>
                </span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section class="settings-section" aria-labelledby="report-title" ref={reportRef} data-testid="report">
        <h2 class="section-title" id="report-title">
          🐞 מצאת בעיה?
        </h2>
        <p class="settings-note">
          נשמח לשמוע! כדאי לכתוב <strong>מה עשית</strong>, <strong>מה קרה</strong> ו<strong>מה ציפית שיקרה</strong>, ואם אפשר גם לצרף צילום מסך. לדיווח מוסיפים את פרטי הגרסה והמכשיר שלמטה (בלי שמות ובלי נתונים אישיים):
        </p>
        <pre class="report-box" dir="ltr" data-testid="report-text" tabIndex={0} aria-label="פרטי הגרסה והמכשיר">
          {report}
        </pre>
        <div class="row">
          <button
            class="btn btn-primary"
            data-report="copy"
            onClick={async () => {
              setCopied((await copy(report)) ? 'ok' : 'fail');
            }}
          >
            📋 העתקת הפרטים
          </button>
          {canShare && (
            <button
              class="btn btn-secondary"
              data-report="share"
              onClick={() => void navigator.share({ title: 'בעיה ב-ChessIt', text: report }).catch(() => undefined)}
            >
              📤 שליחה
            </button>
          )}
        </div>
        <p class={`feedback ${copied === 'ok' ? 'is-good' : copied === 'fail' ? 'is-bad' : ''}`} role="status" data-testid="report-copied">
          {copied === 'ok' ? '✓ הועתק. עכשיו מדביקים בהודעה.' : copied === 'fail' ? 'לא הצלחנו להעתיק. אפשר לסמן את הטקסט ולהעתיק ידנית.' : ''}
        </p>
        <p class="settings-note">
          לאן לשלוח: הודעה למי ששלח לך את הקישור לאפליקציה, או{' '}
          <a href={ISSUES_URL} target="_blank" rel="noopener">
            דיווח ב-GitHub
          </a>{' '}
          (צריך חשבון).
        </p>
        {errors.length > 0 && (
          <button
            class="btn btn-ghost"
            data-report="clear"
            onClick={async () => {
              await clearErrorLog();
              await refreshReport();
            }}
          >
            ניקוי יומן השגיאות
          </button>
        )}
      </section>

      <section class="settings-section about-danger" aria-labelledby="delete-title" ref={delRef}>
        <h2 class="section-title" id="delete-title">
          🗑️ מחיקת כל הנתונים בטלפון
        </h2>
        <p class="settings-note">מוחק את כל הפרופילים, ההתקדמות וההגדרות מהטלפון הזה. אי אפשר לבטל את זה, אז כדאי לגבות קודם.</p>
        {del === 'idle' && (
          <button class="btn btn-secondary btn-danger-text" data-delete="start" onClick={() => setDel('confirm')}>
            מחיקת כל הנתונים…
          </button>
        )}
        {del === 'confirm' && (
          <div class="card fam-warn" role="alertdialog" aria-labelledby="delete-sure">
            <p class="fam-title" id="delete-sure">
              בטוח? כל הפרופילים והכוכבים של כל המשפחה יימחקו.
            </p>
            <div class="row">
              <button class="btn btn-danger" data-delete="sure" onClick={() => setDel('parent')}>
                כן, למחוק הכול
              </button>
              <button class="btn btn-secondary" onClick={() => setDel('idle')}>
                ביטול
              </button>
            </div>
          </div>
        )}
        {del === 'parent' && (
          <ParentCheck
            danger
            confirmLabel="למחוק הכול"
            onCancel={() => setDel('idle')}
            onPass={async () => {
              setDel('deleting');
              await deleteEverything();
              onDeleted();
            }}
          >
            פתרון נכון מוחק את כל הנתונים בטלפון.
          </ParentCheck>
        )}
        {del === 'deleting' && <p class="feedback" role="status">מוחקים…</p>}
      </section>
    </main>
  );
}
