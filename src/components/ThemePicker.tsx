// Theme cards with a small preview (board squares and pieces in the theme's colours).
// Each card scopes the theme's variables to itself, so it looks like the theme whatever is active.
import { useEffect, useState } from 'preact/hooks';
import type { Color, PieceSymbol } from 'chess.js';
import { loadAllThemes, prefersDark, THEME_LIST, themeStyle, type Theme } from '../themes/index';
import { PieceUse } from './Piece';

interface Props {
  value: string;
  onChange: (id: string) => void;
  /** Marked "מומלץ" (the suggestion for the profile's age). */
  suggested?: string;
}

const PREVIEW: { sq: number; color: Color; type: PieceSymbol }[] = [
  { sq: 1, color: 'b', type: 'k' },
  { sq: 2, color: 'b', type: 'p' },
  { sq: 5, color: 'w', type: 'n' },
  { sq: 6, color: 'w', type: 'q' }
];

function MiniBoard() {
  const cells = [];
  for (let i = 0; i < 8; i++) {
    const col = i % 4;
    const row = Math.floor(i / 4);
    cells.push(<rect key={i} x={col * 50} y={row * 50} width={50} height={50} class={(col + row) % 2 === 0 ? 'sq-light' : 'sq-dark'} />);
  }
  return (
    <svg class="theme-mini" viewBox="0 0 200 100" aria-hidden="true">
      {cells}
      {PREVIEW.map((p) => (
        <PieceUse key={p.sq} color={p.color} type={p.type} x={(p.sq % 4) * 50 + 3} y={Math.floor(p.sq / 4) * 50 + 3} size={44} />
      ))}
    </svg>
  );
}

export function ThemePicker({ value, onChange, suggested }: Props) {
  const [themes, setThemes] = useState<Theme[] | null>(null);
  useEffect(() => {
    void loadAllThemes().then(setThemes);
  }, []);
  const dark = prefersDark();
  return (
    <div class="theme-grid" role="radiogroup" aria-label="ערכת נושא">
      {THEME_LIST.map((meta) => {
        const t = themes?.find((x) => x.id === meta.id);
        const on = value === meta.id;
        return (
          <button
            type="button"
            key={meta.id}
            role="radio"
            aria-checked={on}
            data-theme-id={meta.id}
            class={`theme-card ${on ? 'is-on' : ''}`}
            style={t ? themeStyle(t, dark) : undefined}
            onClick={() => onChange(meta.id)}
          >
            {t ? <MiniBoard /> : <span class="theme-mini theme-mini-empty" />}
            <span class="theme-name">
              <span aria-hidden="true">{meta.icon}</span> {meta.name}
            </span>
            {suggested === meta.id && <span class="theme-badge">מומלץ</span>}
          </button>
        );
      })}
    </div>
  );
}
