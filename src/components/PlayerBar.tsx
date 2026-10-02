import type { Color, PieceSymbol } from 'chess.js';
import { COLOR_NAME } from '../chess/rules';
import { PieceIcon } from './Piece';
import type { Profile } from '../profiles/profiles';

interface Props {
  profile: Profile;
  color: Color;
  /** Pieces this player has taken from the opponent. */
  captured: PieceSymbol[];
  /** Material lead in points; shown only when positive. */
  advantage: number;
  active: boolean;
  /** Text of the badge shown while active ("תורך", or "חושב…" for the computer). */
  badge?: string;
}

export function PlayerBar({ profile, color, captured, advantage, active, badge = 'תורך' }: Props) {
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
            <PieceIcon key={i} color={opponent} type={p} class="cap" />
          ))}
          {advantage > 0 && <span class="advantage">+{advantage}</span>}
        </span>
      </div>
      {active && <span class={`turn-badge ${badge === 'תורך' ? '' : 'is-thinking'}`}>{badge}</span>}
    </div>
  );
}
