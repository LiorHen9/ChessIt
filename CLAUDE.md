# CLAUDE.md – ChessIt

הוראות קבועות לכל סשן עבודה על הפרויקט. יש לקרוא את הקובץ לפני כל משימה.

## כללי עבודה עם המשתמש

1. **סיום אבן דרך = פרומפט לשלב הבא.** בסוף כל שלב במפת הדרכים (`docs/ROADMAP.md`), אחרי שהכול נדחף והפריסה הצליחה:
   - לכתוב פרומפט מפורט ומוכן להדבקה לשלב הבא. הפרומפט צריך לעמוד בפני עצמו: הקשר, היקף, דרישות, תנאי סיום, אופן בדיקה, ובסופו הוראה לסיים באותו אופן.
   - לשמור את הפרומפט גם בקובץ `docs/prompts/phase-N.md` ולהציג אותו למשתמש בגוש קוד.
   - להמליץ למשתמש לבצע `clear` לסשן לפני שמדביקים את הפרומפט, כדי להתחיל בהקשר נקי.
2. **שפה**: לדבר עם המשתמש בעברית. קוד, שמות משתנים והודעות commit באנגלית.
3. **המשתמש לא מכיר שחמט.** כל הסבר על חוקים, וכל תוכן לימודי, נכתבים למתחיל מוחלט. אסור להניח ידע מוקדם.
4. **לא לסמן משימה כגמורה בלי בדיקה בפועל**: בנייה, בדיקת טיפוסים ובדיקה בדפדפן בגודל טלפון.
5. בכל שלב מעדכנים את `docs/ROADMAP.md` (מסמנים מה בוצע), וכשמשהו בתכנון משתנה, מעדכנים גם את `docs/ARCHITECTURE.md`.

## הפרויקט בקצרה

אפליקציית רשת (PWA) לטלפון ללימוד שחמט, בעברית, לילדים ולמבוגרים. כמה פרופילים לכל מכשיר, כל פרופיל בקצב שלו, וכל הנתונים נשמרים מקומית.

