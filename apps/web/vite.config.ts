import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => ({
  plugins: [VitePWA({
    registerType: 'autoUpdate',
    injectRegister: 'script',
    manifest: {
      name: 'CreditWithFriends', short_name: 'CreditWithFriends', description: 'Find the card. Ask a friend.',
      id: '/', start_url: '/', scope: '/', display: 'standalone',
      background_color: '#f6f3e9', theme_color: '#195f49',
      icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
    },
    workbox: { globPatterns: ['**/*.{html,js,css,svg}'], navigateFallback: '/index.html', runtimeCaching: [] },
  }), {
    name: 'cloudflare-content-policy',
    writeBundle() {
      const origin = loadEnv(mode, process.cwd(), 'VITE_').VITE_API_ORIGIN || 'http://localhost:3000';
      if (new URL(origin).origin !== origin) throw new Error('VITE_API_ORIGIN must be an origin without a trailing slash');
      writeFileSync(resolve(process.cwd(), 'dist/_headers'), `/*\n  Content-Security-Policy: default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' ${origin}\n  Referrer-Policy: strict-origin-when-cross-origin\n  X-Content-Type-Options: nosniff\n`);
    },
  }],
  server: { port: 5173, strictPort: true },
}));
