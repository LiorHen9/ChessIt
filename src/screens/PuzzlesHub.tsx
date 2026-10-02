// The puzzles screen: today's puzzle, then one card per theme. A theme opens when the part of
// the path that teaches it is done (or passed in the placement test).
import { TopBar } from '../components/StationParts';
import { PARTS, WORLDS } from '../content/index';
import { localDay, THEMES } from '../content/puzzles/index';
import { isPartDone } from '../learning/progress';
import { byGender, type Profile, type Progress } from '../profiles/profiles';

interface Props {
  profile: Profile;
  progress: Progress | null;
  onBack: () => void;
  onDaily: () => void;
  onTheme: (theme: string) => void;
}

export function solvedInTheme(progress: Progress | null, theme: string): number {
  if (!progress) return 0;
  return Object.keys(progress.puzzles).filter((k) => k.startsWith(`${theme}:`)).length;
}

export function PuzzlesHub({ profile, progress, onBack, onDaily, onTheme }: Props) {
  const dailyDone = progress?.daily === localDay();
  return (
    <main class="screen puzzles">
      <TopBar title="חידות" onExit={onBack} back="→ בית" backLabel="חזרה לבית" />

      <button class={`action action-daily ${dailyDone ? 'is-done' : ''}`} onClick={onDaily} data-testid="daily">
        <span class="action-icon" aria-hidden="true">
          {dailyDone ? '✅' : '📅'}
        </span>
        <span class="action-text">
          <span class="action-title">החידה היומית</span>
          <span class="action-sub">{dailyDone ? 'פתרת את החידה של היום!' : 'חידה חדשה בכל יום – אותה חידה לכל המשפחה'}</span>
        </span>
      </button>

      <h2 class="section-title">לפי נושא</h2>
      <ul class="theme-list">
        {THEMES.map((t) => {
          const open = isPartDone(WORLDS, progress, t.part);
          const n = solvedInTheme(progress, t.id);
          return (
            <li key={t.id}>
              <button class={`action theme-card ${open ? '' : 'is-locked'}`} disabled={!open} onClick={() => onTheme(t.id)} data-theme={t.id}>
                <span class="action-icon" aria-hidden="true">
                  {open ? t.icon : '🔒'}
                </span>
                <span class="action-text">
                  <span class="action-title">{t.title}</span>
                  <span class="action-sub">
                    {open ? (
                      <>
                        {t.about}
                        {n > 0 && (
                          <>
                            {' '}
                            · {byGender(profile, 'פתרת', 'פתרת', 'נפתרו')} <bdi dir="ltr">{n}</bdi>
                          </>
                        )}
                      </>
                    ) : (
                      <>נפתח אחרי חלק {t.part}: {PARTS[t.part]}</>
                    )}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p class="credit">החידות מתוך מאגר החידות הפתוח של Lichess (‏CC0).</p>
    </main>
  );
}
