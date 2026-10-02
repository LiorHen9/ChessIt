# ארכיטקטורה – אפליקציית לימוד שחמט

אפליקציית רשת סטטית (PWA) לטלפון, בעברית, שמאוחסנת ב-GitHub Pages. כל הנתונים נשמרים מקומית על המכשיר. רכיב הרשת היחיד הוא ממסר מסעים עבור מצב "חדר".

## עקרונות

1. **מקומי קודם** – פרופילים, התקדמות והגדרות נשמרים רק במכשיר. בלי הרשמה ובלי שרת נתונים.
2. **עובד בלי אינטרנט** – אחרי הטעינה הראשונה הכול עובד אופליין, חוץ ממצב החדר.
3. **תוכן כנתונים** – שיעורים, חידות ועולמות מוגדרים בקובצי JSON ולא בקוד. מוסיפים שלב בלי לגעת בלוגיקה.
4. **שכבות מופרדות** – חוקי שחמט, מנוע, אחסון ותקשורת מאחורי ממשקים, כדי שאפשר יהיה להחליף כל אחד מהם.
5. **מותאם לגיל** – כל טקסט וכל התנהגות שתלויים בגיל נקבעים לפי קבוצת הגיל של הפרופיל הפעיל.

## תמונה כללית

```mermaid
flowchart TB
    subgraph Device["הטלפון (דפדפן / PWA מותקנת)"]
        UI["ממשק – מסכים ורכיבים"]
        Theme["ערכות נושא"]
        Learn["מנוע לימוד – מסלול, כוכבים, חזרה מרווחת"]
        Game["בקר משחק"]
        Rules["חוקי שחמט – chess.js"]
        Engine["מנוע מחשב – Web Worker"]
        Store["שכבת אחסון – IndexedDB"]
        Content["תוכן – JSON של עולמות, שיעורים, חידות"]
        Net["שכבת חדר – ממשק Transport"]
    end
    Relay["ממסר מסעים – Firebase Realtime DB"]

    UI --> Theme
    UI --> Learn
    UI --> Game
    Learn --> Content
    Learn --> Rules
    Game --> Rules
    Game --> Engine
    Game --> Net
    Learn --> Store
    UI --> Store
    Net <--> Relay
```

## בחירות טכנולוגיות

| תחום | בחירה | למה |
| --- | --- | --- |
| שפה ובנייה | TypeScript + Vite | טיפוסים לחוקי המשחק ולמודל הנתונים, בנייה מהירה |
| ממשק | Preact | קל מאוד (כ-4KB), רכיבים כמו React |
| חוקי שחמט | chess.js | ספרייה בדוקה למסעים חוקיים, שח, מט, פט ו-FEN |
| לוח | SVG משלנו | שליטה מלאה בערכות נושא, אנימציות וגרירה במגע |
| מנוע מחשב | Stockfish (גרסת WASM) ב-Web Worker | רמות 0–20, לא תוקע את הממשק |
| יריב לילדים קטנים | מנוע פשוט משלנו | Stockfish חזק מדי גם ברמה הנמוכה; מנוע שטועה בכוונה נעים יותר לגיל 5–7 |
| אחסון | IndexedDB (עטיפה קטנה משלנו, `src/storage/db.ts`) | יציב יותר מ-localStorage; בלי ספרייה נוספת |
| אופליין | Service Worker (vite-plugin-pwa) | התקנה למסך הבית ועבודה בלי רשת |
| חדרים | Firebase Realtime Database, תוכנית חינמית | אמין ברשתות סלולריות, בלי שרת משלנו |
| הקראה | Web Speech API | הקראה בעברית לגיל 5–7, כשיש קול עברי במכשיר |
| אירוח | GitHub Pages + GitHub Actions | פריסה אוטומטית בכל דחיפה לענף הראשי |

**רישוי**: Stockfish מופץ ברישיון GPL-3. מכיוון שהמאגר ציבורי, הכי פשוט לפרסם גם את הפרויקט כולו ב-GPL-3.

## מבנה תיקיות

```
src/
  app/            ניתוב, מצב גלובלי, פרופיל פעיל
  screens/        מסך לכל מסך ברשימת המסכים
  components/     Board, Piece, StarBar, Avatar, Button...
  chess/          עטיפה ל-chess.js, המרות FEN, בדיקת מטרות שיעור
  engine/         ממשק Engine, StockfishEngine, KidEngine, worker
  learning/       מסלול, פתיחת שלבים, ניקוד כוכבים, חזרה מרווחת
  content/
    worlds/       world-01-board.json, world-02-pieces.json ...
    puzzles/      puzzles-mate1.json, puzzles-tactics.json ...
    texts/        טקסטים לפי קבוצת גיל: he-kids.json, he-teen.json, he-adult.json
  storage/        ממשק Storage, מימוש IndexedDB, גיבוי ושחזור
  net/            ממשק Transport, FirebaseTransport, ניהול חדר
  themes/         space, forest, clean... (צבעים, כלים, צלילים)
  audio/          צלילים והקראה
public/
  icons/, manifest
```

## מודל נתונים (מקומי)

```ts
type AgeGroup = 'kids5_7' | 'kids8_12' | 'teenAdult';

interface Profile {
  id: string;
  name: string;
  avatar: string;
  ageGroup: AgeGroup;
  gender?: 'boy' | 'girl' | 'other';   // משמש רק להצעת ערכת נושא
  themeId: string;
  pinHash?: string;                    // PIN אופציונלי לפרופיל
  createdAt: number;
}

interface Progress {
  profileId: string;
  stations: Record<string, { stars: 0 | 1 | 2 | 3; completedAt?: number }>;
  review: Record<string, { due: number; interval: number }>; // חזרה מרווחת
  engineLevel: number;                 // הרמה הנוכחית מול המחשב
  stats: { games: number; wins: number; puzzlesSolved: number };
}

interface Settings {
  profileId: string;
  sound: boolean;
  narration: boolean;
  hints: 'always' | 'onRequest' | 'off';
}
```

