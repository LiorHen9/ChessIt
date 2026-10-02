// Spaced review: stations and puzzles whose time has come. Tapping an item opens it;
// finishing it updates its next date (see learning/review.ts).
import { TopBar } from '../components/StationParts';
import { findStation } from '../content/index';
import { themeInfo } from '../content/puzzles/index';
import { dueItems, type ReviewItem } from '../learning/review';
import { byGender, type Profile, type Progress } from '../profiles/profiles';

interface Props {
  profile: Profile;
  progress: Progress | null;
  onBack: () => void;
  onOpen: (item: ReviewItem) => void;
}

export function ReviewScreen({ profile, progress, onBack, onOpen }: Props) {
  const items = dueItems(progress).filter((i) => i.kind === 'puzzle' || !!findStation(i.id));
  return (
    <main class="screen review">
      <TopBar title="חזרה" onExit={onBack} back="→ בית" backLabel="חזרה לבית" />
      <section class="card review-intro">
        <p>
          🔁 {byGender(profile, 'תחנות וחידות שבהן טעית חוזרות', 'תחנות וחידות שבהן טעית חוזרות', 'תחנות וחידות עם טעויות חוזרות')}{' '}
          אחרי יום, 3 ימים, שבוע ושבועיים. פתרון בלי טעויות מקדם אותן הלאה.
        </p>
      </section>
      {items.length === 0 ? (
        <p class="map-end">✨ אין כרגע מה לחזור עליו. כל הכבוד!</p>
      ) : (
        <ul class="review-list">
          {items.map((it) => {
            const key = it.kind === 'station' ? it.id : `${it.theme}:${it.id}`;
            const found = it.kind === 'station' ? findStation(it.id) : null;
            const info = it.kind === 'puzzle' ? themeInfo(it.theme) : null;
            return (
              <li key={key}>
                <button class="action review-item" onClick={() => onOpen(it)} data-review={key}>
                  <span class="action-icon" aria-hidden="true">
                    {found ? (found.station.icon ?? '📖') : (info?.icon ?? '🧩')}
                  </span>
                  <span class="action-text">
                    <span class="action-title">{found ? found.station.title : `חידה: ${info?.title ?? ''}`}</span>
                    <span class="action-sub">{found ? `עולם ${found.world.title}` : 'מתוך מאגר Lichess'}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
