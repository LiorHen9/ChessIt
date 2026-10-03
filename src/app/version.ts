// Version and build time, written into the code at build time (vite.config.ts `define`).
// Shown in the About screen and in a problem report.
declare const __APP_VERSION__: string;
declare const __BUILD_TIME__: string;
declare const __COMMIT__: string;

export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
/** ISO time of the build ('' when running without a build). */
export const BUILD_TIME: string = typeof __BUILD_TIME__ === 'string' ? __BUILD_TIME__ : '';
/** Short git commit of the build ('' locally). */
export const COMMIT: string = typeof __COMMIT__ === 'string' ? __COMMIT__ : '';

/** "0.9.0 · 3.10.2026" (the build date in Israel's calendar order). */
export function versionLabel(): string {
  if (!BUILD_TIME) return APP_VERSION;
  const d = new Date(BUILD_TIME);
  return `${APP_VERSION} · ${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
}
