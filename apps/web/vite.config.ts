import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => ({
  plugins: [tailwindcss(), {
    name: 'cloudflare-content-policy',
    writeBundle() {
      const origin = loadEnv(mode, process.cwd(), 'VITE_').VITE_API_ORIGIN || 'http://localhost:3000';
      if (new URL(origin).origin !== origin) throw new Error('VITE_API_ORIGIN must be an origin without a trailing slash');
      writeFileSync(resolve(process.cwd(), 'dist/_headers'), `/*\n  Content-Security-Policy: default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' ${origin}\n  Referrer-Policy: strict-origin-when-cross-origin\n  X-Content-Type-Options: nosniff\n`);
    },
  }],
  server: { port: 5173, strictPort: true },
}));
