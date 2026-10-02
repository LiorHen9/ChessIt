import type { Profile, Progress } from '../profiles/profiles';
import { WORLDS } from '../content/index';
import { totals } from '../learning/progress';
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
}

const SOON = [{ icon: '📱', title: 'חדר לשני טלפונים', text: 'משחקים כל אחד מהמכשיר שלו' }];

export function Home({ profile, progress, hasSavedGame, onSwitchProfile, onNewGame, onResume, onLearn, onComputer }: Props) {
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

      <button class="action action-learn" onClick={onLearn}>
        <span class="action-icon" aria-hidden="true">
          🗺️
        </span>
        <span class="action-text">
          <span class="action-title">מסלול הלימוד</span>
          <span class="action-sub">
            {path.done === 0 ? (
              'לומדים את הלוח ואת הכלים, צעד אחר צעד'
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
