/**
 * Creează un cont de administrator (folosit la instalarea inițială, când nu există niciun utilizator).
 *
 *   pnpm admin:create --email admin@alconst-serv.ro --first-name Ion --last-name Popescu
 *
 * Parola se citește din variabila ADMIN_PASSWORD sau, în lipsa ei, se cere interactiv.
 */
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import { parseArgs } from 'node:util';
import { isEmail } from 'class-validator';
import { createPrismaClient } from '@alconst/database';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@alconst/shared';
import { hashPassword } from '../auth/password.js';
import { loadRootEnvFile } from '../config/app-config.js';

function fail(message: string): never {
  console.error(`Eroare: ${message}`);
  process.exit(1);
}

function promptHidden(question: string): Promise<string> {
  let muted = false;
  const output = new Writable({
    write(chunk, _encoding, callback) {
      if (!muted) process.stdout.write(chunk);
      callback();
    },
  });
  const rl = createInterface({ input: process.stdin, output, terminal: true });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
    muted = true;
  });
}

loadRootEnvFile();

const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    'first-name': { type: 'string' },
    'last-name': { type: 'string' },
  },
});

const email = values.email?.trim().toLowerCase();
const firstName = values['first-name']?.trim();
const lastName = values['last-name']?.trim();
if (!email || !firstName || !lastName) {
  fail('Folosire: admin:create --email <email> --first-name <prenume> --last-name <nume>');
}
if (!isEmail(email)) fail('Adresa de email nu este validă.');

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) fail('Variabila de mediu DATABASE_URL este obligatorie.');

const password = process.env.ADMIN_PASSWORD ?? (await promptHidden('Parola administratorului: '));
if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
  fail(
    `Parola trebuie să aibă între ${PASSWORD_MIN_LENGTH} și ${PASSWORD_MAX_LENGTH} de caractere.`,
  );
}

const db = createPrismaClient(databaseUrl);
try {
  if (await db.user.findUnique({ where: { email } })) {
    fail(`Există deja un utilizator cu adresa ${email}.`);
  }
  const user = await db.user.create({
    data: {
      email,
      firstName,
      lastName,
      role: 'ADMIN',
      passwordHash: await hashPassword(password),
      passwordChangedAt: new Date(),
    },
  });
  await db.activityLog.create({
    data: {
      action: 'user.created',
      entityType: 'user',
      entityId: user.id,
      entityLabel: `${firstName} ${lastName}`,
      metadata: { role: 'ADMIN', source: 'cli' },
    },
  });
  console.log(`Administratorul ${firstName} ${lastName} <${email}> a fost creat.`);
} finally {
  await db.$disconnect();
}
