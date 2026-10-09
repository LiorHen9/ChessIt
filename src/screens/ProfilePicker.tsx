import { BrowserBanner } from '../components/BrowserNotice';
import type { Profile } from '../profiles/profiles';

interface Props {
  profiles: Profile[];
  onPick: (p: Profile) => void;
  onCreate: () => void;
  onEdit: (p: Profile) => void;
  onBackup: () => void;
  onAbout: () => void;
}

export function ProfilePicker({ profiles, onPick, onCreate, onEdit, onBackup, onAbout }: Props) {
  const first = profiles.length === 0;
  return (
    <main class="screen">
      <header class="hero">
        <h1 class="logo">ChessIt</h1>
        <p class="lead">{first ? 'ברוכים הבאים! בואו ניצור פרופיל ראשון.' : 'מי משחק עכשיו?'}</p>
      </header>

      <BrowserBanner what="מה שתעשו" />

      {!first && (
        <ul class="profile-grid">
          {profiles.map((p) => (
            <li key={p.id} class="profile-tile">
              <button class="profile-pick" onClick={() => onPick(p)}>
                <span class="avatar avatar-lg" aria-hidden="true">
                  {p.avatar}
                </span>
                <span class="profile-name">{p.name}</span>
              </button>
              <button class="profile-edit" onClick={() => onEdit(p)} aria-label={`עריכת ${p.name}`}>
                ✎
              </button>
            </li>
          ))}
        </ul>
      )}

      <button class={`btn ${first ? 'btn-primary btn-big' : 'btn-secondary'}`} onClick={onCreate}>
        + פרופיל חדש
      </button>

      <p class="fineprint">הפרופילים נשמרים רק בטלפון הזה.</p>

      <nav class="picker-links" aria-label="כל המשפחה">
        <button class="btn btn-ghost" data-testid="picker-backup" onClick={onBackup}>
          💾 גיבוי ושחזור
        </button>
        <button class="btn btn-ghost" data-testid="picker-about" onClick={onAbout}>
          ℹ️ אודות ופרטיות
        </button>
      </nav>
    </main>
  );
}
