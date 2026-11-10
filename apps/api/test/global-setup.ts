import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { TEST_ENV } from './test-env.js';

/** Aplică migrările pe baza de date de test înainte de rularea suitei e2e. */
export default function setup(): void {
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: resolve(import.meta.dirname, '../../../packages/database'),
    env: { ...process.env, ...TEST_ENV },
    stdio: 'pipe',
  });
}
