// Asking for a profile's PIN before entering it (or editing / deleting it).
// "Forgot" asks a question for a parent; the right answer removes the PIN.
import { useState } from 'preact/hooks';
import { PinPad } from '../components/PinPad';
import { checkPin, parentQuestion, withoutPin } from '../profiles/pin';
import { byGender, saveProfile, type Profile } from '../profiles/profiles';

interface Props {
  profile: Profile;
  /** The PIN was right, or reset by a parent (then `profile` has no PIN any more). */
  onPass: (profile: Profile, reset: boolean) => void;
  onCancel: () => void;
}

export function PinScreen({ profile, onPass, onCancel }: Props) {
  const [forgot, setForgot] = useState(false);
  const [question, setQuestion] = useState(() => parentQuestion());
  const [answer, setAnswer] = useState('');
  const [wrongAnswer, setWrongAnswer] = useState(false);

  async function reset(e: Event) {
    e.preventDefault();
    if (Number(answer.trim()) !== question.answer) {
      setWrongAnswer(true);
      setAnswer('');
      setQuestion(parentQuestion());
      return;
    }
    const p = withoutPin(profile);
    await saveProfile(p);
    onPass(p, true);
  }

  return (
    <main class="screen pin-screen">
      <header class="topbar">
        <button class="btn btn-ghost btn-back" onClick={onCancel}>
          → חזרה
        </button>
        <span class="topbar-title">כניסה לפרופיל</span>
        <span />
      </header>

      <div class="pin-who">
        <span class="avatar avatar-lg" aria-hidden="true">
          {profile.avatar}
        </span>
        <span class="profile-name">{profile.name}</span>
      </div>

      {!forgot ? (
        <>
          <PinPad
            title="מה ה-PIN?"
            hint={`ה-PIN שומר שאף אחד לא ייכנס בטעות לפרופיל ${byGender(profile, 'שלו', 'שלה', 'הזה')}.`}
            onComplete={async (pin) => {
              if (!(await checkPin(profile, pin))) return false;
              onPass(profile, false);
            }}
          />
          <button class="btn btn-ghost" onClick={() => setForgot(true)}>
            שכחתי את ה-PIN
          </button>
        </>
      ) : (
        <form class="card parent-check" onSubmit={reset}>
          <p class="parent-title">שאלה להורה</p>
          <p>
            פתרון נכון מוחק את ה-PIN, ואפשר להגדיר חדש בהגדרות. כמה זה{' '}
            <bdi dir="ltr" class="parent-q">
              {question.text}
            </bdi>
            ?
          </p>
          <input
            class="input"
            inputMode="numeric"
            pattern="[0-9]*"
            dir="ltr"
            autoComplete="off"
            aria-label="התשובה"
            value={answer}
            onInput={(e) => setAnswer((e.target as HTMLInputElement).value)}
          />
          {wrongAnswer && <p class="parent-wrong">לא נכון. הנה תרגיל אחר.</p>}
          <div class="row">
            <button class="btn btn-primary" type="submit" disabled={!answer.trim()}>
              אישור
            </button>
            <button class="btn btn-secondary" type="button" onClick={() => setForgot(false)}>
              ביטול
            </button>
          </div>
        </form>
      )}
    </main>
  );
}
