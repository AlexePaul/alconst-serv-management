import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    globalSetup: ['./test/global-setup.ts'],
    setupFiles: ['./test/setup-env.ts'],
    // Testele e2e folosesc aceeași bază de date de test, deci rulează secvențial.
    fileParallelism: false,
    hookTimeout: 30_000,
  },
});
