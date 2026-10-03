// The 🔊 button, reading aloud on new text, and the one-time note for parents when the phone
// has no Hebrew voice.
import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { autoSpeak, speak, useHebrewVoice } from '../audio/speech';
import { RichText } from './RichText';
import { activeSettings, onSettingsChange, updateSettings, type Settings } from '../profiles/settings';

/** Re-renders when the active profile's settings change. */
export function useSettings(): Settings | null {
  const [s, setS] = useState(activeSettings());
  useEffect(() => onSettingsChange(() => setS(activeSettings())), []);
  return s;
}

/** 🔊 – hidden when the phone has no Hebrew voice. `text` may be a function (read at tap time). */
export function SpeakButton({ text, class: cls = '' }: { text: string | (() => string); class?: string }) {
  const has = useHebrewVoice();
  if (!has) return null;
  return (
    <button
      type="button"
      class={`speak-btn ${cls}`}
      aria-label="הקראה"
      onClick={(e) => {
        e.stopPropagation();
        speak(typeof text === 'function' ? text() : text);
      }}
    >
      🔊
    </button>
  );
}

/** Read `text` aloud whenever `key` changes, if the profile has narration on. */
export function useAutoSpeak(text: string | null, key: unknown = text): void {
  useEffect(() => {
    if (text) autoSpeak(text);
  }, [key]);
}

export type Tone = 'info' | 'good' | 'bad';
export interface Message {
  text: string;
  tone: Tone;
  id: number;
  /** What to read aloud, when it differs from the text (e.g. adds the next square to tap). */
  speech?: string;
}

/** The line under the board: feedback (read aloud when narration is on), or an idle hint. */
export function Feedback({ message, idle }: { message: Message | null; idle?: ComponentChildren }) {
  useAutoSpeak(message ? (message.speech ?? message.text) : null, message?.id);
  return (
    // The paragraph stays in place (a live region must exist before its text changes, or screen
    // readers miss it); the message inside is new each time, which replays the pop animation.
    <p class={`feedback ${message ? `is-${message.tone}` : ''}`} aria-live="polite">
      {message ? (
        <span class="feedback-msg" key={message.id}>
          <RichText text={message.text} /> <SpeakButton text={message.speech ?? message.text} class="speak-inline" />
        </span>
      ) : (
        (idle ?? ' ')
      )}
    </p>
  );
}

/**
 * When narration is on but the phone has no Hebrew voice, tell the parent once how to add one.
 * Waits a moment first: voices often load a little after the page.
 */
export function NarrationHelp() {
  const settings = useSettings();
  const has = useHebrewVoice();
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setWaited(true), 1500);
    return () => clearTimeout(t);
  }, []);
  if (!waited || has || !settings?.narration || settings.speechHelpSeen) return null;
  return (
    <section class="card narration-help" role="note">
      <p class="narration-help-title">🔇 אין בטלפון קול עברי להקראה</p>
      <SpeechInstall />
      <button type="button" class="btn btn-secondary" onClick={() => void updateSettings({ speechHelpSeen: true })}>
        הבנתי
      </button>
    </section>
  );
}

/** How to install a Hebrew voice, for a parent. */
export function SpeechInstall() {
  return (
    <div class="speech-install">
      <p>
        <RichText text="להורים: אפשר להוסיף קול עברי בהגדרות הטלפון, ואז לפתוח מחדש את האפליקציה." />
      </p>
      <ul>
        <li>
          <strong>אנדרואיד:</strong> הגדרות ← ניהול כללי (או מערכת) ← שפה וקלט ← פלט המרת טקסט לדיבור ← מנוע Google ← התקנת נתוני קול ←
          עברית.
        </li>
        <li>
          <strong>אייפון:</strong> הגדרות ← נגישות ← תוכן מוקרא ← קולות ← עברית ← להוריד קול (למשל כרמית).
        </li>
      </ul>
    </div>
  );
}
