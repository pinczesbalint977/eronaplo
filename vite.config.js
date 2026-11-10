import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { resolveBasePath } from './scripts/base-path.mjs';

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  const base = resolveBasePath(env);

  return {
    base,
    plugins: [
      react(),
      VitePWA({
        registerType: 'prompt',
        injectRegister: null,
        includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png'],
        manifest: {
          id: base,
          name: 'Erőnapló – a saját ritmusodban',
          short_name: 'Erőnapló',
          description: 'Személyes edzéstervek, edzésnapló és fejlődés. Minden ismétlés számít.',
          lang: 'hu',
          start_url: base,
          scope: base,
          display: 'standalone',
          orientation: 'any',
          theme_color: '#111412',
          background_color: '#111412',
          categories: ['health', 'fitness', 'lifestyle'],
          icons: [
            { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,webmanifest}'],
          navigateFallback: `${base}index.html`,
          cleanupOutdatedCaches: true,
          // Only the build's public assets are precached. Auth and Firestore requests
          // use the network directly and must never enter a service-worker cache.
          runtimeCaching: [],
          skipWaiting: false,
          clientsClaim: true,
          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        },
        devOptions: { enabled: false },
      }),
    ],
    build: {
      sourcemap: false,
      target: 'es2022',
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              { name: 'firebase-firestore', test: /node_modules[\\/]@firebase[\\/]firestore/, priority: 40 },
              { name: 'firebase-auth', test: /node_modules[\\/]@firebase[\\/]auth/, priority: 30 },
              { name: 'firebase-core', test: /node_modules[\\/](?:@firebase|firebase)[\\/]/, priority: 20 },
              { name: 'react', test: /node_modules[\\/](?:react|react-dom|react-router|react-router-dom|scheduler)[\\/]/, priority: 10 },
            ],
          },
        },
      },
    },
    server: {
      host: '127.0.0.1',
      proxy: env.VITE_USE_EMULATORS === 'true' ? {
        '/v1/projects': { target: 'http://127.0.0.1:8080', changeOrigin: true },
        '/google.firestore.v1.Firestore': { target: 'http://127.0.0.1:8080', changeOrigin: true },
      } : undefined,
    },
    preview: { host: '127.0.0.1' },
  };
});
