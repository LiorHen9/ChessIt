import { useEffect, useState } from 'preact/hooks';
import { ThemePicker } from '../components/ThemePicker';
import { applyTheme, CLEAN, loadTheme, suggestTheme, type Theme } from '../themes/index';
import {
  AGE_GROUPS,
  AVATARS,
  byGender,
  GENDERS,
  newProfileId,
  type AgeGroup,
  type Gender,
  type Profile
} from '../profiles/profiles';

interface Props {
  /** Existing profile to edit; undefined creates a new one. */
  profile?: Profile;
  /** Whether a back button makes sense (false on the very first profile). */
  canCancel: boolean;
  onSave: (p: Profile) => void;
  onDelete: (p: Profile) => void;
  onCancel: () => void;
}

const MAX_NAME = 16;

export function ProfileEditor({ profile, canCancel, onSave, onDelete, onCancel }: Props) {
  const [name, setName] = useState(profile?.name ?? '');
  const [avatar, setAvatar] = useState(profile?.avatar ?? AVATARS[Math.floor(Math.random() * AVATARS.length)]);
  const [ageGroup, setAgeGroup] = useState<AgeGroup | null>(profile?.ageGroup ?? null);
  const [gender, setGender] = useState<Gender | undefined>(profile?.gender);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // A new profile follows the suggestion for its age until a theme is picked by hand.
  const [pickedTheme, setPickedTheme] = useState<string | null>(profile?.themeId ?? null);
  const suggested = suggestTheme(ageGroup, gender);
  const themeId = pickedTheme ?? suggested;
  const [theme, setTheme] = useState<Theme>(CLEAN);

  // Live preview: the whole screen takes the theme being chosen.
  useEffect(() => {
    void applyTheme(themeId);
    void loadTheme(themeId).then(setTheme);
  }, [themeId]);

  const avatars = [...new Set([...theme.avatars, ...AVATARS])];

  const trimmed = name.trim();
  const valid = trimmed.length > 0 && ageGroup !== null;

  function save(e: Event) {
    e.preventDefault();
    if (!valid) return;
    onSave({
      id: profile?.id ?? newProfileId(),
      name: trimmed,
      avatar,
      ageGroup: ageGroup!,
      gender,
      themeId,
      pinHash: profile?.pinHash,
      pinSalt: profile?.pinSalt,
      createdAt: profile?.createdAt ?? Date.now()
    });
  }

  return (
    <main class="screen">
      <header class="topbar">
        {canCancel ? (
          <button class="btn btn-ghost btn-back" onClick={onCancel}>
            → חזרה
          </button>
        ) : (
          <span />
        )}
        <span class="topbar-title">{profile ? 'עריכת פרופיל' : 'פרופיל חדש'}</span>
        <span />
      </header>

      <form class="form" onSubmit={save}>
        <div class="avatar-preview" aria-hidden="true">
          <span class="avatar avatar-xl">{avatar}</span>
        </div>

        <label class="field">
          <span class="field-label">שם</span>
          <input
            class="input"
            type="text"
            value={name}
            maxLength={MAX_NAME}
            placeholder="איך קוראים לך?"
            autoComplete="off"
            onInput={(e) => setName((e.target as HTMLInputElement).value)}
          />
        </label>

        <fieldset class="field">
          <legend class="field-label">בחירת דמות</legend>
          <div class="avatar-grid">
            {avatars.map((a) => (
              <button
                type="button"
                key={a}
                class={`avatar-option ${a === avatar ? 'is-on' : ''}`}
                aria-pressed={a === avatar}
                onClick={() => setAvatar(a)}
              >
                {a}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset class="field">
          <legend class="field-label">גיל</legend>
          <div class="segmented">
            {AGE_GROUPS.map((g) => (
              <button
                type="button"
                key={g.id}
                class={`seg ${ageGroup === g.id ? 'is-on' : ''}`}
                aria-pressed={ageGroup === g.id}
                onClick={() => setAgeGroup(g.id)}
              >
                {/* Numbers like "5–7" must read left-to-right inside the RTL page */}
                <span class="seg-main" dir="ltr">
                  {g.label}
                </span>
                <span class="seg-hint">{g.hint}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset class="field">
          <legend class="field-label">
            בן או בת? <span class="optional">(לא חובה – עוזר לנו לבחור עיצוב ולפנות נכון)</span>
          </legend>
          <div class="segmented">
            {GENDERS.map((g) => (
              <button
                type="button"
                key={g.id}
                class={`seg ${gender === g.id ? 'is-on' : ''}`}
                aria-pressed={gender === g.id}
                onClick={() => setGender(gender === g.id ? undefined : g.id)}
              >
                <span class="seg-main">{g.label}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset class="field">
          <legend class="field-label">
            ערכת נושא <span class="optional">(אפשר לשנות בכל רגע)</span>
          </legend>
          <ThemePicker value={themeId} onChange={setPickedTheme} suggested={suggested} />
        </fieldset>

        <button class="btn btn-primary btn-big" type="submit" disabled={!valid}>
          {profile ? 'שמירה' : 'יצירת פרופיל'}
        </button>
        {!valid && <p class="fineprint">צריך שם ובחירת גיל.</p>}

        {profile &&
          (confirmDelete ? (
            <section class="card confirm">
              <p>למחוק את הפרופיל של {profile.name}? כל ההתקדמות {byGender(profile, 'שלו', 'שלה')} תימחק.</p>
              <div class="row">
                <button type="button" class="btn btn-danger" onClick={() => onDelete(profile)}>
                  כן, למחוק
                </button>
                <button type="button" class="btn btn-secondary" onClick={() => setConfirmDelete(false)}>
                  ביטול
                </button>
              </div>
            </section>
          ) : (
            <button type="button" class="btn btn-ghost btn-danger-text" onClick={() => setConfirmDelete(true)}>
              מחיקת הפרופיל
            </button>
          ))}
      </form>
    </main>
  );
}
