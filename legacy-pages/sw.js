// Replaces the old app's Service Worker at an old address (https://liorhen9.github.io/ChessIt/ or
// https://chessit-6d389.web.app/).
//
// Phones that installed the app there keep running a Workbox Service Worker that serves the
// cached old app, even offline. Browsers check this file for updates when the app is opened, so
// this new version takes over: it deletes the old app's caches, removes itself, and reloads open
// windows – which then get the notice page (index.html) straight from the network.
// It never touches IndexedDB, so the family's data stays here until it is backed up.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n)));
      await self.registration.unregister();
      // Reload only when the old app was here (it had caches) – otherwise there is nothing to
      // replace, and reloading would only flash the page.
      if (names.length > 0) {
        const windows = await self.clients.matchAll({ type: 'window' });
        for (const w of windows) {
          try {
            await w.navigate(w.url);
          } catch {
            // A window that cannot be navigated reloads by itself the next time it is opened.
          }
        }
      }
    })()
  );
});
