import type { Theme } from './types';

// The default theme. Its values are also the :root defaults in src/styles.css, so applying it
// only removes the overrides. They are repeated here for the theme picker's preview.
export const CLEAN: Theme = {
  id: 'clean',
  name: 'נקי',
  icon: '✨',
  blurb: 'לוח עץ קלאסי, רגוע ופשוט',
  light: {
    bg: '#fbf6ec',
    surface: '#ffffff',
    'surface-2': '#f3ecdf',
    line: '#e4dccb',
    ink: '#1f2a22',
    'ink-soft': '#5b675e',
    brand: '#2f4f3a',
    'brand-ink': '#ffffff',
    'brand-soft': '#e3eee6',
    'sq-light': '#f0dcb4',
    'sq-dark': '#b5875a',
    'coord-light': '#8a6440',
    'coord-dark': '#ffffff',
    'pc-wf': '#ffffff',
    'pc-wl': '#000000',
    'pc-bf': '#000000',
    'pc-bl': '#000000',
    'pc-bd': '#ececec'
  },
  dark: {
    bg: '#151a16',
    surface: '#1f2621',
    'surface-2': '#29312b',
    line: '#36403a',
    ink: '#eef2ec',
    'ink-soft': '#a9b4ab',
    brand: '#9bc8a7',
    'brand-ink': '#10180f',
    'brand-soft': '#24362a',
    'sq-light': '#d6c19b',
    'sq-dark': '#8e6a45',
    'coord-light': '#7a5634',
    'coord-dark': '#f3e4c6',
    'pc-wf': '#ffffff',
    'pc-wl': '#000000',
    'pc-bf': '#000000',
    'pc-bl': '#000000',
    'pc-bd': '#ececec'
  },
  pieceSet: 'cburnett',
  celebrate: 'confetti',
  sound: { wave: 'sine', pitch: 1 },
  avatars: ['🦁', '🦉', '🐻', '🦊', '🐼', '🐯']
};
