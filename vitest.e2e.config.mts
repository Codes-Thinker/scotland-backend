import { defineConfig } from 'vitest/config';

// End-to-end tests run against a real PostgreSQL database. They never touch the dev database:
// DB_NAME is forced to fnt_test, which must exist and be empty or disposable.
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    env: {
      DB_NAME: 'fnt_test',
      AUTH_RATE_LIMIT_PER_MIN: '10000',
    },
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
