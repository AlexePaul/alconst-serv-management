import { hashPassword, verifyPassword } from './password.js';
import { generateToken, hashToken } from './tokens.js';

describe('parole', () => {
  it('folosește Argon2id și verifică parola corectă', async () => {
    const hash = await hashPassword('o-parola-buna-123');
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(hash, 'o-parola-buna-123')).toBe(true);
    expect(await verifyPassword(hash, 'alta-parola')).toBe(false);
  });

  it('tratează un hash invalid ca parolă greșită', async () => {
    expect(await verifyPassword('nu-este-un-hash', 'orice')).toBe(false);
  });
});

describe('token-uri', () => {
  it('generează token-uri unice, cu hash determinist', () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(43);
    expect(hashToken(a)).toBe(hashToken(a));
    expect(hashToken(a)).not.toBe(hashToken(b));
  });
});
