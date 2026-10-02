// Per-profile settings: theme, sounds, narration and PIN. Loaded lazily (not part of the first load).
import { useState } from 'preact/hooks';
import { ThemePicker } from '../components/ThemePicker';
import { PinPad } from '../components/PinPad';
import { SpeechInstall, useSettings } from '../components/Speak';
import { speak, useHebrewVoice } from '../audio/speech';
import { playSound } from '../audio/sound';
import { updateSettings } from '../profiles/settings';
import { hasPin, withoutPin, withPin } from '../profiles/pin';
import { saveProfile, type Profile } from '../profiles/profiles';
import { gendered } from '../learning/text';
import { applyTheme, suggestTheme } from '../themes/index';

interface Props {
  profile: Profile;
  onBack: () => void;
  /** The profile changed (theme or PIN) and was saved. */
  onProfile: (p: Profile) => void;
  onEdit: () => void;
}

type PinStep = 'idle' | 'new' | 'confirm' | 'saved' | 'removed';

export function SettingsScreen({ profile, onBack, onProfile, onEdit }: Props) {
  const settings = useSettings();
  const voice = useHebrewVoice();
  const [pinStep, setPinStep] = useState<PinStep>('idle');
  const [firstPin, setFirstPin] = useState('');
  const [mismatch, setMismatch] = useState(false);

  async function change(p: Profile) {
    await saveProfile(p);
    onProfile(p);
  }

  function pickTheme(id: string) {
    void applyTheme(id);
    void change({ ...profile, themeId: id });
  }

  if (!settings) return <main class="screen loading" aria-busy="true" />;

  return (
    <main class="screen settings">
      <header class="topbar">
        <button class="btn btn-ghost btn-back" onClick={onBack}>
          → חזרה
        </button>
        <span class="topbar-title">הגדרות של {profile.name}</span>
        <span />
      </header>

      <section class="settings-section">
        <h2 class="section-title">🎨 ערכת נושא</h2>
        <ThemePicker value={profile.themeId} onChange={pickTheme} suggested={suggestTheme(profile.ageGroup, profile.gender)} />
      </section>

      <section class="settings-section">
        <h2 class="section-title">🔊 צלילים והקראה</h2>
        <label class="toggle">
          <input
            type="checkbox"
            data-setting="sound"
            checked={settings.sound}
            onChange={(e) => {
              const on = (e.target as HTMLInputElement).checked;
              void updateSettings({ sound: on }).then(() => on && playSound('star'));
            }}
          />
          <span class="toggle-text">
            <span class="toggle-title">צלילים</span>
            <span class="toggle-hint">צליל קצר למסע, לאכילה, לשח ולכוכבים</span>
          </span>
        </label>
        <label class="toggle">
          <input
            type="checkbox"
            data-setting="narration"
            checked={settings.narration}
            onChange={(e) => void updateSettings({ narration: (e.target as HTMLInputElement).checked })}
          />
          <span class="toggle-text">
            <span class="toggle-title">הקראה אוטומטית</span>
            <span class="toggle-hint">
              כל משימה חדשה מוקראת בקול. מתאים במיוחד לגיל <bdi dir="ltr">5–7</bdi>. בכל מקרה אפשר ללחוץ על 🔊.
            </span>
          </span>
        </label>
        {voice ? (
          <div class="voice-ok">
            <span>✓ יש בטלפון קול עברי</span>
            <button type="button" class="btn btn-secondary" onClick={() => speak(`שלום ${profile.name}! בואו נלמד שחמט.`)}>
              🔊 לשמוע דוגמה
            </button>
          </div>
        ) : (
          <div class="card voice-missing">
            <p class="narration-help-title">🔇 אין בטלפון קול עברי, ולכן ההקראה לא פועלת</p>
            <SpeechInstall />
          </div>
        )}
      </section>

      <section class="settings-section">
        <h2 class="section-title">🔒 PIN לפרופיל</h2>
        <p class="settings-note">
          ה-PIN עוזר שאחים לא ייכנסו בטעות לפרופיל של מישהו אחר. זו לא נעילה אמיתית: הורה תמיד יכול לאפס אותו בשאלת חשבון.
        </p>
        {pinStep === 'new' && (
          <div class="card">
            <PinPad
              key="new"
              title={gendered('{בחר|בחרי} PIN של 4 ספרות', profile)}
              onComplete={(pin) => {
                setFirstPin(pin);
                setMismatch(false);
                setPinStep('confirm');
              }}
            />
          </div>
        )}
        {pinStep === 'confirm' && (
          <div class="card">
            <PinPad
              key="confirm"
              title="עוד פעם, לאישור"
              hint={mismatch ? 'לא תאם. נסו שוב.' : undefined}
              onComplete={async (pin) => {
                if (pin !== firstPin) {
                  setMismatch(true);
                  return false;
                }
                await change(await withPin(profile, pin));
                setPinStep('saved');
              }}
            />
          </div>
        )}
        {(pinStep === 'idle' || pinStep === 'saved' || pinStep === 'removed') && (
          <div class="pin-status">
            {pinStep === 'saved' && <p class="feedback is-good">✓ ה-PIN נשמר</p>}
            {pinStep === 'removed' && <p class="feedback is-good">✓ ה-PIN הוסר</p>}
            {hasPin(profile) ? (
              <div class="row">
                <button class="btn btn-secondary" data-pin="change" onClick={() => setPinStep('new')}>
                  שינוי PIN
                </button>
                <button
                  class="btn btn-secondary"
                  data-pin="remove"
                  onClick={() => {
                    void change(withoutPin(profile));
                    setPinStep('removed');
                  }}
                >
                  הסרת PIN
                </button>
              </div>
            ) : (
              <button class="btn btn-secondary" data-pin="set" onClick={() => setPinStep('new')}>
                הגדרת PIN
              </button>
            )}
          </div>
        )}
      </section>

      <section class="settings-section">
        <h2 class="section-title">👤 הפרופיל</h2>
        <button class="btn btn-secondary" onClick={onEdit}>
          ✎ שם, דמות וגיל
        </button>
      </section>
    </main>
  );
}
