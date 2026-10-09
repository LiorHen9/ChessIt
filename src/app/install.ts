// Where the app is running: the installed app (from the home screen) or a browser tab.
//
// On iPhone and iPad, an app added to the home screen gets its own storage, separate from
// Safari's – even at the same address. Profiles made in Safari never show up in the home-screen
// app, and the other way round. So on iOS, in the browser, the app says so before anything is
// saved there (BrowserNotice) and keeps a reminder line on the family screens (BrowserBanner).
// On Android, Chrome and the installed app share their storage, so there is nothing to warn about.

/** Running as the installed app (opened from the home screen icon). */
export function isStandalone(): boolean {
  try {
    return matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
  } catch {
    return false;
  }
}

/** iPhone / iPad (iPadOS reports itself as a Mac, but with touch). Any browser there uses WebKit. */
export function isIos(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/** For tests: ?browser-notice=1 on localhost acts as an iPhone browser tab (read once, at load,
 * because the address is tidied after a room link). */
const FORCED = (() => {
  try {
    return (location.hostname === 'localhost' || location.hostname === '127.0.0.1') && new URLSearchParams(location.search).get('browser-notice') === '1';
  } catch {
    return false;
  }
})();

/** In an iOS browser tab, where saved data stays apart from the home-screen app. */
export function inIosBrowser(): boolean {
  return FORCED || (isIos() && !isStandalone());
}

const KEY = 'chessit:browser-ok';

/** The parent chose "continue in the browser" in this tab (asked again in a new session). */
export function browserAccepted(): boolean {
  try {
    return sessionStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function acceptBrowser(): void {
  try {
    sessionStorage.setItem(KEY, '1');
  } catch {
    // Without sessionStorage the notice comes back on the next load – acceptable.
  }
}
