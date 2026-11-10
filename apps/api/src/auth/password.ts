import { randomBytes } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';

// Parametrii recomandați de OWASP pentru Argon2id (m=19 MiB, t=2, p=1).
// `algorithm: 2` = Argon2id (enum-ul `Algorithm` al bibliotecii este `const enum` și nu poate fi
// importat cu `isolatedModules`).
const ARGON2_OPTIONS = {
  algorithm: 2,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    // Hash corupt sau într-un format necunoscut – tratat ca parolă greșită.
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

/**
 * Consumă același timp ca o verificare reală atunci când contul nu există,
 * pentru a nu dezvălui prin timpul de răspuns ce adrese de email sunt înregistrate.
 */
export async function verifyAgainstDummy(password: string): Promise<void> {
  dummyHash ??= hashPassword(randomBytes(16).toString('hex'));
  await verifyPassword(await dummyHash, password);
}
