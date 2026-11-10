import { createTestApp, ORIGIN, PASSWORD, type TestApp, waitFor } from './test-app.js';

describe('Autentificare (e2e)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  beforeEach(() => t.reset());
  afterAll(() => t.close());

  describe('POST /api/auth/login', () => {
    it('autentifică utilizatorul și setează un cookie httpOnly, SameSite=Strict', async () => {
      await t.createUser();
      const response = await t
        .http()
        .post('/api/auth/login')
        .set('Origin', ORIGIN)
        .send({ email: '  Admin@Test.RO ', password: PASSWORD })
        .expect(200);

      expect(response.body).toMatchObject({ email: 'admin@test.ro', role: 'ADMIN' });
      expect(response.body).not.toHaveProperty('passwordHash');
      const cookie = response.get('Set-Cookie')?.[0] ?? '';
      expect(cookie).toContain('alconst_session=');
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Strict');
    });

    it('stochează în baza de date doar hash-ul token-ului de sesiune', async () => {
      await t.createUser();
      const cookie = await t.login('admin@test.ro');
      const token = cookie.split('=')[1];
      const sessions = await t.prisma.db.session.findMany();
      expect(sessions).toHaveLength(1);
      expect(sessions[0]?.tokenHash).not.toBe(token);
    });

    it.each([
      ['parolă greșită', 'admin@test.ro', 'parola-gresita-123'],
      ['email necunoscut', 'altcineva@test.ro', PASSWORD],
    ])('respinge cu același mesaj: %s', async (_label, email, password) => {
      await t.createUser();
      const response = await t
        .http()
        .post('/api/auth/login')
        .set('Origin', ORIGIN)
        .send({ email, password })
        .expect(401);
      expect(response.body).toMatchObject({
        code: 'INVALID_CREDENTIALS',
        message: 'Email sau parolă incorectă.',
      });
      expect(response.get('Set-Cookie')).toBeUndefined();
    });

    it('respinge conturile dezactivate și înregistrează încercarea în jurnal', async () => {
      await t.createUser({ isActive: false });
      await t
        .http()
        .post('/api/auth/login')
        .set('Origin', ORIGIN)
        .send({ email: 'admin@test.ro', password: PASSWORD })
        .expect(401);
      const log = await t.prisma.db.activityLog.findFirst({
        where: { action: 'auth.login_failed' },
      });
      expect(log?.metadata).toMatchObject({ reason: 'inactive_account' });
    });

    it('respinge cererile venite de pe alt site (CSRF)', async () => {
      await t.createUser();
      const response = await t
        .http()
        .post('/api/auth/login')
        .set('Origin', 'https://evil.example')
        .send({ email: 'admin@test.ro', password: PASSWORD })
        .expect(403);
      expect(response.body.code).toBe('CSRF_REJECTED');
    });

    it('nu acceptă formulare urlencoded', async () => {
      await t.createUser();
      await t
        .http()
        .post('/api/auth/login')
        .set('Origin', ORIGIN)
        .type('form')
        .send({ email: 'admin@test.ro', password: PASSWORD })
        .expect(400);
    });
  });

  describe('sesiune', () => {
    it('GET /api/auth/me cere autentificare', async () => {
      const response = await t.http().get('/api/auth/me').expect(401);
      expect(response.body.code).toBe('UNAUTHENTICATED');
    });

    it('GET /api/auth/me întoarce utilizatorul curent', async () => {
      await t.createUser();
      const cookie = await t.login('admin@test.ro');
      const response = await t.http().get('/api/auth/me').set('Cookie', cookie).expect(200);
      expect(response.body.email).toBe('admin@test.ro');
      expect(response.get('Cache-Control')).toBe('no-store');
    });

    it('logout-ul invalidează sesiunea pe server', async () => {
      await t.createUser();
      const cookie = await t.login('admin@test.ro');
      await t
        .http()
        .post('/api/auth/logout')
        .set('Origin', ORIGIN)
        .set('Cookie', cookie)
        .expect(204);
      await t.http().get('/api/auth/me').set('Cookie', cookie).expect(401);
    });

    it('sesiunile expirate sunt respinse', async () => {
      await t.createUser();
      const cookie = await t.login('admin@test.ro');
      await t.prisma.db.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
      await t.http().get('/api/auth/me').set('Cookie', cookie).expect(401);
      expect(await t.prisma.db.session.count()).toBe(0);
    });

    it('sesiunile folosite activ sunt prelungite', async () => {
      await t.createUser();
      const cookie = await t.login('admin@test.ro');
      const soon = new Date(Date.now() + 60 * 60 * 1000);
      await t.prisma.db.session.updateMany({ data: { expiresAt: soon } });
      const response = await t.http().get('/api/auth/me').set('Cookie', cookie).expect(200);
      expect(response.get('Set-Cookie')?.[0]).toContain('alconst_session=');
      const session = await t.prisma.db.session.findFirstOrThrow();
      expect(session.expiresAt.getTime()).toBeGreaterThan(soon.getTime());
    });

    it('dezactivarea contului invalidează imediat sesiunile existente', async () => {
      const user = await t.createUser();
      const cookie = await t.login('admin@test.ro');
      await t.prisma.db.user.update({ where: { id: user.id }, data: { isActive: false } });
      await t.http().get('/api/auth/me').set('Cookie', cookie).expect(401);
    });
  });

  describe('POST /api/auth/change-password', () => {
    it('schimbă parola și deconectează celelalte dispozitive', async () => {
      await t.createUser();
      const other = await t.login('admin@test.ro');
      const current = await t.login('admin@test.ro');

      await t
        .http()
        .post('/api/auth/change-password')
        .set('Origin', ORIGIN)
        .set('Cookie', current)
        .send({ currentPassword: PASSWORD, newPassword: 'o-parola-noua-456' })
        .expect(200);

      await t.http().get('/api/auth/me').set('Cookie', current).expect(200);
      await t.http().get('/api/auth/me').set('Cookie', other).expect(401);
      await t.login('admin@test.ro', 'o-parola-noua-456');
    });

    it('respinge parola curentă greșită', async () => {
      await t.createUser();
      const cookie = await t.login('admin@test.ro');
      const response = await t
        .http()
        .post('/api/auth/change-password')
        .set('Origin', ORIGIN)
        .set('Cookie', cookie)
        .send({ currentPassword: 'gresita-gresita', newPassword: 'o-parola-noua-456' })
        .expect(400);
      expect(response.body.fieldErrors).toHaveProperty('currentPassword');
    });

    it('respinge parolele prea scurte', async () => {
      await t.createUser();
      const cookie = await t.login('admin@test.ro');
      const response = await t
        .http()
        .post('/api/auth/change-password')
        .set('Origin', ORIGIN)
        .set('Cookie', cookie)
        .send({ currentPassword: PASSWORD, newPassword: 'scurta' })
        .expect(400);
      expect(response.body.fieldErrors).toHaveProperty('newPassword');
    });
  });

  describe('parolă temporară', () => {
    it('blochează accesul până la schimbarea parolei', async () => {
      await t.createUser({ mustChangePassword: true });
      const cookie = await t.login('admin@test.ro');

      await t.http().get('/api/auth/me').set('Cookie', cookie).expect(200);
      const blocked = await t.http().get('/api/users').set('Cookie', cookie).expect(403);
      expect(blocked.body.code).toBe('PASSWORD_CHANGE_REQUIRED');

      const changed = await t
        .http()
        .post('/api/auth/change-password')
        .set('Origin', ORIGIN)
        .set('Cookie', cookie)
        .send({ currentPassword: PASSWORD, newPassword: 'o-parola-noua-456' })
        .expect(200);
      expect(changed.body.mustChangePassword).toBe(false);
      await t.http().get('/api/users').set('Cookie', cookie).expect(200);
    });
  });

  describe('resetarea parolei', () => {
    const tokenFromMail = (t: TestApp): string => {
      const mail = t.mail.sent[0];
      if (!mail) throw new Error('Nu a fost trimis niciun email');
      return new URL(mail.resetUrl).searchParams.get('token') ?? '';
    };

    it('trimite un link de resetare și permite setarea unei parole noi', async () => {
      await t.createUser();
      const oldSession = await t.login('admin@test.ro');

      await t
        .http()
        .post('/api/auth/forgot-password')
        .set('Origin', ORIGIN)
        .send({ email: 'admin@test.ro' })
        .expect(204);
      await waitFor(() => t.mail.sent.length === 1);
      expect(t.mail.sent[0]).toMatchObject({ kind: 'password-reset', to: 'admin@test.ro' });
      expect(t.mail.sent[0]?.resetUrl).toMatch(/^http:\/\/localhost:3000\/resetare-parola\?token=/);

      const token = tokenFromMail(t);
      await t
        .http()
        .post('/api/auth/reset-password')
        .set('Origin', ORIGIN)
        .send({ token, newPassword: 'parola-resetata-789' })
        .expect(204);

      // Sesiunile vechi sunt revocate, parola nouă funcționează, linkul nu poate fi refolosit.
      await t.http().get('/api/auth/me').set('Cookie', oldSession).expect(401);
      await t.login('admin@test.ro', 'parola-resetata-789');
      await t
        .http()
        .post('/api/auth/reset-password')
        .set('Origin', ORIGIN)
        .send({ token, newPassword: 'alta-parola-000' })
        .expect(400);
    });

    it('răspunde identic pentru adrese necunoscute și nu trimite email', async () => {
      await t
        .http()
        .post('/api/auth/forgot-password')
        .set('Origin', ORIGIN)
        .send({ email: 'nimeni@test.ro' })
        .expect(204);
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(t.mail.sent).toHaveLength(0);
    });

    it('respinge linkurile expirate', async () => {
      await t.createUser();
      await t
        .http()
        .post('/api/auth/forgot-password')
        .set('Origin', ORIGIN)
        .send({ email: 'admin@test.ro' });
      await waitFor(() => t.mail.sent.length === 1);
      await t.prisma.db.passwordResetToken.updateMany({
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await t
        .http()
        .post('/api/auth/reset-password')
        .set('Origin', ORIGIN)
        .send({ token: tokenFromMail(t), newPassword: 'parola-resetata-789' })
        .expect(400);
    });
  });

  it('GET /api/health este public', async () => {
    const response = await t.http().get('/api/health').expect(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});
