import type { Color, PieceSymbol } from 'chess.js';
import { COLOR_NAME, PIECE_GLYPH } from '../chess/rules';
import type { Profile } from '../profiles/profiles';

interface Props {
  profile: Profile;
  color: Color;
  /** Pieces this player has taken from the opponent. */
  captured: PieceSymbol[];
  /** Material lead in points; shown only when positive. */
  advantage: number;
  active: boolean;
}

export function PlayerBar({ profile, color, captured, advantage, active }: Props) {
  const opponent: Color = color === 'w' ? 'b' : 'w';
  return (
    <div class={`player ${active ? 'is-active' : ''}`}>
      <span class="avatar avatar-sm" aria-hidden="true">
        {profile.avatar}
      </span>
      <div class="player-info">
        <span class="player-name">
          {profile.name}
          <span class={`color-chip chip-${color}`}>{COLOR_NAME[color]}</span>
        </span>
        <span class="captured" dir="ltr" aria-label={`כלים שנאכלו: ${captured.length}`}>
          {captured.map((p, i) => (
            <span key={i} class={`cap piece-${opponent}`}>
              {PIECE_GLYPH[p] + '︎'}
            </span>
          ))}
          {advantage > 0 && <span class="advantage">+{advantage}</span>}
        </span>
      </div>
      {active && <span class="turn-badge">תורך</span>}
    </div>
  );
}
