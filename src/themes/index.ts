// Theme registry and switching. Only the default theme (clean) is in the main bundle; every other
// theme is its own small chunk, loaded when a profile that uses it becomes active (or when the
// picker shows previews). Switching = new CSS variables on <html>, no reload.
import { useEffect, useState } from 'preact/hooks';
import type { AgeGroup, Gender } from '../profiles/profiles';
import { CLEAN } from './clean';
import type { Theme, ThemeVars } from './types';

export type { Theme } from './types';
export { CLEAN } from './clean';

/** Shown in the picker before the theme itself is loaded. Order = picker order. */
export const THEME_LIST: { id: string; name: string; icon: string }[] = [
  { id: 'clean', name: CLEAN.name, icon: CLEAN.icon },
  { id: 'space', name: 'חלל', icon: '🚀' },
  { id: 'forest', name: 'יער קסום', icon: '🌳' }
];

const LOADERS: Record<string, () => Promise<{ theme: Theme }>> = {
  space: () => import('./space'),
  forest: () => import('./forest')
};

const cache = new Map<string, Theme>([[CLEAN.id, CLEAN]]);

/** Load a theme; unknown ids and failed downloads (offline before caching) fall back to clean. */
export async function loadTheme(id: string): Promise<Theme> {
  const hit = cache.get(id);
  if (hit) return hit;
  const load = LOADERS[id];
  if (!load) return CLEAN;
  try {
    const { theme } = await load();
    cache.set(id, theme);
    return theme;
  } catch (e) {
    console.warn('[theme] failed to load', id, e);
    return CLEAN;
  }
}

export function loadAllThemes(): Promise<Theme[]> {
  return Promise.all(THEME_LIST.map((t) => loadTheme(t.id)));
}

/**
 * The first suggestion when creating a profile: a calm theme for teens and adults, and for
 * children a playful one. Only a suggestion – every theme is open to everyone.
 */
export function suggestTheme(age: AgeGroup | null, gender: Gender | undefined): string {
  if (age === null || age === 'teenAdult') return 'clean';
  return gender === 'girl' ? 'forest' : 'space';
}

function declarations(vars: ThemeVars): string {
  return Object.entries(vars)
    .map(([k, v]) => `--${k}:${v};`)
    .join('');
}

/** The variables as an inline style, for previews scoped to one element. */
export function themeStyle(t: Theme, dark: boolean): string {
  return declarations(dark ? t.dark : t.light);
}

export function themeCss(t: Theme): string {
  const sel = `:root[data-theme="${t.id}"]`;
  return `${sel}{${declarations(t.light)}}@media (prefers-color-scheme: dark){${sel}{${declarations(t.dark)}}}`;
}

export function prefersDark(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
}

let current: Theme = CLEAN;
let token = 0;
const listeners = new Set<() => void>();

export function currentTheme(): Theme {
  return current;
}

/** Apply a theme to the whole app. The last call wins if several are loading. */
export async function applyTheme(id: string): Promise<void> {
  const mine = ++token;
  const t = await loadTheme(id);
  if (mine !== token) return;
  const root = document.documentElement;
  let style = document.getElementById('theme-vars');
  if (t.id === CLEAN.id) {
    delete root.dataset.theme;
    style?.remove();
  } else {
    if (!style) {
      style = document.createElement('style');
      style.id = 'theme-vars';
      document.head.append(style);
    }
    style.textContent = themeCss(t);
    root.dataset.theme = t.id;
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute('content', prefersDark() ? t.dark.bg : t.light.brand);
  current = t;
  listeners.forEach((f) => f());
}

/** The active theme; re-renders when it changes. */
export function useTheme(): Theme {
  const [t, setT] = useState(current);
  useEffect(() => {
    const f = () => setT(current);
    listeners.add(f);
    f();
    return () => void listeners.delete(f);
  }, []);
  return t;
}
