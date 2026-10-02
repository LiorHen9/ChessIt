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

- אתר: https://liorhen9.github.io/ChessIt/
- מאגר: https://github.com/LiorHen9/ChessIt (ענף `main`; כל דחיפה נבנית ומתפרסמת ב-GitHub Pages)
- מסמכים: `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, `docs/prompts/`

## טכנולוגיה ומבנה

- Vite + TypeScript (strict) + Preact. חוקי השחמט: chess.js 1.x.
- `src/app/App.tsx` – ניתוב בין מסכים (מכונת מצבים פשוטה, בלי ספריית ניתוב).
- `src/screens/` – מסך לכל מסך. `src/components/` – Board, PlayerBar ועוד.
- `src/chess/rules.ts` – עזרים מעל chess.js (שמות כלים בעברית, תוצאות משחק, כלים שנאכלו).
- `src/profiles/profiles.ts` – פרופילים, התקדמות, סטטיסטיקה, `byGender`.
- `src/storage/db.ts` – עטיפה ל-IndexedDB. כל שינוי במאגרים מחייב העלאת `SCHEMA_VERSION` והגירה.
- `src/game/savedGame.ts` – משחק פתוח (כולל `startFen` ו-`computer`) ופרופיל אחרון ב-`meta`. `src/game/analysis.ts` – סיכום משחק.
- `src/engine/` – ממשק `Engine`, ‏`levels.ts` (שמות הרמות וטבלת הכיול), KidEngine לרמות 1–2 (`kid.ts` + Worker), ‏`StockfishEngine` לרמות 3–8 ולסיכום. קובצי Stockfish 19 lite נמצאים ב-`public/engine/` (מתועדים ב-README.txt שם).
- `src/chess/handicap.ts` – מצב הורה-ילד (FEN בלי חלק מהכלים).
- `src/content/worlds/*.json` – תוכן המסלול (8 חלקים, 71 תחנות), רשומים ב-`worlds/all.ts` ונטענים בעצלות (`loadContent()`). `src/content/index.ts` טוען ובודק. בדיקה מהטרמינל (כולל בדיקות עמוקות, מבחן הכניסה והחידות): `bun tests/content/check.ts`.
- `src/content/puzzles/` – חידות Lichess, קובץ לכל נושא (import דינמי), נוצרים ב-`scripts/puzzles.ts`. `src/content/placement.ts` – מבחן הכניסה.
- `src/learning/` – תנועת כלים בתרגולים של חלקים 1–2 (`drill.ts`, בלי chess.js), בודק מטרות ופותר (`goals.ts`), מטרות על עמדות אמיתיות מחלק 3 (`real.ts`, chess.js), המאמן (`coach.ts`), כוכבים, פתיחת תחנות, חידות ומבחן כניסה (`progress.ts`), חזרה מרווחת (`review.ts`), טקסט לפי גיל ומין (`text.ts`).
- `src/components/RealTask.tsx` – לוח של משימה על עמדה אמיתית (תחנה, חידה, שאלת מבחן). עם `?seed=` הוא חושף `window.__chessitTask` (`fen`, `busy`, `hint`) לבדיקות.
- טקסט תוכן מוצג דרך `RichText` (שומר על e4 ומספרים משמאל לימין, ומוסיף `︎` לסמלי כלים).

## מוסכמות

- **RTL**: הממשק `dir="rtl"`. הלוח תמיד `dir="ltr"`. מספרים וטווחים (כמו "5–7") עוטפים ב-`dir="ltr"`, אחרת הם מתהפכים.
- **פנייה לפי מין**: טקסט שתלוי בפרופיל עובר דרך `byGender(profile, 'זכר', 'נקבה')`. בלי מין מוגדר מוצגת צורה כפולה ("ניצח/ה").
- **SVG ב-Preact**: מאפיינים בכתיב kebab-case (`text-anchor`, `dominant-baseline`), לא camelCase.
- **גדלי מגע**: לפחות 44px. טקסטים קצרים; לגיל 5–7 משפט אחד.
- **סמלי כלים**: תווי Unicode עם `︎` (כדי שלא יוצגו כאימוג'י באייפון). ציורי SVG אחידים יגיעו בשלב 5.
- **commit**: הודעה באנגלית, ובסופה שורות הייחוס שהסביבה מגדירה.

## בנייה ובדיקה

- `npm run build` מריץ בדיקת טיפוסים ובנייה. GitHub Actions הוא מקור האמת: לבדוק אחרי כל דחיפה ש-`Deploy to GitHub Pages` הצליח (`gh run list --repo LiorHen9/ChessIt`).
- **אם npm חסום בסביבת העבודה** (כך היה בסשנים הקודמים): לשכפל את preact (תגית 10.x האחרונה) ואת chess.js מ-GitHub לתיקיית scratchpad, למפות אותם ב-`paths` של tsconfig זמני, ולהריץ:
  - בדיקת טיפוסים: `tsc -p <tsconfig זמני>` (שגיאת ה-import של `styles.css` צפויה מקומית ואפשר להתעלם ממנה).
  - בנייה: `bun build src/main.tsx` עם אותם `paths`. ל-chess.js צריך קובץ דמה `src/pgn.ts`, כי מנתח ה-PGN נוצר בזמן בנייה.
    צריך `--splitting` (התוכן והחידות הם chunks נפרדים, ונתיב ה-Worker יכול להופיע בכל קובץ JS בפלט). bun לא בונה את ה-Worker מ-`new URL('./kid.worker.ts', import.meta.url)`, ולכן בונים גם את `src/engine/kid.worker.ts` כ-entry נפרד ומחליפים בפלט את `./kid.worker.ts` ב-`./kid.worker.js` (ב-Vite זה קורה לבד). מעתיקים את `public/` לתיקיית הפלט, כולל `engine/`.
  - בדיקה בדפדפן: Playwright (מותקן גלובלית, `NODE_PATH=$(npm root -g)`) מול `python3 -m http.server 4173 -d <תיקיית הפלט>`. ראו `tests/e2e/phase1.cjs` עד `phase4.cjs` (צריך להריץ את כולן בכל שלב). `phase3.cjs` משתמש ב-`?seed=` כדי שתשובות המחשב יהיו קבועות, וב-`window.__chessit` שקיים רק במצב הזה.
  - סימולציית רמות: `bun --tsconfig-override=<tsconfig זמני> tests/engine/sim.ts` (‏100 משחקים לזוג, כמה דקות). עם `ladder 20 --only-ladder` גם רמות 3–8 מול Stockfish ב-node.
  - שרת ישן מסשן קודם עלול לתפוס את פורט 4173: לבדוק ש-`curl localhost:4173` מחזיר את הבנייה הנוכחית.
  - חבילות מ-GitHub משמשות רק לבדיקה מקומית ולא נכנסות למאגר.
- גופני Google חסומים בסביבת הבדיקה, ולכן מקומית מוצג גופן חלופי.
