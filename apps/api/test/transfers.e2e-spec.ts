import { todayIn } from '@alconst/shared';
import { createTestApp, ORIGIN, type TestApp } from './test-app.js';

describe('Predarea definitivă a unui client (e2e)', () => {
  let t: TestApp;
  let admin: { id: string; cookie: string };
  let ana: { id: string; cookie: string };
  let dan: { id: string; cookie: string };
  let clientId: string;
  const today = todayIn('Europe/Bucharest');

  beforeAll(async () => {
    t = await createTestApp();
  });
  beforeEach(async () => {
    await t.reset();
    const adminUser = await t.createUser({
      email: 'admin@test.ro',
      firstName: 'Admin',
      lastName: 'Sef',
    });
    const anaUser = await t.createUser({
      email: 'ana@test.ro',
      role: 'EMPLOYEE',
      firstName: 'Ana',
      lastName: 'Pop',
    });
    const danUser = await t.createUser({
      email: 'dan@test.ro',
      role: 'EMPLOYEE',
      firstName: 'Dan',
      lastName: 'Ilie',
    });
    admin = { id: adminUser.id, cookie: await t.login('admin@test.ro') };
    ana = { id: anaUser.id, cookie: await t.login('ana@test.ro') };
    dan = { id: danUser.id, cookie: await t.login('dan@test.ro') };
    clientId = (
      await post('/api/clients', ana.cookie, { name: 'SC Ștefănescu SRL', cui: '12345678' }).expect(
        201,
      )
    ).body.id;
  });
  afterAll(() => t.close());

  const post = (url: string, cookie: string, body: object = {}) =>
    t.http().post(url).set('Origin', ORIGIN).set('Cookie', cookie).send(body);
  const get = (url: string, cookie: string) => t.http().get(url).set('Cookie', cookie);

  const transfer = (cookie: string, fromUserId: string, toUserId: string) =>
    post(`/api/clients/${clientId}/transfer`, cookie, { fromUserId, toUserId });
  const pending = async (cookie: string) =>
    (await get('/api/client-transfers', cookie).expect(200)).body as {
      id: string;
      canRespond: boolean;
      canCancel: boolean;
      client: { name: string };
    }[];
  const responsibles = async () =>
    (
      (await get(`/api/clients/${clientId}`, admin.cookie).expect(200)).body.responsibles as {
        id: string;
      }[]
    ).map((user) => user.id);
  const lastNotification = async (cookie: string) =>
    (await get('/api/notifications', cookie).expect(200)).body.items[0] as {
      type: string;
      body: string;
      link: string;
    };
  const createTask = async (overrides: object) =>
    (
      await post('/api/tasks', ana.cookie, {
        title: 'Deplasare',
        kind: 'VISIT',
        dueDate: today,
        clientId,
        ...overrides,
      }).expect(201)
    ).body as { id: string };

  it('între colegi are loc doar cu acordul celuilalt (inițiată de cel care predă)', async () => {
    const obligation = (
      await post('/api/obligations', ana.cookie, {
        title: 'Deplasare periodică',
        clientId,
        assigneeId: ana.id,
        recurrenceUnit: 'WEEK',
        recurrenceInterval: 2,
        startDate: today,
      }).expect(201)
    ).body as { id: string };
    const done = await createTask({ title: 'Deja făcută', assigneeId: ana.id, status: 'DONE' });
    t.mail.sent.length = 0;

    const requested = await transfer(ana.cookie, ana.id, dan.id).expect(200);
    expect(requested.body).toEqual({ status: 'PENDING' });
    // Până la acord nu se schimbă nimic.
    expect(await responsibles()).toEqual([ana.id]);
    await get(`/api/clients/${clientId}`, dan.cookie).expect(404);

    expect(await lastNotification(dan.cookie)).toMatchObject({
      type: 'TRANSFER_REQUESTED',
      body: 'Ana Pop vrea să îți predea clientul SC Ștefănescu SRL',
    });
    // Emailul pleacă imediat, dar fără numele clientului.
    expect(t.mail.sent).toHaveLength(1);
    expect(t.mail.sent[0]).toMatchObject({ kind: 'notification', to: 'dan@test.ro' });
    expect(JSON.stringify(t.mail.sent[0])).not.toContain('Ștefănescu');

    const [forDan] = await pending(dan.cookie);
    expect(forDan).toMatchObject({
      canRespond: true,
      canCancel: false,
      client: { name: 'SC Ștefănescu SRL' },
    });
    const [forAna] = await pending(ana.cookie);
    expect(forAna).toMatchObject({ canRespond: false, canCancel: true });

    // Cel care a trimis cererea nu și-o poate aproba singur; o a doua cerere identică este respinsă.
    await post(`/api/client-transfers/${forDan!.id}/accept`, ana.cookie).expect(403);
    await transfer(ana.cookie, ana.id, dan.id).expect(409);

    await post(`/api/client-transfers/${forDan!.id}/accept`, dan.cookie).expect(204);

    expect(await responsibles()).toEqual([dan.id]);
    await get(`/api/clients/${clientId}`, ana.cookie).expect(404);
    const tasks = (
      await get(`/api/tasks?clientId=${clientId}&status=all&pageSize=100`, admin.cookie).expect(200)
    ).body.items as { id: string; status: string; assignee: { id: string } }[];
    // Task-ul încheiat rămâne pe numele Anei; cele deschise trec la Dan.
    expect(tasks.find((task) => task.id === done.id)?.assignee.id).toBe(ana.id);
    const open = tasks.filter((task) => task.status === 'TODO');
    expect(open).toHaveLength(5);
    expect(open.every((task) => task.assignee.id === dan.id)).toBe(true);
    const obligations = (await get(`/api/obligations?clientId=${clientId}`, dan.cookie).expect(200))
      .body;
    expect(obligations.items[0]).toMatchObject({ id: obligation.id, assignee: { id: dan.id } });

    expect(await lastNotification(ana.cookie)).toMatchObject({ type: 'TRANSFER_ACCEPTED' });
    expect(await pending(dan.cookie)).toEqual([]);
    const log = await t.prisma.db.activityLog.findFirst({
      where: { action: 'client.transferred' },
    });
    expect(log?.metadata).toMatchObject({
      fromUserId: ana.id,
      toUserId: dan.id,
      tasks: 5,
      obligations: 1,
    });
  });

  it('poate fi inițiată și de cel care preia, dacă a lucrat deja pentru client', async () => {
    // Fără niciun task la acest client, Dan nu are de unde ști că el există.
    await transfer(dan.cookie, ana.id, dan.id).expect(404);

    const visit = await createTask({ assigneeId: dan.id });
    expect((await transfer(dan.cookie, ana.id, dan.id).expect(200)).body).toEqual({
      status: 'PENDING',
    });
    expect(await lastNotification(ana.cookie)).toMatchObject({
      type: 'TRANSFER_REQUESTED',
      body: 'Dan Ilie vrea să preia clientul SC Ștefănescu SRL',
    });

    // Acum acordul trebuie să vină de la responsabilul actual.
    const [request] = await pending(ana.cookie);
    expect(request).toMatchObject({ canRespond: true, canCancel: false });
    await post(`/api/client-transfers/${request!.id}/accept`, dan.cookie).expect(403);

    await post(`/api/client-transfers/${request!.id}/decline`, ana.cookie).expect(204);
    expect(await responsibles()).toEqual([ana.id]);
    expect(await lastNotification(dan.cookie)).toMatchObject({
      type: 'TRANSFER_DECLINED',
      body: 'Ana Pop a refuzat predarea clientului SC Ștefănescu SRL',
    });
    // O cerere rezolvată nu mai poate fi acceptată.
    await post(`/api/client-transfers/${request!.id}/accept`, ana.cookie).expect(404);

    await transfer(dan.cookie, ana.id, dan.id).expect(200);
    const [second] = await pending(ana.cookie);
    await post(`/api/client-transfers/${second!.id}/accept`, ana.cookie).expect(204);
    expect(await responsibles()).toEqual([dan.id]);
    expect((await get(`/api/tasks/${visit.id}`, dan.cookie).expect(200)).body.isCover).toBe(false);
  });

  it('un angajat nu poate cere predarea în numele altcuiva și nici către sine însuși', async () => {
    await transfer(ana.cookie, admin.id, dan.id).expect(403);
    await transfer(ana.cookie, ana.id, ana.id).expect(400);
    expect(await pending(admin.cookie)).toEqual([]);
  });

  it('cererea poate fi retrasă de cel care a trimis-o', async () => {
    await transfer(ana.cookie, ana.id, dan.id).expect(200);
    const [request] = await pending(dan.cookie);
    await post(`/api/client-transfers/${request!.id}/cancel`, dan.cookie).expect(403);
    await post(`/api/client-transfers/${request!.id}/cancel`, ana.cookie).expect(204);
    expect(await pending(dan.cookie)).toEqual([]);
    await post(`/api/client-transfers/${request!.id}/accept`, dan.cookie).expect(404);
    expect(await responsibles()).toEqual([ana.id]);
  });

  it('cererile sunt vizibile doar celor implicați și administratorilor', async () => {
    const eva = await t.createUser({ email: 'eva@test.ro', role: 'EMPLOYEE', firstName: 'Eva' });
    const evaCookie = await t.login(eva.email);
    await transfer(ana.cookie, ana.id, dan.id).expect(200);
    const [request] = await pending(admin.cookie);
    expect(await pending(evaCookie)).toEqual([]);
    await post(`/api/client-transfers/${request!.id}/accept`, evaCookie).expect(404);
    await post(`/api/client-transfers/${request!.id}/decline`, evaCookie).expect(404);
  });

  it('administratorul mută direct, fără acord, și îi anunță pe amândoi', async () => {
    await transfer(admin.cookie, dan.id, ana.id).expect(400); // Dan nu este responsabil
    t.mail.sent.length = 0;
    expect((await transfer(admin.cookie, ana.id, dan.id).expect(200)).body).toEqual({
      status: 'COMPLETED',
    });
    expect(await responsibles()).toEqual([dan.id]);

    expect(await lastNotification(dan.cookie)).toMatchObject({
      type: 'CLIENT_TRANSFERRED',
      body: 'SC Ștefănescu SRL',
      link: `/clienti/${clientId}`,
    });
    expect(await lastNotification(ana.cookie)).toMatchObject({
      type: 'CLIENT_TRANSFERRED',
      body: 'SC Ștefănescu SRL → Dan Ilie',
    });
    expect(t.mail.sent.map((mail) => mail.to).sort()).toEqual(['ana@test.ro', 'dan@test.ro']);
  });

  it('administratorul poate aproba o cerere, iar una depășită de situație este anulată', async () => {
    await transfer(ana.cookie, ana.id, dan.id).expect(200);
    const [request] = await pending(admin.cookie);
    expect(request).toMatchObject({ canRespond: true });

    // Între timp clientul ajunge la altcineva: cererea nu mai are obiect.
    await transfer(admin.cookie, ana.id, admin.id).expect(200);
    const stale = await post(`/api/client-transfers/${request!.id}/accept`, dan.cookie).expect(409);
    expect(stale.body.message).toContain('nu mai este valabilă');
    expect(await pending(admin.cookie)).toEqual([]);
    expect(await responsibles()).toEqual([admin.id]);

    // O cerere validă poate fi aprobată și de administrator, în locul colegului.
    await transfer(admin.cookie, admin.id, ana.id).expect(200);
    await transfer(ana.cookie, ana.id, dan.id).expect(200);
    const [second] = await pending(admin.cookie);
    await post(`/api/client-transfers/${second!.id}/accept`, admin.cookie).expect(204);
    expect(await responsibles()).toEqual([dan.id]);
  });

  it('emailurile respectă preferința destinatarului', async () => {
    await t
      .http()
      .put('/api/notifications/settings')
      .set('Origin', ORIGIN)
      .set('Cookie', dan.cookie)
      .send({ emailEnabled: false })
      .expect(200);
    t.mail.sent.length = 0;
    await transfer(ana.cookie, ana.id, dan.id).expect(200);
    expect(t.mail.sent).toHaveLength(0);
    // Notificarea din aplicație există oricum.
    expect(await lastNotification(dan.cookie)).toMatchObject({ type: 'TRANSFER_REQUESTED' });
  });
});
