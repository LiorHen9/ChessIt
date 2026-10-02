import type { Theme } from './types';
import { svgUrl } from './art';

// A few faint leaves behind the screens. Tiny inline SVG, tiled.
const leaves = (color: string, opacity: number) =>
  svgUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" fill="${color}" opacity="${opacity}">` +
      '<path d="M20 40c10-18 30-20 34-18-2 14-16 30-34 18z"/>' +
      '<path d="M120 22c14 4 22 20 20 28-12 0-26-10-20-28z"/>' +
      '<path d="M70 120c8-16 26-20 32-16-2 12-14 26-32 16z"/>' +
      '<path d="M150 140c6 12 2 26-4 30-8-8-8-22 4-30z"/>' +
      '<circle cx="40" cy="150" r="3"/><circle cx="104" cy="70" r="2.4"/></svg>'
  );

export const theme: Theme = {
  id: 'forest',
  name: 'יער קסום',
  icon: '🌳',
  blurb: 'עלים, טחב וכלים מעץ',
  light: {
    bg: '#eef5e6',
    surface: '#fffdf6',
    'surface-2': '#e4eed8',
    line: '#cfdcbf',
    ink: '#1c2a18',
    'ink-soft': '#4d5e46',
    brand: '#2d6a33',
    'brand-ink': '#ffffff',
    'brand-soft': '#d8ead3',
    accent: '#d9822b',
    'sq-light': '#eee3c1',
    'sq-dark': '#789852',
    'coord-light': '#55733a',
    'coord-dark': '#ffffff',
    'pc-wf': '#fffaf0',
    'pc-wl': '#2a1d10',
    'pc-bf': '#3a2715',
    'pc-bl': '#1c1209',
    'pc-bd': '#f3e6cc',
    'qr-ink': '#000000',
    'qr-paper': '#ffffff',
    'bg-art': leaves('#2d6a33', 0.12)
  },
  dark: {
    bg: '#0e1810',
    surface: '#172519',
    'surface-2': '#203223',
    line: '#2d4431',
    ink: '#ecf4e5',
    'ink-soft': '#a5b89e',
    brand: '#93d39d',
    'brand-ink': '#0e1810',
    'brand-soft': '#213a26',
    'sq-light': '#d9cfa5',
    'sq-dark': '#62804a',
    'coord-light': '#4b6633',
    'coord-dark': '#f4eed6',
    'pc-wf': '#fffaf0',
    'pc-wl': '#2a1d10',
    'pc-bf': '#3a2715',
    'pc-bl': '#1c1209',
    'pc-bd': '#f3e6cc',
    'qr-ink': '#000000',
    'qr-paper': '#ffffff',
    'bg-art': leaves('#93d39d', 0.1)
  },
  pieceSet: 'cburnett',
  celebrate: 'leaves',
  sound: { wave: 'triangle', pitch: 0.85 },
  avatars: ['🦊', '🦉', '🍄', '🦋', '🐿️', '🦔', '🐞', '🌻']
};
