import { useState } from 'preact/hooks';
import { byGender, saveProfile, type Profile, type Progress } from '../profiles/profiles';
import { ThemePicker } from '../components/ThemePicker';
import { applyTheme, suggestTheme } from '../themes/index';
import { WORLDS } from '../content/index';
import { localDay } from '../content/puzzles/index';
import { totals } from '../learning/progress';
import { dueItems } from '../learning/review';
import { levelInfo } from '../engine/levels';
import type { OpenRoom } from '../net/openRoom';

interface Props {
  profile: Profile;
  progress: Progress | null;
  hasSavedGame: boolean;
  /** This profile's open room (two phones), to come back to. */
  openRoom?: OpenRoom;
  onRoom: () => void;
  onResumeRoom: () => void;
  onSwitchProfile: () => void;
  onNewGame: () => void;
  onResume: () => void;
  onLearn: () => void;
  onComputer: () => void;
  onDaily: () => void;
  onPuzzles: () => void;
  onReview: () => void;
  onPlacement: () => void;
  onSettings: () => void;
  /** The profile changed here (theme) and was saved. */
  onProfile: (p: Profile) => void;
  /** Show the one-time "back up the family" reminder (storage/backupState.ts). */
  backupNudge: boolean;
  onBackup: () => void;
  onDismissNudge: () => void;
}

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
  const [themes, setThemes] = useState(false);
  return (
    <main class="screen">
      <header class="home-head">
        <div class="home-top">
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
          <button class="icon-btn" data-testid="home-theme" onClick={() => setThemes(true)} aria-label="החלפת ערכת נושא">
            🎨
          </button>
          <button class="icon-btn" data-testid="home-settings" onClick={props.onSettings} aria-label="הגדרות">
            ⚙️
          </button>
        </div>
        {stats && stats.games > 0 && (
          <p class="stats">
            {stats.games} משחקים · {stats.wins} ניצחונות{stats.draws > 0 ? ` · ${stats.draws} תיקו` : ''}
          </p>
        )}
      </header>

      {props.backupNudge && (
        <section class="card nudge" data-testid="backup-nudge" aria-labelledby="nudge-title">
          <p class="nudge-title" id="nudge-title">
            💾 כבר <bdi dir="ltr">20</bdi> תחנות!
          </p>
          <p class="nudge-text">כדאי לגבות את ההתקדמות של כל המשפחה לקובץ, למקרה שהטלפון יוחלף או יאבד. לוקח חצי דקה.</p>
          <div class="row">
            <button class="btn btn-primary" data-testid="nudge-backup" onClick={props.onBackup}>
              לגבות עכשיו
            </button>
            <button class="btn btn-secondary" data-testid="nudge-dismiss" onClick={props.onDismissNudge}>
              לא עכשיו
            </button>
          </div>
        </section>
      )}

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

      {props.openRoom && (
        <button class="action action-resume action-room-resume" data-testid="home-room-resume" onClick={props.onResumeRoom}>
          <span class="action-icon" aria-hidden="true">
            📱
          </span>
          <span class="action-text">
            <span class="action-title">חזרה לחדר</span>
            <span class="action-sub">
              חדר <bdi dir="ltr">{props.openRoom.code}</bdi> עדיין פתוח
            </span>
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

      <button class="action action-room" data-testid="home-room" onClick={props.onRoom}>
        <span class="action-icon" aria-hidden="true">
          📱
        </span>
        <span class="action-text">
          <span class="action-title">חדר לשני טלפונים</span>
          <span class="action-sub">כל אחד מהטלפון שלו, גם מבית אחר</span>
        </span>
      </button>

      {themes && (
        <div class="sheet-backdrop" onClick={() => setThemes(false)}>
          <section class="card sheet" role="dialog" aria-label="ערכת נושא" onClick={(e) => e.stopPropagation()}>
            <h2 class="sheet-title">איזה עיצוב בא לך?</h2>
            <ThemePicker
              value={profile.themeId}
              suggested={suggestTheme(profile.ageGroup, profile.gender)}
              onChange={(id) => {
                const p = { ...profile, themeId: id };
                void applyTheme(id);
                void saveProfile(p).then(() => props.onProfile(p));
              }}
            />
            <button class="btn btn-primary" onClick={() => setThemes(false)}>
              סיימתי
            </button>
          </section>
        </div>
      )}

    </main>
  );
}
