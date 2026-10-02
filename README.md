# ChessIt

אפליקציית רשת לטלפון ללימוד שחמט, בעברית, לילדים ולמבוגרים. כל משפחה מנהלת כמה פרופילים על אותו מכשיר, וכל פרופיל מתקדם במסלול משלו. כל הנתונים נשמרים על הטלפון בלבד.

## מסמכים

- [ארכיטקטורה](docs/ARCHITECTURE.md)
- [מפת דרכים](docs/ROADMAP.md)

## הרצה מקומית

דרוש Node.js 22 ומעלה.

```bash
npm install
npm run dev       # שרת פיתוח
npm run build     # בדיקת טיפוסים ובנייה לתיקיית dist
npm run preview   # הצגת הגרסה הבנויה
```

כדי לבדוק מהטלפון ברשת הביתית: `npm run dev -- --host`, ואז לפתוח בטלפון את הכתובת שמופיעה.

## פריסה

כל דחיפה לענף `main` בונה את האתר ומפרסמת אותו ב-GitHub Pages, דרך `.github/workflows/deploy.yml`.

הגדרה חד-פעמית במאגר: **Settings ← Pages ← Source: GitHub Actions**.

## רישיון

GPL-3.0-or-later. ראו [LICENSE](LICENSE).
הרישיון נבחר כדי לאפשר שימוש במנוע Stockfish, שמופץ גם הוא ב-GPL-3.

החידות לקוחות ממאגר החידות הפתוח של [Lichess](https://database.lichess.org/#puzzles) (‏CC0). כדי לבנות אותן מחדש מהמאגר המלא: `bun scripts/puzzles.ts lichess_db_puzzle.csv` (ההוראות בראש הסקריפט).