מאגרים ב-IndexedDB: `profiles`, `progress`, `settings`, `meta` (גרסת סכמה).
בהפעלה הראשונה מבקשים `navigator.storage.persist()` כדי להקטין את הסיכוי שהדפדפן ימחק את הנתונים.
**גיבוי**: ייצוא כל המאגרים לקובץ JSON אחד, וייבוא ממנו. בגיבוי יש מספר גרסה כדי שאפשר יהיה להמיר גיבויים ישנים.

## מודל התוכן

כל עולם הוא קובץ JSON עם תחנות. כל תחנה היא שיעור, משחקון או חידה:

```json
{
  "id": "rook-collect-1",
  "type": "minigame",
  "piece": "rook",
  "fen": "8/8/8/8/8/8/8/R7 w - - 0 1",
  "goal": { "kind": "collectStars", "squares": ["a5", "e5", "e1"] },
  "stars": { "3": 3, "2": 5, "1": 8 },
  "text": {
    "kids5_7": "הצריח נוסע ישר! אסוף את כל הכוכבים.",
    "kids8_12": "הצריח זז בקווים ישרים, כמה משבצות שרוצים. אסוף את הכוכבים בכמה שפחות מסעים.",
    "teenAdult": "הצריח נע לאורך שורות וטורים. אסוף את כל הכוכבים במספר מסעים מינימלי."
  }
}
```

סוגי מטרות: `collectStars`, `captureAll`, `mateIn`, `escapeCheck`, `defend`, `findBestMove`.
`chess/` בודק כל מטרה, ו-`learning/` מחשב את הכוכבים לפי מספר המסעים או הרמזים.

**מקור לחידות**: מאגר החידות של Lichess פתוח לשימוש חופשי ומסווג לפי נושא ורמה. נסנן ממנו מראש קבצים קטנים לכל נושא ורמה.

## מנוע המחשב

```ts
interface Engine {
  init(): Promise<void>;
  bestMove(fen: string, level: number): Promise<string>; // מסע בפורמט UCI
  evaluate?(fen: string): Promise<number>;               // לסיכום המשחק
  dispose(): void;
}
```

- **רמות 1–2**: `KidEngine` – בוחר מסעים חוקיים באקראי, מעדיף הכאות, ומפספס בכוונה חלק מהאיומים.
- **רמות 3–8**: `StockfishEngine` עם Skill Level ועומק חיפוש מוגבלים.
- **התאמה אוטומטית**: אחרי 3 ניצחונות ברצף מוצע לעלות רמה, ואחרי 3 הפסדים ברצף מוצע לרדת.
- **סיכום משחק**: הערכת עמדה לפני כל מסע ואחריו מזהה את המסע הטוב ביותר ואת הטעות הגדולה ביותר.

## מצב חדר

```ts
interface Transport {
  createRoom(): Promise<{ code: string }>;
  joinRoom(code: string): Promise<void>;
  sendMove(uci: string, ply: number): void;
  sendReaction(id: ReactionId): void;   // רק סמלים מוכנים מראש
  onMessage(cb: (msg: RoomMessage) => void): void;
  leave(): void;
}
```

- **קוד חדר**: 5 תווים מאלפבית בלי תווים מבלבלים (כמו 0/O או 1/I), ו-QR לסריקה.
- **מה עובר**: שם תצוגה, צבע, מסעים עם מספר מסע, סמלי רגש מוכנים מראש. בלי צ'אט חופשי.
- **אמינות**: כל מכשיר מאמת כל מסע עם chess.js. אם יש חוסר התאמה, המכשירים מסתנכרנים לפי רשימת המסעים המלאה.
- **ניקוי**: חדר נמחק בסוף המשחק או אחרי שעתיים בלי פעילות. כללי האבטחה ב-Firebase מתירים קריאה וכתיבה רק לחדר שהמשתמש יודע את הקוד שלו.
- **החלפה עתידית**: בזכות ממשק `Transport` אפשר לעבור לחיבור ישיר בין המכשירים (WebRTC) בלי לשנות את בקר המשחק.

## ערכות נושא והתאמה לגיל

- ערכת נושא = צבעי לוח, סט כלים ב-SVG, רקע, צלילים ואווטארים. כל ערכה היא תיקייה תחת `themes/`.
- ערכת ברירת המחדל מוצעת לפי קבוצת גיל ומין, וכל פרופיל יכול לבחור כל ערכה.
- `texts/` מחזיק גרסת טקסט לכל קבוצת גיל. לגיל 5–7 הטקסטים מוקראים כשההקראה פעילה.

## עברית ו-RTL

- הממשק כולו `dir="rtl"`. הלוח עצמו תמיד בכיוון LTR, כדי שהטורים a–h יופיעו כמו בכל לוח שחמט.
- שמות הכלים בעברית: מלך, מלכה, צריח, רץ, פרש, רגלי.
- סימון המשבצות נשאר באותיות לטיניות (e4), כמו בשחמט התחרותי בישראל.

## ביצועים ונגישות

- טעינה ראשונה עד 300KB בלי Stockfish. המנוע נטען רק כשנכנסים למשחק מול המחשב.
- גודל מגע מינימלי של 44 פיקסלים, גרירה וגם הקשה (בחירת כלי ואז משבצת).
- ניגודיות מספקת בכל ערכה, ותמיכה בהקטנת אנימציות.