- אתר: https://chessit-6d389.web.app/
- מאגר: https://github.com/LiorHen9/ChessIt (ענף `main`; כל דחיפה נבנית ומתפרסמת ב-Firebase Hosting, פרויקט `chessit-6d389`; `firebase.json`, `.firebaserc`)
- מסמכים: `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, `docs/FIREBASE.md` (הקמת החדרים, למשתמש), `docs/DEVICE-CHECKS.md` (בדיקות בטלפונים, למשתמש), `docs/prompts/`
- גרסה: `version` ב-`package.json` (היום `0.9.0`, בטא משפחתית; `1.0.0` בהשקה). מוזרקת בבנייה עם זמן הבנייה וה-commit (`src/app/version.ts`).

## טכנולוגיה ומבנה

- Vite + TypeScript (strict) + Preact. חוקי השחמט: chess.js 1.x.
- `src/app/App.tsx` – ניתוב בין מסכים (מכונת מצבים פשוטה, בלי ספריית ניתוב). מסכים שלא צריך בכניסה נטענים בעצלות דרך `lazy()` ב-`src/app/lazy.tsx` (משחק, סיכום, חידות, חזרה, מבחן כניסה, הגדרות, תחנות של עמדות אמיתיות, חדרים, גיבוי, אודות). מסך חדש שלא צריך מיד – גם הוא דרך `lazy()`, כדי לשמור על הטעינה הראשונה (היום כ-269KB, התקרה 300KB).
- `src/themes/` – ערכות נושא: `index.ts` (רשימה, `applyTheme`, `useTheme`, `suggestTheme`), `clean.ts` מוטמעת, `space.ts`/`forest.ts` נטענות בעצלות, `pieceSprite.ts` (ציורי הכלים). "איך מוסיפים ערכה" ב-ARCHITECTURE.md.
- `src/components/Piece.tsx` – הכלים ב-SVG: `PieceSprite` (פעם אחת ב-App), `PieceUse` בתוך הלוח, `PieceIcon` ב-HTML. צבעים ממשתני `--pc-*` של הערכה.
- `src/audio/sound.ts` – צלילים ב-Web Audio (`playSound`). הלוח משמיע מסע/אכילה/שח לבד; `quiet` ללוחות הדגמה. `src/audio/speech.ts` – הקראה בעברית, רק עם קול עברי (`speak`, `autoSpeak`, `cleanForSpeech`). `src/components/Speak.tsx` – `SpeakButton`, `Feedback` (שורת המשוב, מוקראת), `NarrationHelp`, `useAutoSpeak`.
- `src/profiles/settings.ts` – הגדרות לכל פרופיל (צלילים, הקראה), במאגר `settings`. `src/profiles/pin.ts` – PIN כ-hash. `src/screens/PinScreen.tsx`, `src/screens/SettingsScreen.tsx`.
- `src/screens/` – מסך לכל מסך. `src/components/` – Board, PlayerBar ועוד.
- `src/chess/rules.ts` – עזרים מעל chess.js (שמות כלים בעברית, תוצאות משחק, כלים שנאכלו).
- `src/profiles/profiles.ts` – פרופילים, התקדמות, סטטיסטיקה, `byGender`.
- `src/storage/db.ts` – עטיפה ל-IndexedDB. כל שינוי במאגרים מחייב העלאת `SCHEMA_VERSION` והגירה. `dbWrite` – כמה שינויים בכמה מאגרים בטרנזקציה אחת.
- `src/storage/backup.ts` – גיבוי ושחזור (נטען בעצלות): `parseBackup`/`checkBackup` (בדיקה מלאה), `MIGRATIONS` לגיבויים ישנים, `restoreOps` (טהור), `deleteEverything`. **שדה חדש בפרופיל, בהתקדמות או בהגדרות – להוסיף גם לבדיקה ב-`checkBackup`**, אחרת הוא נזרק בשחזור. שינוי מבנה – להעלות `BACKUP_VERSION` ולהוסיף צעד ב-`MIGRATIONS`. `src/storage/backupState.ts` – התזכורת (בטעינה הראשונה).
- `src/screens/BackupScreen.tsx`, `src/screens/AboutScreen.tsx` (אודות, פרטיות, תודות, "מצאת בעיה?", מחיקת הכול), `src/screens/family.css` – בטעינה עצלה. `src/components/ParentCheck.tsx` – שאלת הורה לכל פעולה של כל המשפחה (איפוס PIN, החלפת הכול, מחיקת הכול).
- `src/app/errorLog.ts` – יומן שגיאות מקומי (‏`meta.errorLog`, עד 20), בלי שליחה לשום מקום. `src/app/version.ts` – גרסה, זמן בנייה, commit.
- `public/fonts/rubik.woff2` – הגופן (עברית + לטינית, OFL), במאגר ולא מ-Google. `public/og-image.png` – תמונת השיתוף (`scripts/og-image.ts` + `scripts/og-image-shot.cjs`). `docs/screenshots/` – מ-`scripts/screenshots.cjs`.
- `src/game/savedGame.ts` – משחק פתוח (כולל `startFen` ו-`computer`) ופרופיל אחרון ב-`meta`. `src/game/analysis.ts` – סיכום משחק.
- `src/engine/` – ממשק `Engine`, ‏`levels.ts` (שמות הרמות וטבלת הכיול), KidEngine לרמות 1–2 (`kid.ts` + Worker), ‏`StockfishEngine` לרמות 3–8 ולסיכום. קובצי Stockfish 19 lite נמצאים ב-`public/engine/` (מתועדים ב-README.txt שם).
- `src/chess/handicap.ts` – מצב הורה-ילד (FEN בלי חלק מהכלים).
- `src/content/worlds/*.json` – תוכן המסלול (8 חלקים, 71 תחנות), רשומים ב-`worlds/all.ts` ונטענים בעצלות (`loadContent()`). `src/content/index.ts` טוען ובודק. בדיקה מהטרמינל (כולל בדיקות עמוקות, מבחן הכניסה והחידות): `bun tests/content/check.ts`.
- `src/content/puzzles/` – חידות Lichess, קובץ לכל נושא (import דינמי), נוצרים ב-`scripts/puzzles.ts`. `src/content/placement.ts` – מבחן הכניסה.
- `src/learning/` – תנועת כלים בתרגולים של חלקים 1–2 (`drill.ts`, בלי chess.js), בודק מטרות ופותר (`goals.ts`), מטרות על עמדות אמיתיות מחלק 3 (`real.ts`, chess.js), המאמן (`coach.ts`), כוכבים, פתיחת תחנות, חידות ומבחן כניסה (`progress.ts`), חזרה מרווחת (`review.ts`), טקסט לפי גיל ומין (`text.ts`).
- `src/components/RealTask.tsx` – לוח של משימה על עמדה אמיתית (תחנה, חידה, שאלת מבחן). עם `?seed=` הוא חושף `window.__chessitTask` (`fen`, `busy`, `hint`) לבדיקות.
- `src/net/` – חדרים (שני טלפונים): `transport.ts` (ממשק `Transport`, `RoomDoc`, ההודעות, `parseMessage`/`parseRoomDoc`, האלפבית של הקוד), `rules.ts` (כללי Firebase ב-TS – **כל שינוי בכללים נעשה גם ב-`firebase/database.rules.json`, ואז מבקשים מהמשתמש להדביק אותם מחדש ב-Firebase**), `firebase.ts` (REST + EventSource, בלי SDK), `local.ts` (`?transport=local`, בין לשוניות), `room.ts` (`RoomClient`), `openRoom.ts` (החדר הפתוח לכל פרופיל, בטעינה הראשונה), `qr.ts`, `config.ts` (`FIREBASE_DB_URL`). המסכים: `screens/RoomScreen.tsx`, `RoomGame.tsx`, `room.css` – chunk אחד בטעינה עצלה. ניקוי: `scripts/cleanup-rooms.mjs` + `.github/workflows/cleanup-rooms.yml` (סוד `FIREBASE_SERVICE_ACCOUNT`).
- טקסט תוכן מוצג דרך `RichText` (שומר על e4 ומספרים משמאל לימין, ומוסיף `︎` לסמלי כלים).

## מוסכמות

- **RTL**: הממשק `dir="rtl"`. הלוח תמיד `dir="ltr"`. מספרים וטווחים (כמו "5–7") עוטפים ב-`dir="ltr"`, אחרת הם מתהפכים.
- **פנייה לפי מין**: טקסט שתלוי בפרופיל עובר דרך `byGender(profile, 'זכר', 'נקבה')`. בלי מין מוגדר מוצגת צורה כפולה ("ניצח/ה").
- **SVG ב-Preact**: מאפיינים בכתיב kebab-case (`text-anchor`, `dominant-baseline`), לא camelCase.
- **גדלי מגע**: לפחות 44px. טקסטים קצרים; לגיל 5–7 משפט אחד.
- **כלים**: על המסך תמיד `PieceIcon`/`PieceUse` (SVG), לא תווי Unicode. `PIECE_GLYPH` נשאר רק לסמלים בתוך טקסט התוכן (`RichText` מוסיף להם `︎` כדי שלא יוצגו כאימוג'י באייפון).
- **צבעים**: רק משתני CSS (`var(--ink)`, `var(--sq-dark)` ...), כדי שכל ערכה תעבוד. ה-QR תמיד `--qr-ink` על `--qr-paper` (שחור על לבן בכל ערכה). משתנה חדש – להגדיר ב-`:root`, ב-`clean.ts` ובכל ערכה, ולהריץ `tests/themes/check.ts`.
- **טקסט שילד צריך לשמוע**: משוב דרך `Feedback`, ומשימה חדשה עם `SpeakButton` ו-`useAutoSpeak`.
- **נגישות**: כפתור אייקון – `aria-label`. אזור `aria-live` נשאר במקומו ורק התוכן שלו מתחלף (לא `key` על האזור עצמו). צבע עולם (`--w`) לא משמש ישירות כצבע טקסט או כרקע לטקסט לבן: `color-mix(in srgb, var(--w) 68%, var(--ink))` לטקסט, ‏`color-mix(in srgb, var(--w) 75%, #000)` לרקע. מסך חדש – להוסיף אותו לרשימה ב-`tests/e2e/phase7.cjs` (גודל מגע, ניגודיות ושמות, דרך `tests/e2e/a11y.cjs`).
- **commit**: הודעה באנגלית, ובסופה שורות הייחוס שהסביבה מגדירה.

## בנייה ובדיקה

- `npm run build` מריץ בדיקת טיפוסים ובנייה. GitHub Actions הוא מקור האמת: לבדוק אחרי כל דחיפה ש-`Deploy to Firebase Hosting` הצליח (`gh run list --repo LiorHen9/ChessIt`).
- **אם npm חסום בסביבת העבודה** (כך היה בסשנים הקודמים): לשכפל את preact (תגית 10.x האחרונה) ואת chess.js מ-GitHub לתיקיית scratchpad, למפות אותם ב-`paths` של tsconfig זמני, ולהריץ:
  - בדיקת טיפוסים: `tsc -p <tsconfig זמני>` (שגיאת ה-import של `styles.css` צפויה מקומית ואפשר להתעלם ממנה).
  - בנייה: `bun build src/main.tsx` עם אותם `paths`. ל-chess.js צריך קובץ דמה `src/pgn.ts`, כי מנתח ה-PGN נוצר בזמן בנייה.
    CSS שמיובא ממסך עצל (`room.css`) bun מכניס גם ל-`main.css` – למדידת הטעינה הראשונה מנכים אותו (Vite מפצל נכון).
    צריך `--external '/fonts/*'` (הגופן ב-CSS הוא קובץ מ-`public/`) ו-`--define` לקבועי הגרסה (`__APP_VERSION__='"0.9.0"'`, `__BUILD_TIME__`, `__COMMIT__`). גם `screens/family.css` (גיבוי ואודות) bun מכניס ל-`main.css` – מנכים אותו כמו את `room.css`.
    צריך `--splitting` (התוכן והחידות הם chunks נפרדים, ונתיב ה-Worker יכול להופיע בכל קובץ JS בפלט). bun לא בונה את ה-Worker מ-`new URL('./kid.worker.ts', import.meta.url)`, ולכן בונים גם את `src/engine/kid.worker.ts` כ-entry נפרד ומחליפים בפלט את `./kid.worker.ts` ב-`./kid.worker.js` (ב-Vite זה קורה לבד). מעתיקים את `public/` לתיקיית הפלט, כולל `engine/`.
  - בדיקה בדפדפן: Playwright (מותקן גלובלית, `NODE_PATH=$(npm root -g)`) מול `python3 -m http.server 4173 -d <תיקיית הפלט>`. ראו `tests/e2e/phase1.cjs` עד `phase7.cjs` (צריך להריץ את כולן בכל שלב). `phase7.cjs` בודק גם נגישות בכל המסכים העיקריים, בבהיר ובכהה. `phase6.cjs` צריך גם `bun` (מריץ את `tests/net/mock-firebase.ts` על פורט 9010) ו-`python3` עם `cv2` (מפענח את ה-QR). `phase5.cjs` מדמה קול עברי (`addInitScript` שמחליף את `speechSynthesis`) וקורא את `window.__chessitSounds` לבדיקת צלילים.
  - בדיקות בטרמינל: `bun --tsconfig-override=<tsconfig זמני> tests/content/check.ts`, `tests/themes/check.ts` (ניגודיות הערכות, ניקוי טקסט להקראה), `tests/net/check.ts` (קוד חדר, הודעות, כללים, QR) ו-`tests/storage/check.ts` (בדיקת קובצי גיבוי ותוכנית השחזור). ה-override נדרש כי בלי `node_modules` צריך את המיפוי של chess.js ו-preact. `phase3.cjs` משתמש ב-`?seed=` כדי שתשובות המחשב יהיו קבועות, וב-`window.__chessit` שקיים רק במצב הזה.
  - סימולציית רמות: `bun --tsconfig-override=<tsconfig זמני> tests/engine/sim.ts` (‏100 משחקים לזוג, כמה דקות). עם `ladder 20 --only-ladder` גם רמות 3–8 מול Stockfish ב-node.
  - שרת ישן מסשן קודם עלול לתפוס את פורט 4173: לבדוק ש-`curl localhost:4173` מחזיר את הבנייה הנוכחית.
  - חבילות מ-GitHub משמשות רק לבדיקה מקומית ולא נכנסות למאגר.
- גופני Google חסומים בסביבת הבדיקה, ולכן מקומית מוצג גופן חלופי.
- **Firebase חסום מסביבת העבודה**: חדרים נבדקים מול `?transport=local` (שני דפים באותו הקשר) ומול השרת המדומה (`?db=http://localhost:9010`, מותר רק ב-localhost). עם אחד מהם הלקוח נחשף ב-`window.__chessitRoom`. הבדיקה מול Firebase האמיתי – בבית.
