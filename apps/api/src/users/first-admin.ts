import { isEmail } from 'class-validator';
import type { PrismaClient } from '@alconst/database';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@alconst/shared';
import { hashPassword } from '../auth/password.js';

export type FirstAdminResult =
  | { status: 'created'; email: string }
  | { status: 'skipped'; reason: 'users-exist' | 'not-configured' };

/**
 * Creează primul administrator al unei instalări noi, din variabilele de mediu
 * `SEED_ADMIN_EMAIL` și `SEED_ADMIN_PASSWORD` (opțional `SEED_ADMIN_FIRST_NAME`,
 * `SEED_ADMIN_LAST_NAME`). El îi adaugă apoi pe ceilalți din pagina „Utilizatori”.
 *
 *  - rulează la fiecare deploy, dar acționează o singură dată: dacă există deja orice utilizator,
 *    nu face nimic – deci nu poate recrea un cont șters și nu poate reseta o parolă;
 *  - parola din mediu este temporară: la prima autentificare trebuie schimbată;
 *  - fără cele două variabile nu face nimic; cu valori greșite se oprește cu eroare.
 */
export async function seedFirstAdmin(
  db: PrismaClient,
  env: Record<string, string | undefined>,
): Promise<FirstAdminResult> {
  if ((await db.user.count()) > 0) return { status: 'skipped', reason: 'users-exist' };

  const email = env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = env.SEED_ADMIN_PASSWORD;
  if (!email || !password) return { status: 'skipped', reason: 'not-configured' };
  if (!isEmail(email)) throw new Error('SEED_ADMIN_EMAIL nu este o adresă de email validă.');
  if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
    throw new Error(
      `SEED_ADMIN_PASSWORD trebuie să aibă între ${PASSWORD_MIN_LENGTH} și ${PASSWORD_MAX_LENGTH} de caractere.`,
    );
  }
  const firstName = env.SEED_ADMIN_FIRST_NAME?.trim() || 'Administrator';
  const lastName = env.SEED_ADMIN_LAST_NAME?.trim() || 'Alconst';

  const user = await db.user.create({
    data: {
      email,
      firstName,
      lastName,
      role: 'ADMIN',
      passwordHash: await hashPassword(password),
      passwordChangedAt: new Date(),
      mustChangePassword: true,
    },
  });
  await db.activityLog.create({
    data: {
      action: 'user.created',
      entityType: 'user',
      entityId: user.id,
      entityLabel: `${firstName} ${lastName}`,
      metadata: { role: 'ADMIN', source: 'seed' },
    },
  });
  return { status: 'created', email };
}
