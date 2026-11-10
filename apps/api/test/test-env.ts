/**
 * Mediul folosit de testele e2e. Baza de date de test este separată de cea de dezvoltare
 * și este golită înaintea fiecărui test.
 */
export const TEST_ENV = {
  NODE_ENV: 'test',
  APP_URL: 'http://localhost:3000',
  DATABASE_URL:
    process.env.TEST_DATABASE_URL ?? 'postgresql://alconst:alconst@127.0.0.1:5432/alconst_test',
  REDIS_URL: process.env.TEST_REDIS_URL ?? 'redis://127.0.0.1:6379/1',
} as const;
