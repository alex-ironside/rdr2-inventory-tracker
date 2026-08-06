import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';

// Base path. Defaults to '/' (custom domain / Firebase Hosting). For GitHub
// Pages project sites the deploy workflow sets BASE_PATH=/<repo>/ so asset URLs
// and the PWA scope resolve correctly under the sub-path.
const base = process.env.BASE_PATH ?? '/';

// Static SPA build → deployed to GitHub Pages (primary) or Firebase Hosting.
// The PWA plugin generates a service worker (offline app shell) + web manifest.
export default defineConfig(({ mode }) => ({
  base,
  // The emulator e2e build (`--mode emulator`) loads its Firebase config from an
  // isolated dir so a developer's real `.env.local` can't override it — keeping
  // local and CI runs identical (both talk only to the local emulators).
  envDir: mode === 'emulator' ? './e2e/emulator-env' : undefined,
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'RDR2 Crafting Tracker',
        short_name: 'RDR2 Tracker',
        description:
          'Track pelts, feathers and crafting materials across Red Dead Redemption 2 playthroughs.',
        theme_color: '#1a1512',
        background_color: '#17110c',
        display: 'standalone',
        orientation: 'portrait',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        navigateFallback: `${base}index.html`
      }
    })
  ],
  build: {
    outDir: 'dist',
    sourcemap: true
  }
}));
