import { createTestApp, ORIGIN, type TestApp } from './test-app.js';

describe('Notificări pe telefon – Web Push (e2e)', () => {
  let t: TestApp;
  let ana: { id: string; cookie: string };
  let dan: { id: string; cookie: string };

  const subscription = (endpoint: string) => ({
    endpoint,
    keys: {
      p256dh:
        'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
      auth: 'tBHItJI5svbpez7KI4CCXg',
    },
    deviceLabel: 'iPhone',
  });

  beforeAll(async () => {
    t = await createTestApp();
  });
  beforeEach(async () => {
    await t.reset();
    const anaUser = await t.createUser({ email: 'ana@test.ro', role: 'EMPLOYEE' });
    const danUser = await t.createUser({
      email: 'dan@test.ro',
      role: 'EMPLOYEE',
      firstName: 'Dan',
    });
    ana = { id: anaUser.id, cookie: await t.login('ana@test.ro') };
    dan = { id: danUser.id, cookie: await t.login('dan@test.ro') };
  });
  afterAll(() => t.close());

  const post = (url: string, cookie: string, body: object = {}) =>
    t.http().post(url).set('Origin', ORIGIN).set('Cookie', cookie).send(body);

  it('dă cheia publică, generată o singură dată', async () => {
    const first = await t.http().get('/api/push/config').set('Cookie', ana.cookie).expect(200);
    const second = await t.http().get('/api/push/config').set('Cookie', dan.cookie).expect(200);
    expect(first.body.publicKey).toMatch(/^[A-Za-z0-9_-]{87}$/);
    expect(second.body.publicKey).toBe(first.body.publicKey);
    expect(first.body.devices).toBe(0);
  });

  it('acceptă doar serviciile de push ale browserelor', async () => {
    for (const endpoint of [
      'http://fcm.googleapis.com/fcm/send/x',
      'https://169.254.169.254/latest',
      'https://localhost:3001/api',
      'https://fcm.googleapis.com.evil.ro/x',
    ]) {
      await post('/api/push/subscribe', ana.cookie, subscription(endpoint)).expect(400);
    }
    const response = await post(
      '/api/push/subscribe',
      ana.cookie,
      subscription('https://web.push.apple.com/QGuQyavXut'),
    ).expect(201);
    expect(response.body.devices).toBe(1);
  });

  it('un dispozitiv aparține ultimului utilizator care l-a abonat', async () => {
    const endpoint = 'https://fcm.googleapis.com/fcm/send/abc';
    await post('/api/push/subscribe', ana.cookie, subscription(endpoint)).expect(201);
    await post('/api/push/subscribe', dan.cookie, subscription(endpoint)).expect(201);
    expect(await t.prisma.db.pushSubscription.count({ where: { userId: ana.id } })).toBe(0);
    expect(await t.prisma.db.pushSubscription.count({ where: { userId: dan.id } })).toBe(1);

    // Ana nu poate dezabona dispozitivul lui Dan.
    await post('/api/push/unsubscribe', ana.cookie, { endpoint }).expect(200);
    expect(await t.prisma.db.pushSubscription.count()).toBe(1);
    const response = await post('/api/push/unsubscribe', dan.cookie, { endpoint }).expect(200);
    expect(response.body.devices).toBe(0);
  });

  it('o notificare din aplicație ajunge și pe telefon, cu numărul de necitite', async () => {
    await post('/api/push/test', ana.cookie).expect(400);
    await post(
      '/api/push/subscribe',
      ana.cookie,
      subscription('https://fcm.googleapis.com/fcm/send/ana'),
    ).expect(201);
    await post('/api/push/test', ana.cookie).expect(204);
    expect(t.push.jobs).toHaveLength(1);

    // Dan îi dă Anei ceva de făcut.
    const task = await post('/api/tasks', dan.cookie, {
      title: 'Verificare hidranți',
      dueDate: '2026-12-01',
      assigneeId: ana.id,
    }).expect(201);
    expect(t.push.jobs[1]).toEqual({
      userId: ana.id,
      payload: {
        title: 'Ai primit ceva de făcut',
        body: 'Verificare hidranți',
        url: `/task-uri?task=${task.body.id}`,
        tag: expect.any(String),
        badge: 1,
      },
    });
    const notification = await t.prisma.db.notification.findFirstOrThrow({
      where: { userId: ana.id },
    });
    expect(notification.pushedAt).not.toBeNull();
  });
});
