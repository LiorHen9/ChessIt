// Draws public/og-image.png: the picture a shared link shows in WhatsApp, Telegram, Facebook…
// (1200×630, the size those apps expect; index.html points og:image at it).
//
//   bun scripts/og-image.ts            → writes og-image.html next to this script, then
//   node scripts/og-image-shot.cjs      → screenshots it into public/og-image.png (needs Playwright)
//
// The board uses the same piece drawings as the app (cburnett), the same colours as the clean
// theme and the same font (public/fonts/rubik.woff2).
import { writeFileSync } from 'node:fs';
import { CBURNETT } from '../src/themes/pieceSprite';
import { CLEAN } from '../src/themes/clean';

// After 1.e4 e5 2.Nf3 Nc6 3.Bc4 – a real opening, pieces out, nothing captured.
const FEN = 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R';
const S = 60;
let squares = '';
let pieces = '';
FEN.split('/').forEach((row, r) => {
  let f = 0;
  for (const ch of row) {
    if (/\d/.test(ch)) {
      f += Number(ch);
      continue;
    }
    const color = ch === ch.toUpperCase() ? 'w' : 'b';
    pieces += `<use href="#pc-${color}${ch.toUpperCase()}" x="${f * S + 3}" y="${r * S + 3}" width="${S - 6}" height="${S - 6}"/>`;
    f++;
  }
});
for (let r = 0; r < 8; r++)
  for (let f = 0; f < 8; f++) squares += `<rect x="${f * S}" y="${r * S}" width="${S}" height="${S}" fill="${(r + f) % 2 === 0 ? CLEAN.light['sq-light'] : CLEAN.light['sq-dark']}"/>`;

const vars = Object.entries(CLEAN.light)
  .map(([k, v]) => `--${k}:${v};`)
  .join('');
const html = `<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8">
<style>
@font-face { font-family: Rubik; src: url('../public/fonts/rubik.woff2') format('woff2'); font-weight: 400 800; }
:root { ${vars} }
* { margin: 0; box-sizing: border-box; }
body { width: 1200px; height: 630px; overflow: hidden; background: #2f4f3a; font-family: Rubik, sans-serif; color: #fbf6ec; }
.wrap { display: flex; align-items: center; gap: 64px; height: 100%; padding: 0 72px; }
.board { flex: none; width: 480px; height: 480px; border-radius: 18px; overflow: hidden; box-shadow: 0 24px 60px rgba(0,0,0,.35); }
.text { flex: 1; display: flex; flex-direction: column; gap: 18px; }
.logo { display: flex; align-items: center; gap: 18px; font-size: 92px; font-weight: 800; letter-spacing: -1px; direction: ltr; justify-content: flex-end; }
.logo svg { width: 96px; height: 96px; }
h1 { font-size: 58px; font-weight: 800; line-height: 1.1; }
p { font-size: 30px; line-height: 1.4; color: #dfe9e2; }
.chips { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 8px; }
.chip { padding: 8px 18px; border-radius: 999px; background: rgba(255,255,255,.14); font-size: 24px; font-weight: 600; }
</style></head><body>
<svg width="0" height="0" style="position:absolute">${CBURNETT}</svg>
<div class="wrap">
  <div class="text">
    <div class="logo">ChessIt
      <svg viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="#fbf6ec"/><g fill="#2f4f3a"><circle cx="256" cy="168" r="62"/><rect x="196" y="222" width="120" height="30" rx="15"/><path d="M214 252h84l26 132H188z"/><rect x="150" y="372" width="212" height="46" rx="23"/></g><circle cx="370" cy="134" r="26" fill="#e0a526"/></svg>
    </div>
    <h1>לומדים שחמט ביחד</h1>
    <p>מסלול לימוד מהצעד הראשון ועד משחק שלם, חידות, משחק נגד המחשב ובין שני טלפונים.</p>
    <div class="chips"><span class="chip">בעברית</span><span class="chip">מגיל 5</span><span class="chip">בלי פרסומות</span><span class="chip">בלי הרשמה</span></div>
  </div>
  <svg class="board" viewBox="0 0 480 480">${squares}${pieces}</svg>
</div>
</body></html>`;

writeFileSync(new URL('./og-image.html', import.meta.url), html);
console.log('wrote scripts/og-image.html');
