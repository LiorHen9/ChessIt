import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages serves the site under /<repo-name>/.
// The deploy workflow sets BASE_PATH; locally the app runs at /.
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  plugins: [
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'ChessIt',
        short_name: 'ChessIt',
        description: 'לומדים שחמט ביחד – לילדים ולמבוגרים',
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
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,json}'],
        // Stockfish (~1.8MB) is not part of the first load: it is cached the first time
        // someone plays level 3+ or opens a game summary (see runtimeCaching below).
        globIgnores: ['engine/**'],
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
          },
          {
            // Hebrew font from Google Fonts: cached on first load, then works offline.
            urlPattern: ({ url }) =>
              url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] }
            }
          }
        ]
      }
    })
  ]
});
