import { byGender, type Profile, type Progress } from '../profiles/profiles';
import { WORLDS } from '../content/index';
import { localDay } from '../content/puzzles/index';
import { totals } from '../learning/progress';
import { dueItems } from '../learning/review';
import { levelInfo } from '../engine/levels';

interface Props {
  profile: Profile;
  progress: Progress | null;
  hasSavedGame: boolean;
  onSwitchProfile: () => void;
  onNewGame: () => void;
  onResume: () => void;
  onLearn: () => void;
  onComputer: () => void;
  onDaily: () => void;
  onPuzzles: () => void;
  onReview: () => void;
  onPlacement: () => void;
}

const SOON = [{ icon: '📱', title: 'חדר לשני טלפונים', text: 'משחקים כל אחד מהמכשיר שלו' }];

/** Offer the placement test to teens and adults who have not started the path or taken it. */
export function offerPlacement(profile: Profile, progress: Progress | null): boolean {
  return profile.ageGroup === 'teenAdult' && !progress?.placement && Object.keys(progress?.stations ?? {}).length < 3;
}

export function Home(props: Props) {
  const { profile, progress, hasSavedGame, onSwitchProfile, onNewGame, onResume, onLearn, onComputer } = props;
  const dailyDone = progress?.daily === localDay();
  const due = dueItems(progress).length;
  const stats = progress?.stats;
  const path = totals(WORLDS, progress);
  const pct = path.count ? Math.round((path.done / path.count) * 100) : 0;
  const cpu = levelInfo(progress?.engineLevel ?? 1);
  return (
    <main class="screen">
      <header class="home-head">
        <button class="who" onClick={onSwitchProfile} aria-label="החלפת פרופיל">
          <span class="avatar avatar-md" aria-hidden="true">
            {profile.avatar}
          </span>
          <span class="who-text">
            <span class="who-hello">שלום,</span>
            <span class="who-name">{profile.name}</span>
          </span>
          <span class="who-switch">החלפה</span>
        </button>
        {stats && stats.games > 0 && (
          <p class="stats">
            {stats.games} משחקים · {stats.wins} ניצחונות{stats.draws > 0 ? ` · ${stats.draws} תיקו` : ''}
          </p>
        )}
      </header>

      {hasSavedGame && (
        <button class="action action-resume" onClick={onResume}>
          <span class="action-icon" aria-hidden="true">
            ▶️
          </span>
          <span class="action-text">
            <span class="action-title">המשך המשחק</span>
            <span class="action-sub">יש משחק פתוח מהפעם הקודמת</span>
          </span>
        </button>
      )}

      {offerPlacement(profile, progress) && (
        <button class="action action-placement" onClick={props.onPlacement}>
          <span class="action-icon" aria-hidden="true">
            🧭
          </span>
          <span class="action-text">
            <span class="action-title">{byGender(profile, 'כבר מכיר שחמט?', 'כבר מכירה שחמט?', 'כבר מכירים שחמט?')}</span>
            <span class="action-sub">מבחן כניסה קצר שפותח את העולמות שכבר ידועים לך</span>
          </span>
        </button>
      )}

      <button class="action action-learn" onClick={onLearn}>
        <span class="action-icon" aria-hidden="true">
          🗺️
        </span>
        <span class="action-text">
          <span class="action-title">מסלול הלימוד</span>
          <span class="action-sub">
            {path.done === 0 ? (
              'מהלוח והכלים ועד משחק שלם, צעד אחר צעד'
            ) : (
              <>
                <bdi dir="ltr">{path.done}</bdi> מתוך <bdi dir="ltr">{path.count}</bdi> תחנות · ★{' '}
                <bdi dir="ltr">{path.stars}</bdi>
              </>
            )}
          </span>
          <span class="learn-bar" aria-hidden="true">
            <span style={`width:${pct}%`} />
          </span>
        </span>
      </button>

      <div class="home-pair">
        <button class={`action action-daily ${dailyDone ? 'is-done' : ''}`} onClick={props.onDaily} data-testid="home-daily">
          <span class="action-icon" aria-hidden="true">
            {dailyDone ? '✅' : '📅'}
          </span>
          <span class="action-text">
            <span class="action-title">חידה יומית</span>
            <span class="action-sub">{dailyDone ? 'נפתרה היום!' : 'אותה חידה לכל המשפחה'}</span>
          </span>
        </button>
        <button class="action action-puzzles" onClick={props.onPuzzles}>
          <span class="action-icon" aria-hidden="true">
            🧩
          </span>
          <span class="action-text">
            <span class="action-title">חידות</span>
            <span class="action-sub">
              {progress?.stats.puzzlesSolved ? (
                <>
                  נפתרו <bdi dir="ltr">{progress.stats.puzzlesSolved}</bdi>
                </>
              ) : (
                'מט, מזלג, סיכה ועוד'
              )}
            </span>
          </span>
        </button>
      </div>

      {due > 0 && (
        <button class="action action-review" onClick={props.onReview} data-testid="home-review">
          <span class="action-icon" aria-hidden="true">
            🔁
          </span>
          <span class="action-text">
            <span class="action-title">חזרה</span>
            <span class="action-sub">
              {due === 1 ? 'פריט אחד מחכה לחזרה' : <><bdi dir="ltr">{due}</bdi> פריטים מחכים לחזרה</>}
            </span>
          </span>
        </button>
      )}

      <button class="action action-primary" onClick={onNewGame}>
        <span class="action-icon" aria-hidden="true">
          ♞
        </span>
        <span class="action-text">
          <span class="action-title">משחק לשניים</span>
          <span class="action-sub">על אותו טלפון, מעבירים מיד ליד</span>
        </span>
      </button>

      <button class="action action-computer" onClick={onComputer}>
        <span class="action-icon" aria-hidden="true">
          🤖
        </span>
        <span class="action-text">
          <span class="action-title">נגד המחשב</span>
          <span class="action-sub">
            {cpu.icon} רמה <bdi dir="ltr">{cpu.level}</bdi> · {cpu.name}
          </span>
        </span>
      </button>

      <h2 class="section-title">בקרוב</h2>
      <ul class="soon">
        {SOON.map((s) => (
          <li key={s.title} class="action action-soon" aria-disabled="true">
            <span class="action-icon" aria-hidden="true">
              {s.icon}
            </span>
            <span class="action-text">
              <span class="action-title">{s.title}</span>
              <span class="action-sub">{s.text}</span>
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}
