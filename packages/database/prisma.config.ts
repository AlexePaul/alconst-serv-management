import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'prisma/config';

// Prisma 7 nu mai încarcă automat fișierele .env. În dezvoltare folosim .env din rădăcina
// monorepo-ului; în producție variabilele vin direct din mediul containerului.
// Pe server, `ENV_FILE` indică fișierul de mediu al instalării (ex. /etc/alconst/stage.env).
const rootEnv = process.env.ENV_FILE ?? resolve(import.meta.dirname, '../../.env');
if (existsSync(rootEnv)) {
  process.loadEnvFile(rootEnv);
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // `prisma generate` nu are nevoie de conexiune, deci nu forțăm existența variabilei aici.
    url: process.env.DATABASE_URL ?? '',
  },
});
