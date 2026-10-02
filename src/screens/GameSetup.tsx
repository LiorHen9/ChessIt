import { useState } from 'preact/hooks';
import { byGender, GUEST, type Profile } from '../profiles/profiles';
import type { GameOptions } from '../game/savedGame';

type ColorChoice = 'w' | 'b' | 'random';

interface Props {
  me: Profile;
  others: Profile[];
  onStart: (white: Profile, black: Profile, options: GameOptions) => void;
  onCancel: () => void;
}

export function GameSetup({ me, others, onStart, onCancel }: Props) {
  const opponents = [...others, GUEST];
  const [opponentId, setOpponentId] = useState(opponents[0].id);
  const [color, setColor] = useState<ColorChoice>('w');
  const [rotate, setRotate] = useState(true);
  const [hints, setHints] = useState(true);

  function start() {
    const opponent = opponents.find((p) => p.id === opponentId) ?? GUEST;
    const meWhite = color === 'random' ? Math.random() < 0.5 : color === 'w';
    onStart(meWhite ? me : opponent, meWhite ? opponent : me, { rotate, hints });
  }

  return (
    <main class="screen">
      <header class="topbar">
        <button class="btn btn-ghost btn-back" onClick={onCancel}>
          → חזרה
        </button>
        <span class="topbar-title">משחק חדש</span>
        <span />
      </header>

      <div class="form">
        <fieldset class="field">
          <legend class="field-label">נגד מי {me.name} {byGender(me, 'משחק', 'משחקת')}?</legend>
          <div class="opponent-list">
            {opponents.map((p) => (
              <button
                type="button"
                key={p.id}
                class={`opponent ${p.id === opponentId ? 'is-on' : ''}`}
                aria-pressed={p.id === opponentId}
                onClick={() => setOpponentId(p.id)}
              >
                <span class="avatar avatar-sm" aria-hidden="true">
                  {p.avatar}
                </span>
                <span>{p.name}</span>
              </button>
            ))}
          </div>
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
          <input type="checkbox" checked={rotate} onChange={(e) => setRotate((e.target as HTMLInputElement).checked)} />
          <span class="toggle-text">
            <span class="toggle-title">לסובב את הלוח בכל תור</span>
            <span class="toggle-hint">מי שתורו תמיד רואה את הכלים שלו למטה</span>
          </span>
        </label>

        <label class="toggle">
          <input type="checkbox" checked={hints} onChange={(e) => setHints((e.target as HTMLInputElement).checked)} />
          <span class="toggle-text">
            <span class="toggle-title">להראות לאן אפשר לזוז</span>
            <span class="toggle-hint">נקודות על המשבצות החוקיות כשבוחרים כלי</span>
          </span>
        </label>

        <button class="btn btn-primary btn-big" onClick={start}>
          יוצאים לדרך!
        </button>
      </div>
    </main>
  );
}
