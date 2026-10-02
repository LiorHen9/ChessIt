// A theme is plain data: CSS custom properties (light and dark), the piece set, how a win is
// celebrated, the sound style and suggested avatars. See "איך מוסיפים ערכה" in docs/ARCHITECTURE.md.

/** CSS custom properties without the leading "--", e.g. { bg: '#fff', 'sq-light': '#eee' }. */
export type ThemeVars = Record<string, string>;

export type Celebration = 'confetti' | 'stars' | 'leaves';

/** Sounds are synthesised (audio/sound.ts); a theme only colours them. */
export interface SoundStyle {
  /** Oscillator shape: 'sine' soft, 'triangle' wooden, 'square' retro / spacey. */
  wave: OscillatorType;
  /** Multiplies every pitch (1 = as written). */
  pitch: number;
  /** Notes slide up a little (sci-fi). */
  glide?: boolean;
}

export interface Theme {
  id: string;
  name: string;
  icon: string;
  /** One short line under the name in the picker. */
  blurb: string;
  /** Overrides of the variables in :root (src/styles.css). Unset variables keep the default. */
  light: ThemeVars;
  dark: ThemeVars;
  /** Id of the piece sprite (themes/pieceSprite.ts). Only 'cburnett' exists today; colours come from --pc-*. */
  pieceSet: 'cburnett';
  celebrate: Celebration;
  sound: SoundStyle;
  /** Shown first in the avatar picker. */
  avatars: string[];
}

/** Variables every theme must set, so the board, pieces and text stay readable. */
export const REQUIRED_VARS = [
  'bg',
  'surface',
  'surface-2',
  'line',
  'ink',
  'ink-soft',
  'brand',
  'brand-ink',
  'brand-soft',
  'sq-light',
  'sq-dark',
  'coord-light',
  'coord-dark',
  'pc-wf',
  'pc-wl',
  'pc-bf',
  'pc-bl',
  'pc-bd'
] as const;
