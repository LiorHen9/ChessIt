import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';

// Firebase Hosting serves the site at the root of the domain, as does the dev server.
// BASE_PATH is only for hosting under a sub-path (as on GitHub Pages, before the move).
const base = process.env.BASE_PATH ?? '/';
// Shown in the About screen (src/app/version.ts).
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __COMMIT__: JSON.stringify((process.env.GITHUB_SHA ?? '').slice(0, 7))
  },
  plugins: [
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        id: '.',
        name: 'ChessIt – לומדים שחמט ביחד',
        short_name: 'ChessIt',
        description: 'משחק ולימוד שחמט בעברית לכל המשפחה: מסלול מגיל 5, חידות, משחק נגד המחשב ומשחק בין שני טלפונים.',
        categories: ['education', 'games', 'kids'],
        lang: 'he',
        dir: 'rtl',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#fbf6ec',
        theme_color: '#2f4f3a',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        // Rooms talk to Firebase (another origin, REST + a live event stream). No route below
        // matches it, so the Service Worker never caches or answers those requests – they always go
        // to the network. Keep it that way: a cached room would be an old game.
        // The Hebrew font (fonts/rubik.woff2) is in the repo and precached like the code: no request
        // to Google, and it works offline from the first visit.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,json}'],
        // Stockfish (~1.8MB) is not part of the first load: it is cached the first time
        // someone plays level 3+ or opens a game summary (see runtimeCaching below).
        // The link-preview picture (og-image.png) is only for WhatsApp and friends, not for the app.
        globIgnores: ['engine/**', 'og-image.png'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('/engine/stockfish-'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'chessit-engine',
              // File names carry the Stockfish version, so an upgrade fetches new files.
              expiration: { maxEntries: 6 },
              cacheableResponse: { statuses: [200] }
            }
          }
        ]
      }
    })
  ]
});
