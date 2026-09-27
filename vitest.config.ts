import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'api-unit',
          include: ['apps/api/src/**/*.spec.ts'],
          environment: 'node',
        },
      },
      {
        extends: true,
        test: {
          name: 'api-integration',
          include: ['apps/api/test/**/*.spec.ts'],
          environment: 'node',
          testTimeout: 30_000,
        },
      },
    ],
  },
});
