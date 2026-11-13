/**
 * Creează primul administrator, dacă baza de date nu are încă niciun utilizator și sunt setate
 * SEED_ADMIN_EMAIL și SEED_ADMIN_PASSWORD. Rulat la fiecare deploy, după migrări.
 *
 *   node --env-file=/etc/alconst/stage.env dist/cli/seed-admin.js
 */
import { createPrismaClient } from '@alconst/database';
import { loadRootEnvFile } from '../config/app-config.js';
import { seedFirstAdmin } from '../users/first-admin.js';

loadRootEnvFile();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('Eroare: variabila de mediu DATABASE_URL este obligatorie.');
  process.exit(1);
}

const db = createPrismaClient(databaseUrl);
try {
  const result = await seedFirstAdmin(db, process.env);
  if (result.status === 'created') {
    console.log(`Primul administrator <${result.email}> a fost creat, cu parolă temporară.`);
  } else if (result.reason === 'users-exist') {
    console.log('Există deja utilizatori; primul administrator nu mai este creat.');
  } else {
    console.log('SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD nu sunt setate; niciun cont creat.');
  }
} catch (error) {
  console.error(`Eroare: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
