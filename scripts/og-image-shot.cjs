// Screenshot scripts/og-image.html (made by `bun scripts/og-image.ts`) into public/og-image.png.
// Needs Playwright: NODE_PATH=$(npm root -g) node scripts/og-image-shot.cjs
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await p.goto('file://' + path.join(__dirname, 'og-image.html'));
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(300);
  await p.screenshot({ path: path.join(__dirname, '..', 'public', 'og-image.png') });
  await b.close();
  console.log('wrote public/og-image.png');
})();
