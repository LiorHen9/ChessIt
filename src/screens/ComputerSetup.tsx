import { useState } from 'preact/hooks';
import type { Color } from 'chess.js';
import type { Profile, Progress } from '../profiles/profiles';
import { clampLevel, LEVELS, levelInfo, usesStockfish } from '../engine/levels';
import { HandicapPicker, NO_HANDICAP, type Handicap } from '../components/HandicapPicker';
import { handicapFen } from '../chess/handicap';
import { other } from '../chess/rules';

type ColorChoice = Color | 'random';

export interface ComputerGameChoice {
  level: number;
  /** The colour the player plays. */
  color: Color;
  hints: boolean;
  startFen: string;
}

interface Props {
  me: Profile;
  progress: Progress | null;
  onStart: (choice: ComputerGameChoice) => void;
  onCancel: () => void;
}

export function ComputerSetup({ me, progress, onStart, onCancel }: Props) {
  const suggested = clampLevel(progress?.engineLevel ?? 1);
  const [level, setLevel] = useState(suggested);
  const [color, setColor] = useState<ColorChoice>('w');
  const [hints, setHints] = useState(true);
  const [handicap, setHandicap] = useState<Handicap>(NO_HANDICAP);
  const info = levelInfo(level);
  const record = progress?.vsComputer[String(level)];

  const fenFor = (myColor: Color) =>
    handicap.enabled ? handicapFen(handicap.giver === 'me' ? myColor : other(myColor), handicap.pieces) : handicapFen('w', []);

  function start() {
    const myColor: Color = color === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : color;
    onStart({ level, color: myColor, hints, startFen: fenFor(myColor) });
  }

  return (
    <main class="screen">
      <header class="topbar">
        <button class="btn btn-ghost btn-back" onClick={onCancel}>
          → חזרה
        </button>
        <span class="topbar-title">נגד המחשב</span>
        <span />
      </header>

      <div class="form">
        <fieldset class="field">
          <legend class="field-label">באיזו רמה?</legend>
          <div class="level-grid">
            {LEVELS.map((l) => (
              <button
                type="button"
                key={l.level}
                class={`level ${l.level === level ? 'is-on' : ''}`}
                aria-pressed={l.level === level}
                data-level={l.level}
                onClick={() => setLevel(l.level)}
              >
                <span class="level-icon" aria-hidden="true">
                  {l.icon}
                </span>
                <span class="level-name">{l.name}</span>
                <span class="level-num">
                  רמה <bdi dir="ltr">{l.level}</bdi>
                </span>
                {l.level === suggested && <span class="level-tag">שלך</span>}
              </button>
            ))}
          </div>
          <p class="level-blurb" aria-live="polite">
            <strong>
              {info.icon} {info.name}:
            </strong>{' '}
            {info.blurb}
            {record && record.games > 0 && (
              <span class="level-record">
                <bdi dir="ltr">{record.wins}</bdi> ניצחונות מתוך <bdi dir="ltr">{record.games}</bdi>
              </span>
            )}
          </p>
          {usesStockfish(level) && (
            <p class="fineprint">ברמות 3 ומעלה המחשב צריך אינטרנט בפעם הראשונה כדי להתכונן.</p>
          )}
        </fieldset>

        <fieldset class="field">
          <legend class="field-label">באיזה צבע {me.name}?</legend>
          <div class="segmented">
            <button type="button" class={`seg ${color === 'w' ? 'is-on' : ''}`} onClick={() => setColor('w')}>
              <span class="seg-main">⚪ לבן</span>
              <span class="seg-hint">מתחיל ראשון</span>
            </button>
            <button type="button" class={`seg ${color === 'b' ? 'is-on' : ''}`} onClick={() => setColor('b')}>
              <span class="seg-main">⚫ שחור</span>
            </button>
            <button type="button" class={`seg ${color === 'random' ? 'is-on' : ''}`} onClick={() => setColor('random')}>
              <span class="seg-main">🎲 הגרלה</span>
            </button>
          </div>
        </fieldset>

        <label class="toggle">
          <input type="checkbox" checked={hints} onChange={(e) => setHints((e.target as HTMLInputElement).checked)} />
          <span class="toggle-text">
            <span class="toggle-title">להראות לאן אפשר לזוז</span>
            <span class="toggle-hint">נקודות על המשבצות החוקיות כשבוחרים כלי</span>
          </span>
        </label>

        <HandicapPicker
          value={handicap}
          onChange={setHandicap}
          meLabel={me.name}
          themLabel="המחשב"
          previewFen={fenFor(color === 'b' ? 'b' : 'w')}
          orientation={color === 'b' ? 'b' : 'w'}
        />

        <button class="btn btn-primary btn-big" onClick={start}>
          {info.icon} יוצאים לדרך!
        </button>
      </div>
    </main>
  );
}
