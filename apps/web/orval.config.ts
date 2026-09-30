import { defineConfig } from 'orval';

export default defineConfig({
  api: {
    input: '../api/openapi.json',
    output: {
      target: './src/api/generated.ts',
      client: 'fetch',
      override: { mutator: { path: './src/api/fetcher.ts', name: 'apiFetch' } },
    },
  },
});
