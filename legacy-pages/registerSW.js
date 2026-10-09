// The old app's pages load this file. It now only asks for the new sw.js, which clears the old app.
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/ChessIt/sw.js', { scope: '/ChessIt/' }).catch(() => {});
