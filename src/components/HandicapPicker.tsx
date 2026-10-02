import type { Color } from 'chess.js';
import { Chess } from 'chess.js';
import { Board } from './Board';
import { chessPosition, PIECE_NAME } from '../chess/rules';
import { PieceIcon } from './Piece';
import { HANDICAP_OPTIONS, type HandicapPiece } from '../chess/handicap';

export interface Handicap {
  enabled: boolean;
  /** Who plays without pieces. */
  giver: 'me' | 'them';
  pieces: HandicapPiece[];
}

export const NO_HANDICAP: Handicap = { enabled: false, giver: 'me', pieces: ['q'] };

interface Props {
  value: Handicap;
  onChange: (h: Handicap) => void;
  meLabel: string;
  themLabel: string;
  /** The starting position with the current choice, for the small preview board. */
  previewFen: string;
  orientation: Color;
}

export function HandicapPicker({ value, onChange, meLabel, themLabel, previewFen, orientation }: Props) {
  const set = (patch: Partial<Handicap>) => onChange({ ...value, ...patch });
  const toggle = (id: HandicapPiece) =>
    set({ pieces: value.pieces.includes(id) ? value.pieces.filter((p) => p !== id) : [...value.pieces, id] });

  return (
    <section class="handicap">
      <label class="toggle">
        <input type="checkbox" checked={value.enabled} onChange={(e) => set({ enabled: (e.target as HTMLInputElement).checked })} />
        <span class="toggle-text">
          <span class="toggle-title">מצב הורה-ילד: הורדת כלים</span>
          <span class="toggle-hint">השחקן החזק מתחיל בלי כמה כלים, וכך המשחק שווה יותר</span>
        </span>
      </label>

      {value.enabled && (
        <div class="handicap-body">
          <fieldset class="field">
            <legend class="field-label">מי מוותר על כלים?</legend>
            <div class="segmented">
              <button type="button" class={`seg ${value.giver === 'me' ? 'is-on' : ''}`} onClick={() => set({ giver: 'me' })}>
                <span class="seg-main">{meLabel}</span>
              </button>
              <button type="button" class={`seg ${value.giver === 'them' ? 'is-on' : ''}`} onClick={() => set({ giver: 'them' })}>
                <span class="seg-main">{themLabel}</span>
              </button>
            </div>
          </fieldset>

          <fieldset class="field">
            <legend class="field-label">בלי אילו כלים?</legend>
            <div class="piece-chips">
              {HANDICAP_OPTIONS.map((o) => {
                const on = value.pieces.includes(o.id);
                return (
                  <button
                    type="button"
                    key={o.id}
                    class={`piece-chip ${on ? 'is-on' : ''}`}
                    aria-pressed={on}
                    data-piece={o.id}
                    onClick={() => toggle(o.id)}
                  >
                    <PieceIcon color="w" type={o.type} class="piece-chip-glyph" />
                    <span>{PIECE_NAME[o.type]}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div class="mini-board" aria-label="עמדת הפתיחה">
            <Board quiet
              position={chessPosition(new Chess(previewFen))}
              orientation={orientation}
              interactive={false}
              showHints={false}
              lastMove={null}
              onMove={() => undefined}
            />
          </div>
        </div>
      )}
    </section>
  );
}
