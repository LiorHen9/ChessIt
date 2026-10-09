// iPhone/iPad in a browser tab: what is saved here does not reach the home-screen app.
// See app/install.ts for why. BrowserNotice is the first screen there (until "continue in the
// browser"); BrowserBanner is the reminder line on the picker, the new-profile form and backup.
import { inIosBrowser } from '../app/install';

function HowToInstall() {
  return (
    <ol class="install-steps">
      <li>
        לוחצים על כפתור השיתוף <span aria-hidden="true">(ריבוע עם חץ למעלה)</span> בתחתית Safari.
      </li>
      <li>
        בוחרים <b>"הוספה למסך הבית"</b> ← <b>"הוסף"</b>.
      </li>
      <li>סוגרים את Safari ופותחים את ChessIt מהאייקון החדש.</li>
    </ol>
  );
}

interface NoticeProps {
  onContinue: () => void;
}

export function BrowserNotice({ onContinue }: NoticeProps) {
  return (
    <main class="screen browser-notice" data-testid="browser-notice">
      <header class="hero">
        <h1 class="logo">ChessIt</h1>
        <p class="lead">כדאי לפתוח את ChessIt מהאייקון במסך הבית</p>
      </header>
      <section class="card">
        <p class="install-why">
          באייפון, מה ששומרים בדפדפן <b>לא מופיע</b> באפליקציה שבמסך הבית – הם נפרדים לגמרי. כדי שהפרופילים וההתקדמות יישמרו במקום אחד, עובדים רק מהאייקון.
        </p>
        <p class="install-title">עוד אין אייקון? כך מוסיפים:</p>
        <HowToInstall />
      </section>
      <p class="fineprint">כבר יש אייקון? פשוט סוגרים את הדפדפן ופותחים משם.</p>
      <button class="btn btn-ghost" data-testid="browser-continue" onClick={onContinue}>
        להמשיך בדפדפן בכל זאת
      </button>
    </main>
  );
}

/** A reminder line, only in an iOS browser tab. `what` finishes the sentence ("הפרופיל", "השחזור"). */
export function BrowserBanner({ what }: { what: string }) {
  if (!inIosBrowser()) return null;
  return (
    <p class="browser-banner" role="note" data-testid="browser-banner">
      ⚠️ אתם בדפדפן: {what} יישמר רק כאן, ולא באפליקציה שבמסך הבית.
    </p>
  );
}
