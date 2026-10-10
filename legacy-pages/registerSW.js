// The old app's pages load this file. It now only asks for the new sw.js, which clears the old app.
// __BASE__ (where the old app lived) is filled in by scripts/legacy-site.sh.
if ('serviceWorker' in navigator) navigator.serviceWorker.register('__BASE__sw.js', { scope: '__BASE__' }).catch(() => {});
