import { createHash, randomBytes } from 'node:crypto';

/** Token aleatoriu (256 biți), trimis clientului. În baza de date se stochează doar hash-ul. */
export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Token-urile au entropie mare, deci un SHA-256 simplu este suficient
 * (spre deosebire de parole, care necesită Argon2).
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
