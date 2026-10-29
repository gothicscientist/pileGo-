import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// @imgly/background-removal loads its onnxruntime wasm and model from its own
// CDN (see its publicPath), so the 24 MB copy Vite would emit is never used.
function dropUnusedOrtWasm(): Plugin {
  return {
    name: 'pilego-drop-ort-wasm',
    apply: 'build',
    generateBundle(_options, bundle) {
      for (const name of Object.keys(bundle)) {
        if (/ort-wasm.*\.wasm$/.test(name)) delete bundle[name];
      }
    },
  };
}

// The extension's zips are built next to the app and served from /downloads;
// the install page compares this version with the one that is installed.
const extensionVersion = (
  JSON.parse(readFileSync(new URL('../extension/package.json', import.meta.url), 'utf8')) as { version: string }
).version;

export default defineConfig({
  define: { __EXTENSION_VERSION__: JSON.stringify(extensionVersion) },
  resolve: {
    alias: { '~': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  plugins: [
    react(),
    tailwindcss(),
    dropUnusedOrtWasm(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'pileGo',
        short_name: 'pileGo',
        description: 'Scan, list and cross-list your secondhand clothes.',
        theme_color: '#2B3FE8',
        background_color: '#F6F6F1',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        // The extension zips are files, not app pages.
        navigateFallbackDenylist: [/^\/downloads\//],
        globPatterns: ['**/*.{js,css,html,svg,woff2,png}'],
        globIgnores: ['**/ort*.js', '**/ort*.mjs'],
        // The background-removal model is large; it is cached by the library itself.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [],
      },
    }),
  ],
  optimizeDeps: { exclude: ['@imgly/background-removal'] },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/[\\/](react|react-dom|scheduler|react-router)[\\/]/.test(id)) return 'react';
          if (id.includes('@supabase')) return 'supabase';
          if (/[\\/](motion|motion-dom|motion-utils|framer-motion)[\\/]/.test(id)) return 'motion';
          return undefined;
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
