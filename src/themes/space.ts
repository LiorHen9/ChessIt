import type { Theme } from './types';
import { svgUrl } from './art';

// Faint stars behind the screens. Tiny inline SVG, tiled.
const stars = (color: string, opacity: number) =>
  svgUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" fill="${color}" opacity="${opacity}">` +
      '<circle cx="12" cy="18" r="1.6"/><circle cx="70" cy="9" r="1"/><circle cx="131" cy="31" r="1.8"/>' +
      '<circle cx="42" cy="66" r="1.1"/><circle cx="102" cy="82" r="1.5"/><circle cx="150" cy="104" r="1"/>' +
      '<circle cx="21" cy="121" r="1.3"/><circle cx="83" cy="143" r="1"/><circle cx="125" cy="150" r="1.7"/>' +
      '<path d="M60 112l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/></svg>'
  );

export const theme: Theme = {
  id: 'space',
  name: 'חלל',
  icon: '🚀',
  blurb: 'כוכבים, טילים ולוח כחול כמו הלילה',
  light: {
    bg: '#eceffd',
    surface: '#ffffff',
    'surface-2': '#e2e6fa',
    line: '#ccd2f0',
    ink: '#171a3b',
    'ink-soft': '#4a5079',
    brand: '#3f3cbb',
    'brand-ink': '#ffffff',
    'brand-soft': '#e0e1fb',
    accent: '#f08c00',
    'sq-light': '#d3daf6',
    'sq-dark': '#7b83d6',
    'coord-light': '#454da3',
    'coord-dark': '#f2f3ff',
    'pc-wf': '#fbfcff',
    'pc-wl': '#14163a',
    'pc-bf': '#1c1f4a',
    'pc-bl': '#0b0d24',
    'pc-bd': '#dfe3ff',
    'qr-ink': '#000000',
    'qr-paper': '#ffffff',
    'bg-art': stars('#3f3cbb', 0.22)
  },
  dark: {
    bg: '#0b1026',
    surface: '#151b3c',
    'surface-2': '#1e2550',
    line: '#2b3466',
    ink: '#eef0ff',
    'ink-soft': '#a8afd9',
    brand: '#a5adff',
    'brand-ink': '#0b1026',
    'brand-soft': '#252c63',
    'sq-light': '#b8c1ee',
    'sq-dark': '#5560b5',
    'coord-light': '#363e8c',
    'coord-dark': '#eef0ff',
    'pc-wf': '#fbfcff',
    'pc-wl': '#14163a',
    'pc-bf': '#1c1f4a',
    'pc-bl': '#0b0d24',
    'pc-bd': '#dfe3ff',
    'qr-ink': '#000000',
    'qr-paper': '#ffffff',
    'bg-art': stars('#ffffff', 0.55)
  },
  pieceSet: 'cburnett',
  celebrate: 'stars',
  sound: { wave: 'square', pitch: 1.2, glide: true },
  avatars: ['🚀', '👽', '🛸', '🪐', '🌙', '☄️', '🧑‍🚀', '🤖']
};
