// Theme and narration checks that need no browser: `bun tests/themes/check.ts`
// - every theme sets the required variables, in light and dark;
// - text contrast is at least 4.5:1 (WCAG AA), board squares are clearly different, coordinates
//   and pieces stand out from the squares;
// - text for the voice has no emoji or piece symbols, and squares are spelled out in Hebrew.
import { CLEAN } from '../../src/themes/clean';
import { theme as space } from '../../src/themes/space';
import { theme as forest } from '../../src/themes/forest';
import { REQUIRED_VARS, type Theme, type ThemeVars } from '../../src/themes/types';
import { cleanForSpeech } from '../../src/audio/speech';
import { parentQuestion } from '../../src/profiles/pin';

const themes: Theme[] = [CLEAN, space, forest];
let failures = 0;
const fail = (msg: string) => {
  failures++;
  console.log('✗', msg);
};

function lum(hex: string): number {
  const n = hex.replace('#', '');
  const c = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contrast(a: string, b: string): number {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

// [foreground, background, minimum, what]
const PAIRS: [string, string, number, string][] = [
  ['ink', 'bg', 4.5, 'text on the page'],
  ['ink', 'surface', 4.5, 'text on cards'],
  ['ink-soft', 'surface', 4.5, 'secondary text on cards'],
  ['ink-soft', 'bg', 4.5, 'secondary text on the page'],
  ['brand', 'surface', 4.5, 'brand text on cards'],
  ['brand', 'bg', 4.5, 'brand text on the page'],
  ['brand-ink', 'brand', 4.5, 'text on brand buttons'],
  ['ink', 'brand-soft', 4.5, 'text on selected options'],
  ['sq-light', 'sq-dark', 1.6, 'light vs dark squares'],
  ['coord-light', 'sq-light', 3, 'coordinates on light squares'],
  ['coord-dark', 'sq-dark', 3, 'coordinates on dark squares'],
  ['pc-wl', 'sq-dark', 3, 'white piece outline on dark squares'],
  ['pc-wl', 'sq-light', 3, 'white piece outline on light squares'],
  ['pc-bf', 'sq-dark', 2.4, 'black pieces on dark squares'],
  ['pc-bf', 'sq-light', 4.5, 'black pieces on light squares'],
  ['pc-wf', 'pc-bf', 7, 'white vs black pieces'],
  ['qr-ink', 'qr-paper', 15, 'QR code (cameras need dark on light)']
];

for (const t of themes) {
  for (const mode of ['light', 'dark'] as const) {
    // Unset variables fall back to the clean defaults of the same mode.
    const vars: ThemeVars = { ...CLEAN[mode], ...t[mode] };
    for (const v of REQUIRED_VARS) if (!t[mode][v]) fail(`${t.id}/${mode}: --${v} is not set`);
    const rows: string[] = [];
    for (const [fg, bg, min, what] of PAIRS) {
      const r = contrast(vars[fg], vars[bg]);
      rows.push(`${r.toFixed(1)}`);
      if (r < min) fail(`${t.id}/${mode}: ${what} (--${fg} on --${bg}) ${r.toFixed(2)} < ${min}`);
    }
    console.log(`${t.id.padEnd(7)} ${mode.padEnd(5)} ${rows.join(' ')}`);
  }
}

const SPEECH: [string, string][] = [
  ['⭐ יפה!', 'יפה!'],
  ['הצריח ♜︎ זז ל-e4 👆', 'הצריח זז ל-אִי 4'],
  ['יפה עכשיו h8', 'יפה עכשיו אֵייץ\' 8'],
  ['💡 {עקוב} אחרי החץ ←', '{עקוב} אחרי החץ'],
  ['מט ב-2 מסעים! 🏆', 'מט ב-2 מסעים!'],
  ['abc a1', 'abc אֵי 1']
];
for (const [input, want] of SPEECH) {
  const got = cleanForSpeech(input);
  if (got !== want) fail(`speech: "${input}" → "${got}", expected "${want}"`);
}

for (let i = 0; i < 50; i++) {
  const q = parentQuestion();
  const [a, b] = q.text.split('×').map((x) => Number(x.trim()));
  if (a * b !== q.answer || q.answer < 36) fail(`parent question ${q.text} = ${q.answer}`);
}

console.log(failures ? `${failures} problem(s)` : `themes OK (${themes.length} themes × light/dark), speech text OK, PIN question OK`);
process.exit(failures ? 1 : 0);
