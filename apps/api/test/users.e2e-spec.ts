import { seedFirstAdmin } from '../src/users/first-admin.js';
import { createTestApp, ORIGIN, PASSWORD, type TestApp } from './test-app.js';

describe('Administrare utilizatori (e2e)', () => {
  let t: TestApp;
  let admin: { id: string; email: string };
  let adminCookie: string;

  beforeAll(async () => {
    t = await createTestApp();
  });
  beforeEach(async () => {
    await t.reset();
    admin = await t.createUser();
    adminCookie = await t.login(admin.email);
  });
  afterAll(() => t.close());

  const newUser = {
    email: 'Maria.Ionescu@Test.ro',
    firstName: ' Maria ',
    lastName: 'Ionescu',
    role: 'EMPLOYEE',
    password: 'parola-temporara-1',
  };

  const createEmployee = async () => {
    const response = await t
      .http()
      .post('/api/users')
      .set('Origin', ORIGIN)
      .set('Cookie', adminCookie)
      .send(newUser)
      .expect(201);
    return response.body as { id: string; email: string };
  };

  it('angajații nu au acces la administrarea utilizatorilor', async () => {
    await t.createUser({ email: 'angajat@test.ro', role: 'EMPLOYEE' });
    const cookie = await t.login('angajat@test.ro');

    const list = await t.http().get('/api/users').set('Cookie', cookie).expect(403);
    expect(list.body.code).toBe('FORBIDDEN');
    await t
      .http()
      .post('/api/users')
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send(newUser)
      .expect(403);
    await t.http().get('/api/activity').set('Cookie', cookie).expect(403);
  });

  it('administratorul creează un utilizator cu parolă temporară', async () => {
    const created = await createEmployee();
    expect(created).toMatchObject({
      email: 'maria.ionescu@test.ro',
      firstName: 'Maria',
      role: 'EMPLOYEE',
      isActive: true,
      mustChangePassword: true,
    });
    expect(created).not.toHaveProperty('passwordHash');

    await t.login('maria.ionescu@test.ro', newUser.password);
    const log = await t.prisma.db.activityLog.findFirst({ where: { action: 'user.created' } });
    expect(log).toMatchObject({
      userId: admin.id,
      entityId: created.id,
      entityLabel: 'Maria Ionescu',
    });
  });

  it('respinge adresele de email duplicate', async () => {
    await createEmployee();
    const response = await t
      .http()
      .post('/api/users')
      .set('Origin', ORIGIN)
      .set('Cookie', adminCookie)
      .send(newUser)
      .expect(409);
    expect(response.body.fieldErrors).toHaveProperty('email');
  });

  it('validează datele și respinge câmpurile necunoscute', async () => {
    const response = await t
      .http()
      .post('/api/users')
      .set('Origin', ORIGIN)
      .set('Cookie', adminCookie)
      .send({ ...newUser, email: 'nu-e-email', role: 'SUPERADMIN', password: 'scurta' })
      .expect(400);
    expect(Object.keys(response.body.fieldErrors)).toEqual(
      expect.arrayContaining(['email', 'role', 'password']),
    );

    await t
      .http()
      .post('/api/users')
      .set('Origin', ORIGIN)
      .set('Cookie', adminCookie)
      .send({ ...newUser, passwordHash: 'x' })
      .expect(400);
  });

  it('dezactivarea unui utilizator îi închide sesiunile și îi blochează autentificarea', async () => {
    const employee = await createEmployee();
    const employeeCookie = await t.login(employee.email, newUser.password);

    const response = await t
      .http()
      .patch(`/api/users/${employee.id}`)
      .set('Origin', ORIGIN)
      .set('Cookie', adminCookie)
      .send({ isActive: false })
      .expect(200);
    expect(response.body.isActive).toBe(false);

    await t.http().get('/api/auth/me').set('Cookie', employeeCookie).expect(401);
    await t
      .http()
      .post('/api/auth/login')
      .set('Origin', ORIGIN)
      .send({ email: employee.email, password: newUser.password })
      .expect(401);
  });

  it('administratorul nu își poate dezactiva contul și nu își poate schimba rolul', async () => {
    await t
      .http()
      .patch(`/api/users/${admin.id}`)
      .set('Origin', ORIGIN)
      .set('Cookie', adminCookie)
      .send({ isActive: false })
      .expect(400);
    await t
      .http()
      .patch(`/api/users/${admin.id}`)
      .set('Origin', ORIGIN)
      .set('Cookie', adminCookie)
      .send({ role: 'EMPLOYEE' })
      .expect(400);
    const stored = await t.prisma.db.user.findUniqueOrThrow({ where: { id: admin.id } });
    expect(stored).toMatchObject({ isActive: true, role: 'ADMIN' });
  });

  it('resetarea parolei de către administrator impune schimbarea ei', async () => {
    const employee = await createEmployee();
    const employeeCookie = await t.login(employee.email, newUser.password);

    await t
      .http()
      .post(`/api/users/${employee.id}/reset-password`)
      .set('Origin', ORIGIN)
      .set('Cookie', adminCookie)
      .send({ password: 'alta-parola-temporara' })
      .expect(200);

    await t.http().get('/api/auth/me').set('Cookie', employeeCookie).expect(401);
    const cookie = await t.login(employee.email, 'alta-parola-temporara');
    const me = await t.http().get('/api/auth/me').set('Cookie', cookie).expect(200);
    expect(me.body.mustChangePassword).toBe(true);
  });

  it('întoarce 404 pentru utilizatori inexistenți și 400 pentru ID-uri invalide', async () => {
    await t
      .http()
      .get('/api/users/019a0000-0000-7000-8000-000000000000')
      .set('Cookie', adminCookie)
      .expect(404);
    await t.http().get('/api/users/abc').set('Cookie', adminCookie).expect(400);
  });

  it('jurnalul de activitate este disponibil administratorilor', async () => {
    await createEmployee();
    const response = await t
      .http()
      .get('/api/activity?limit=5')
      .set('Cookie', adminCookie)
      .expect(200);
    const actions = (response.body as { action: string }[]).map((entry) => entry.action);
    expect(actions).toEqual(expect.arrayContaining(['auth.login', 'user.created']));
    expect(response.body[0]).not.toHaveProperty('ip');
    expect(PASSWORD).toBeTruthy();
  });

  describe('starea proceselor de fundal', () => {
    const status = (cookie: string) => t.http().get('/api/system/status').set('Cookie', cookie);
    const heartbeat = (lastRunAt: Date) =>
      t.prisma.db.workerHeartbeat.upsert({
        where: { name: 'maintenance' },
        create: { name: 'maintenance', lastRunAt },
        update: { lastRunAt },
      });

    it('este vizibilă doar administratorilor', async () => {
      await t.createUser({ email: 'sef@test.ro' });
      await t.createUser({ email: 'coleg@test.ro', role: 'EMPLOYEE' });
      await status(await t.login('coleg@test.ro')).expect(403);
      await t.http().get('/api/system/status').expect(401);
      await status(await t.login('sef@test.ro')).expect(200);
    });

    it('semnalează rularea periodică oprită sau care nu a avut loc niciodată', async () => {
      await t.createUser({ email: 'sef@test.ro' });
      const cookie = await t.login('sef@test.ro');

      expect((await status(cookie).expect(200)).body).toEqual({
        maintenance: { lastRunAt: null, healthy: false },
      });

      await heartbeat(new Date(Date.now() - 30 * 60 * 1000));
      expect((await status(cookie)).body.maintenance).toMatchObject({ healthy: true });

      const old = new Date(Date.now() - 4 * 60 * 60 * 1000);
      await heartbeat(old);
      expect((await status(cookie)).body.maintenance).toEqual({
        lastRunAt: old.toISOString(),
        healthy: false,
      });
    });
  });

  describe('primul administrator (seed)', () => {
    const env = {
      SEED_ADMIN_EMAIL: ' Sef@Alconst-Serv.ro ',
      SEED_ADMIN_PASSWORD: 'parola-de-pornire-1',
    };

    it('este creat o singură dată, cu parolă temporară, și îi poate adăuga pe ceilalți', async () => {
      await t.reset();
      expect(await seedFirstAdmin(t.prisma.db, env)).toEqual({
        status: 'created',
        email: 'sef@alconst-serv.ro',
      });
      const created = await t.prisma.db.user.findUniqueOrThrow({
        where: { email: 'sef@alconst-serv.ro' },
      });
      expect(created.role).toBe('ADMIN');
      expect(created.mustChangePassword).toBe(true);
      expect(created.passwordHash).not.toContain('parola-de-pornire-1');

      // A doua rulare (următorul deploy) nu schimbă nimic, nici cu altă parolă.
      expect(
        await seedFirstAdmin(t.prisma.db, { ...env, SEED_ADMIN_PASSWORD: 'alta-parola-123456' }),
      ).toEqual({ status: 'skipped', reason: 'users-exist' });
      expect(await t.prisma.db.user.count()).toBe(1);
      const after = await t.prisma.db.user.findUniqueOrThrow({ where: { id: created.id } });
      expect(after.passwordHash).toBe(created.passwordHash);

      const login = await t
        .http()
        .post('/api/auth/login')
        .set('Origin', ORIGIN)
        .send({ email: 'sef@alconst-serv.ro', password: 'parola-de-pornire-1' })
        .expect(200);
      expect(login.body.user?.mustChangePassword ?? login.body.mustChangePassword).toBe(true);
    });

    it('nu face nimic dacă există deja utilizatori sau dacă nu este configurat', async () => {
      expect(await seedFirstAdmin(t.prisma.db, env)).toEqual({
        status: 'skipped',
        reason: 'users-exist',
      });
      await t.reset();
      expect(await seedFirstAdmin(t.prisma.db, {})).toEqual({
        status: 'skipped',
        reason: 'not-configured',
      });
      expect(await t.prisma.db.user.count()).toBe(0);
    });

    it('refuză o adresă sau o parolă nevalidă', async () => {
      await t.reset();
      await expect(
        seedFirstAdmin(t.prisma.db, { ...env, SEED_ADMIN_EMAIL: 'nu-este-email' }),
      ).rejects.toThrow('SEED_ADMIN_EMAIL');
      await expect(
        seedFirstAdmin(t.prisma.db, { ...env, SEED_ADMIN_PASSWORD: 'scurta' }),
      ).rejects.toThrow('SEED_ADMIN_PASSWORD');
      expect(await t.prisma.db.user.count()).toBe(0);
    });
  });
});
