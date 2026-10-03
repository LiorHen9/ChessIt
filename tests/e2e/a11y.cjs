// Accessibility checks that run inside the page, shared by the e2e tests (phase7.cjs).
//
// touchTargets(page): every visible button, link, input and role=button/radio/checkbox that is
//   smaller than 44×44 CSS pixels. A checkbox inside a <label> counts as its label. Elements can
//   opt out with data-a11y-skip (only for things that are not touch targets, e.g. a hidden file input).
// textContrast(page): every visible text run, its colour against the background it sits on
//   (walking up to the first non-transparent background, mixing in opacity), with the WCAG minimum
//   (4.5:1, or 3:1 for large text: 24px, or 18.66px bold). Disabled controls are reported apart:
//   WCAG does not require contrast for them, but they should still be readable (3:1 here).
// unlabelled(page): buttons and links with no text and no aria-label (icon buttons).

const TOUCH = () => {
  const out = [];
  const sel = 'button, a[href], input, select, textarea, [role=button], [role=radio], [role=checkbox], [role=tab], label.toggle';
  for (const el of document.querySelectorAll(sel)) {
    if (el.closest('[aria-hidden=true], [data-a11y-skip]')) continue;
    if (el.matches('input[type=checkbox], input[type=radio]') && el.closest('label')) continue;
    if (el.matches('input[type=file]')) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const st = getComputedStyle(el);
    if (st.visibility === 'hidden' || st.display === 'none') continue;
    // A link inside running text is exempt in WCAG 2.5.8 when it is part of a sentence; we still
    // want 44px, so inline links get padding (see family.css). Report everything.
    if (r.width < 43.5 || r.height < 43.5) {
      const label = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || '').trim().replace(/\s+/g, ' ');
      out.push(`${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).trim().split(/\s+/).join('.') : ''} "${label.slice(0, 30)}" ${Math.round(r.width)}×${Math.round(r.height)}`);
    }
  }
  return out;
};

const CONTRAST = () => {
  // Computed colours come as rgb()/rgba(), or as color(srgb r g b / a) for color-mix().
  const parse = (c) => {
    let m = c.match(/rgba?\(([^)]+)\)/);
    if (m) {
      const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
      return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    }
    m = c.match(/color\(srgb ([^)]+)\)/);
    if (m) {
      const p = m[1].split(/[ /]+/).filter(Boolean).map(Number);
      return { r: p[0] * 255, g: p[1] * 255, b: p[2] * 255, a: p.length > 3 ? p[3] : 1 };
    }
    return null;
  };
  const over = (top, bottom) => ({
    r: top.r * top.a + bottom.r * (1 - top.a),
    g: top.g * top.a + bottom.g * (1 - top.a),
    b: top.b * top.a + bottom.b * (1 - top.a),
    a: 1
  });
  const lum = (c) => {
    const f = (v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  // The background under an element: stack the backgrounds of its ancestors from the page up.
  const backdrop = (el) => {
    const chain = [];
    let imageBehind = false;
    for (let e = el; e; e = e.parentElement) {
      const st = getComputedStyle(e);
      const bg = parse(st.backgroundColor);
      if (st.backgroundImage !== 'none' && !st.backgroundImage.startsWith('linear-gradient')) imageBehind = true;
      if (bg && bg.a > 0) {
        chain.push(bg);
        if (bg.a >= 1) break;
      }
    }
    let c = { r: 255, g: 255, b: 255, a: 1 };
    const root = parse(getComputedStyle(document.body).backgroundColor);
    if (root && root.a > 0) c = over(root, c);
    for (let i = chain.length - 1; i >= 0; i--) c = over(chain[i], c);
    return { color: c, imageBehind };
  };
  const opacityOf = (el) => {
    let o = 1;
    for (let e = el; e; e = e.parentElement) o *= Number(getComputedStyle(e).opacity);
    return o;
  };
  const out = [];
  const seen = new Set();
  const walker = document.createTreeWalker(document.querySelector('main') || document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n.textContent.trim();
    // Emoji-only and symbol-only runs are pictures, not text.
    if (!text || !/[\p{L}\p{N}]/u.test(text)) continue;
    const el = n.parentElement;
    if (!el || seen.has(el)) continue;
    seen.add(el);
    if (el.closest('[aria-hidden=true], svg, .visually-hidden, [data-a11y-skip]')) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const st = getComputedStyle(el);
    if (st.visibility === 'hidden') continue;
    const fg = parse(st.color);
    if (!fg) continue;
    const { color: bg, imageBehind } = backdrop(el);
    const op = opacityOf(el);
    const shown = over({ ...fg, a: fg.a * op }, bg);
    const cr = ratio(shown, bg);
    const size = parseFloat(st.fontSize);
    const bold = Number(st.fontWeight) >= 700;
    const large = size >= 24 || (bold && size >= 18.66);
    const disabled = !!el.closest(':disabled, [aria-disabled=true]');
    const min = disabled ? 3 : large ? 3 : 4.5;
    if (cr < min) {
      out.push({
        text: text.slice(0, 28),
        cls: (el.className && String(el.className)) || el.tagName.toLowerCase(),
        ratio: Math.round(cr * 100) / 100,
        min,
        disabled,
        imageBehind
      });
    }
  }
  return out;
};

const UNLABELLED = () => {
  const out = [];
  for (const el of document.querySelectorAll('button, a[href], [role=button]')) {
    if (el.closest('[aria-hidden=true]')) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const name = (el.getAttribute('aria-label') || el.getAttribute('title') || '').trim();
    // Visible text (aria-hidden parts do not count).
    const text = [...el.childNodes]
      .map((c) => (c.nodeType === 3 ? c.textContent : c.getAttribute?.('aria-hidden') === 'true' ? '' : c.textContent))
      .join('')
      .trim();
    // An emoji is read by its name (🦁 "lion"), so it labels a button; symbols like ✎ or ⚙ are not.
    if (!name && !/[\p{L}\p{N}]|\p{Extended_Pictographic}\uFE0F?(?!\uFE0E)/u.test(text.replace(/[✎⚙]\uFE0F?/g, ''))) out.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ').join('.')} "${text}"`);
  }
  return out;
};

module.exports = {
  touchTargets: (page) => page.evaluate(TOUCH),
  textContrast: (page) => page.evaluate(CONTRAST),
  unlabelled: (page) => page.evaluate(UNLABELLED)
};
