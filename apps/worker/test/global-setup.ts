import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://alconst:alconst@127.0.0.1:5432/alconst_test';

/** Aplică migrările pe baza de date de test înainte de rularea suitei. */
export default function setup(): void {
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: resolve(import.meta.dirname, '../../../packages/database'),
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL, CHECKPOINT_DISABLE: '1' },
    stdio: 'pipe',
  });
}
