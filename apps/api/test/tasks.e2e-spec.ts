import { addDays, todayIn } from '@alconst/shared';
import { createTestApp, ORIGIN, type TestApp } from './test-app.js';

describe('Obligații, task-uri și notificări (e2e)', () => {
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
  const patch = (url: string, cookie: string, body: object) =>
    t.http().patch(url).set('Origin', ORIGIN).set('Cookie', cookie).send(body);
  const put = (url: string, cookie: string, body: object) =>
    t.http().put(url).set('Origin', ORIGIN).set('Cookie', cookie).send(body);
  const del = (url: string, cookie: string) =>
    t.http().delete(url).set('Origin', ORIGIN).set('Cookie', cookie);
  const get = (url: string, cookie: string) => t.http().get(url).set('Cookie', cookie);

  type Task = {
    id: string;
    title: string;
    dueDate: string;
    status: string;
    assignee: { id: string } | null;
  };
  const tasksOf = async (obligationId: string, status = 'all') =>
    (
      await get(
        `/api/tasks?obligationId=${obligationId}&status=${status}&pageSize=100`,
        admin.cookie,
      ).expect(200)
    ).body.items as Task[];

  // La două săptămâni, începând de azi: în orizontul de 60 de zile intră 5 apariții (0, 14, 28, 42, 56).
  const createObligation = async (overrides: object = {}) =>
    (
      await post('/api/obligations', ana.cookie, {
        title: 'Deplasare periodică',
        kind: 'VISIT',
        clientId,
        assigneeId: ana.id,
        recurrenceUnit: 'WEEK',
        recurrenceInterval: 2,
        startDate: today,
        ...overrides,
      }).expect(201)
    ).body as { id: string; nextDueDate: string; openTaskCount: number };

  describe('generarea task-urilor din obligații', () => {
    it('creează imediat task-urile din orizont, cu datele obligației', async () => {
      const obligation = await createObligation();
      expect(obligation).toMatchObject({ nextDueDate: today, openTaskCount: 5 });

      const tasks = await tasksOf(obligation.id);
      expect(tasks.map((task) => task.dueDate)).toEqual(
        [0, 14, 28, 42, 56].map((days) => addDays(today, days)),
      );
      expect(tasks[0]).toMatchObject({
        title: 'Deplasare periodică',
        kind: 'VISIT',
        status: 'TODO',
        client: { id: clientId },
        assignee: { id: ana.id },
        obligation: { id: obligation.id },
      });
    });

    it('nu creează restanțe pentru o obligație cu data de început în trecut', async () => {
      const obligation = await createObligation({ startDate: addDays(today, -21) });
      const tasks = await tasksOf(obligation.id);
      expect(tasks.map((task) => task.dueDate)).toEqual(
        [7, 21, 35, 49].map((days) => addDays(today, days)),
      );
    });

    it('respectă data de sfârșit și nu generează pentru obligații inactive', async () => {
      const limited = await createObligation({ endDate: addDays(today, 20) });
      expect(await tasksOf(limited.id)).toHaveLength(2);
      const inactive = await createObligation({ title: 'Inactivă', isActive: false });
      expect(await tasksOf(inactive.id)).toHaveLength(0);
    });

    it('modificările de conținut actualizează task-urile neîncepute și păstrează reprogramările', async () => {
      const obligation = await createObligation();
      const [first, second, third] = await tasksOf(obligation.id);
      await patch(`/api/tasks/${first!.id}`, ana.cookie, { status: 'IN_PROGRESS' }).expect(200);
      await patch(`/api/tasks/${second!.id}`, ana.cookie, { dueDate: addDays(today, 16) }).expect(
        200,
      );

      await patch(`/api/obligations/${obligation.id}`, ana.cookie, {
        title: 'Deplasare + instruire',
        assigneeId: dan.id,
      }).expect(200);

      const tasks = await tasksOf(obligation.id);
      expect(tasks).toHaveLength(5);
      const byId = new Map(tasks.map((task) => [task.id, task]));
      // Task-ul început rămâne neatins.
      expect(byId.get(first!.id)).toMatchObject({
        title: 'Deplasare periodică',
        assignee: { id: ana.id },
      });
      // Cel reprogramat primește noul titlu, dar își păstrează termenul.
      expect(byId.get(second!.id)).toMatchObject({
        title: 'Deplasare + instruire',
        dueDate: addDays(today, 16),
        assignee: { id: dan.id },
      });
      expect(byId.get(third!.id)).toMatchObject({ title: 'Deplasare + instruire' });
    });

    it('schimbarea frecvenței regenerează task-urile neîncepute, fără a atinge restul', async () => {
      const obligation = await createObligation();
      const [first] = await tasksOf(obligation.id);
      await patch(`/api/tasks/${first!.id}`, ana.cookie, { status: 'DONE' }).expect(200);

      await patch(`/api/obligations/${obligation.id}`, ana.cookie, {
        recurrenceInterval: 4,
      }).expect(200);

      const tasks = await tasksOf(obligation.id);
      // Apariția de azi este deja finalizată; cele noi sunt la 28 și 56 de zile.
      expect(tasks.map((task) => [task.dueDate, task.status])).toEqual([
        [today, 'DONE'],
        [addDays(today, 28), 'TODO'],
        [addDays(today, 56), 'TODO'],
      ]);
    });

    it('dezactivarea și ștergerea elimină doar task-urile viitoare neîncepute', async () => {
      const obligation = await createObligation();
      const [first] = await tasksOf(obligation.id);
      await patch(`/api/tasks/${first!.id}`, ana.cookie, { status: 'DONE' }).expect(200);

      await patch(`/api/obligations/${obligation.id}`, ana.cookie, { isActive: false }).expect(200);
      expect(await tasksOf(obligation.id)).toHaveLength(1);

      await patch(`/api/obligations/${obligation.id}`, ana.cookie, { isActive: true }).expect(200);
      expect(await tasksOf(obligation.id)).toHaveLength(5);

      await del(`/api/obligations/${obligation.id}`, ana.cookie).expect(204);
      const remaining = await get(`/api/tasks/${first!.id}`, ana.cookie).expect(200);
      expect(remaining.body).toMatchObject({ status: 'DONE', obligation: null });
      expect(await t.prisma.db.task.count()).toBe(1);
    });

    it('task-urile generate nu pot fi șterse, doar anulate', async () => {
      const obligation = await createObligation();
      const [first] = await tasksOf(obligation.id);
      await del(`/api/tasks/${first!.id}`, ana.cookie).expect(400);
      await patch(`/api/tasks/${first!.id}`, ana.cookie, { status: 'CANCELLED' }).expect(200);
      // Apariția anulată nu este recreată la următoarea generare.
      await patch(`/api/obligations/${obligation.id}`, ana.cookie, { description: 'x' }).expect(
        200,
      );
      const tasks = await tasksOf(obligation.id);
      expect(tasks.filter((task) => task.dueDate === today)).toHaveLength(1);
      expect(tasks[0]?.status).toBe('CANCELLED');
    });

    it('validează frecvența, perioada și legăturile', async () => {
      const bad = await post('/api/obligations', ana.cookie, {
        title: '',
        recurrenceUnit: 'HOURLY',
        recurrenceInterval: 0,
        startDate: '2026-02-30',
      }).expect(400);
      expect(Object.keys(bad.body.fieldErrors)).toEqual(
        expect.arrayContaining(['title', 'recurrenceUnit', 'recurrenceInterval', 'startDate']),
      );
      await post('/api/obligations', ana.cookie, {
        title: 'X',
        recurrenceUnit: 'MONTH',
        startDate: today,
        endDate: addDays(today, -1),
      }).expect(400);
      // Dan nu este responsabil pentru acest client.
      await post('/api/obligations', dan.cookie, {
        title: 'X',
        clientId,
        recurrenceUnit: 'MONTH',
        startDate: today,
      }).expect(404);
    });
  });

  describe('task-uri', () => {
    const createTask = async (cookie: string, overrides: object = {}) =>
      (
        await post('/api/tasks', cookie, {
          title: 'Verificare stingătoare',
          dueDate: today,
          clientId,
          ...overrides,
        }).expect(201)
      ).body as Task;

    it('reține momentul finalizării și permite redeschiderea', async () => {
      const task = await createTask(ana.cookie);
      const done = await patch(`/api/tasks/${task.id}`, ana.cookie, { status: 'DONE' }).expect(200);
      expect(done.body.completedAt).not.toBeNull();
      const reopened = await patch(`/api/tasks/${task.id}`, ana.cookie, { status: 'TODO' }).expect(
        200,
      );
      expect(reopened.body.completedAt).toBeNull();
    });

    it('păstrează istoricul modificărilor, cu valorile vechi și noi', async () => {
      const task = await createTask(ana.cookie, { assigneeId: ana.id });
      await patch(`/api/tasks/${task.id}`, ana.cookie, { status: 'IN_PROGRESS' }).expect(200);
      await patch(`/api/tasks/${task.id}`, admin.cookie, {
        dueDate: addDays(today, 3),
        assigneeId: dan.id,
        notes: 'Reprogramat la cererea clientului',
      }).expect(200);

      const history = (await get(`/api/tasks/${task.id}/history`, ana.cookie).expect(200)).body as {
        action: string;
        user: { firstName: string };
        changes: { field: string; from: string | null; to: string | null }[];
      }[];
      expect(history.map((entry) => entry.action)).toEqual([
        'task.updated',
        'task.status_changed',
        'task.created',
      ]);
      expect(history[0]?.user.firstName).toBe('Admin');
      expect(history[0]?.changes).toEqual(
        expect.arrayContaining([
          { field: 'dueDate', from: today, to: addDays(today, 3) },
          { field: 'assignee', from: 'Ana Pop', to: 'Dan Ilie' },
          { field: 'notes', from: null, to: null },
        ]),
      );
      expect(history[1]?.changes).toEqual([{ field: 'status', from: 'TODO', to: 'IN_PROGRESS' }]);
    });

    it('accesul urmează clientul, atribuirea și autorul', async () => {
      const task = await createTask(ana.cookie);
      await get(`/api/tasks/${task.id}`, dan.cookie).expect(404);
      await patch(`/api/tasks/${task.id}`, dan.cookie, { status: 'DONE' }).expect(404);
      await post('/api/tasks', dan.cookie, { title: 'X', dueDate: today, clientId }).expect(404);
      expect((await get('/api/tasks', dan.cookie).expect(200)).body.total).toBe(0);

      // Odată atribuit lui Dan, el îl vede și îl poate actualiza, fără acces la client.
      await patch(`/api/tasks/${task.id}`, ana.cookie, { assigneeId: dan.id }).expect(200);
      await patch(`/api/tasks/${task.id}`, dan.cookie, {
        status: 'IN_PROGRESS',
        notes: 'Am sunat',
      }).expect(200);
      await get(`/api/clients/${clientId}`, dan.cookie).expect(404);

      // Task-urile personale (fără client) sunt vizibile doar autorului și administratorilor.
      const personal = await createTask(dan.cookie, { clientId: null, title: 'Notă personală' });
      await get(`/api/tasks/${personal.id}`, ana.cookie).expect(404);
      await get(`/api/tasks/${personal.id}`, admin.cookie).expect(200);
      await del(`/api/tasks/${personal.id}`, dan.cookie).expect(204);
    });

    it('filtrează după status, responsabil, interval și text', async () => {
      await createTask(ana.cookie, { title: 'Azi, al Anei', assigneeId: ana.id });
      await createTask(ana.cookie, {
        title: 'Peste 10 zile',
        dueDate: addDays(today, 10),
        assigneeId: dan.id,
      });
      const done = await createTask(ana.cookie, { title: 'Finalizat', status: 'DONE' });
      expect(done.status).toBe('DONE');

      const titles = async (query: string) =>
        ((await get(`/api/tasks?${query}`, admin.cookie).expect(200)).body.items as Task[]).map(
          (task) => task.title,
        );

      expect(await titles('')).toEqual(['Azi, al Anei', 'Peste 10 zile']);
      expect(await titles('status=done')).toEqual(['Finalizat']);
      expect(await titles('status=all')).toHaveLength(3);
      expect(await titles(`assignee=${dan.id}`)).toEqual(['Peste 10 zile']);
      expect(await titles('assignee=none&status=all')).toEqual(['Finalizat']);
      expect(await titles(`from=${addDays(today, 5)}&to=${addDays(today, 15)}`)).toEqual([
        'Peste 10 zile',
      ]);
      expect(await titles('search=stefanescu')).toHaveLength(2);
      expect(await titles('search=peste 10')).toEqual(['Peste 10 zile']);

      const mine = await get('/api/tasks?assignee=me', ana.cookie).expect(200);
      expect(mine.body.items.map((task: Task) => task.title)).toEqual(['Azi, al Anei']);
    });

    it('sumarul separă restanțele, termenele de azi și următoarele 7 zile', async () => {
      await createTask(ana.cookie, {
        title: 'Restant',
        dueDate: addDays(today, -2),
        assigneeId: ana.id,
      });
      await createTask(ana.cookie, { title: 'Azi', assigneeId: ana.id });
      await createTask(ana.cookie, {
        title: 'În 3 zile',
        dueDate: addDays(today, 3),
        assigneeId: dan.id,
      });
      await createTask(ana.cookie, {
        title: 'În 10 zile',
        dueDate: addDays(today, 10),
        assigneeId: ana.id,
      });
      await createTask(ana.cookie, {
        title: 'Restant, dar finalizat',
        dueDate: addDays(today, -5),
        status: 'DONE',
      });

      const mine = (await get('/api/tasks/overview', ana.cookie).expect(200)).body;
      expect(mine.today).toBe(today);
      expect(mine.counts).toEqual({ overdue: 1, inPeriod: 0, dueToday: 1, upcoming: 0 });
      expect(mine.overdue[0].title).toBe('Restant');

      const all = (await get('/api/tasks/overview?scope=all', ana.cookie).expect(200)).body;
      expect(all.counts).toEqual({ overdue: 1, inPeriod: 0, dueToday: 1, upcoming: 1 });

      // Dan vede doar ce îi este atribuit, chiar și cu `scope=all`.
      const dans = (await get('/api/tasks/overview?scope=all', dan.cookie).expect(200)).body;
      expect(dans.counts).toEqual({ overdue: 0, inPeriod: 0, dueToday: 0, upcoming: 1 });
    });
  });

  describe('interval orar, fișe și preluări', () => {
    const createVisit = async (cookie: string, overrides: object = {}) =>
      (
        await post('/api/tasks', cookie, {
          title: 'Deplasare',
          kind: 'VISIT',
          dueDate: today,
          clientId,
          assigneeId: ana.id,
          ...overrides,
        }).expect(201)
      ).body as Task & { startTime: string | null; sheetsCompleted: boolean; isCover: boolean };

    it('task-urile pot avea un interval orar și sunt ordonate după el în cadrul zilei', async () => {
      await createVisit(ana.cookie, { title: 'Fără oră' });
      await createVisit(ana.cookie, { title: 'După-amiază', startTime: '14:00', endTime: '16:00' });
      await createVisit(ana.cookie, { title: 'Dimineață', startTime: '09:30' });

      const list = (await get('/api/tasks', ana.cookie).expect(200)).body.items as {
        title: string;
      }[];
      expect(list.map((task) => task.title)).toEqual(['Dimineață', 'După-amiază', 'Fără oră']);
    });

    it('validează intervalul orar', async () => {
      const invalid = await post('/api/tasks', ana.cookie, {
        title: 'X',
        dueDate: today,
        startTime: '25:00',
      }).expect(400);
      expect(invalid.body.fieldErrors).toHaveProperty('startTime');
      const onlyEnd = await post('/api/tasks', ana.cookie, {
        title: 'X',
        dueDate: today,
        endTime: '12:00',
      }).expect(400);
      expect(onlyEnd.body.fieldErrors).toHaveProperty('startTime');
      const reversed = await post('/api/tasks', ana.cookie, {
        title: 'X',
        dueDate: today,
        startTime: '12:00',
        endTime: '10:00',
      }).expect(400);
      expect(reversed.body.fieldErrors).toHaveProperty('endTime');

      const task = await createVisit(ana.cookie, { startTime: '10:00', endTime: '12:00' });
      // Ștergerea începutului lasă un sfârșit fără început, ceea ce nu este permis.
      await patch(`/api/tasks/${task.id}`, ana.cookie, { startTime: '' }).expect(400);
      const cleared = await patch(`/api/tasks/${task.id}`, ana.cookie, {
        startTime: '',
        endTime: '',
      }).expect(200);
      expect(cleared.body).toMatchObject({ startTime: null, endTime: null });
    });

    it('obligațiile dau intervalul orar task-urilor, fără a suprascrie orele ajustate manual', async () => {
      const obligation = await createObligation({ startTime: '10:00', endTime: '12:00' });
      const [first, second] = await tasksOf(obligation.id);
      expect(first).toMatchObject({ startTime: '10:00', endTime: '12:00' });

      // Responsabilul își mută singur a doua deplasare la altă oră.
      await patch(`/api/tasks/${second!.id}`, ana.cookie, {
        startTime: '15:00',
        endTime: '17:00',
      }).expect(200);
      await patch(`/api/obligations/${obligation.id}`, ana.cookie, { title: 'Titlu nou' }).expect(
        200,
      );
      expect((await get(`/api/tasks/${second!.id}`, ana.cookie).expect(200)).body).toMatchObject({
        title: 'Titlu nou',
        startTime: '15:00',
        endTime: '17:00',
      });

      // Schimbarea intervalului pe obligație se aplică tuturor task-urilor neîncepute.
      await patch(`/api/obligations/${obligation.id}`, ana.cookie, {
        startTime: '08:00',
        endTime: '09:00',
      }).expect(200);
      expect((await get(`/api/tasks/${second!.id}`, ana.cookie).expect(200)).body.startTime).toBe(
        '08:00',
      );
    });

    it('ține evidența completării fișelor, doar pentru deplasări', async () => {
      const visit = await createVisit(ana.cookie);
      expect(visit.sheetsCompleted).toBe(false);

      // O deplasare poate fi finalizată fără fișe; rămâne semnalată până sunt confirmate.
      await patch(`/api/tasks/${visit.id}`, ana.cookie, { status: 'DONE' }).expect(200);
      const missing = (await get('/api/tasks?status=missing-sheets', ana.cookie).expect(200)).body;
      expect(missing.items.map((task: Task) => task.id)).toEqual([visit.id]);
      expect(
        (await get('/api/tasks/overview', ana.cookie).expect(200)).body.visitsMissingSheets,
      ).toBe(1);

      const confirmed = await patch(`/api/tasks/${visit.id}`, ana.cookie, {
        sheetsCompleted: true,
      }).expect(200);
      expect(confirmed.body.sheetsCompleted).toBe(true);
      expect(confirmed.body.sheetsCompletedAt).not.toBeNull();
      expect(
        (await get('/api/tasks?status=missing-sheets', ana.cookie).expect(200)).body.total,
      ).toBe(0);
      expect(
        (await get('/api/tasks/overview', ana.cookie).expect(200)).body.visitsMissingSheets,
      ).toBe(0);

      const history = (await get(`/api/tasks/${visit.id}/history`, ana.cookie).expect(200)).body;
      expect(history[0].changes).toEqual([{ field: 'sheets', from: 'NO', to: 'YES' }]);

      // Pentru o activitate obișnuită confirmarea nu are sens și este ignorată.
      const general = (
        await post('/api/tasks', ana.cookie, {
          title: 'Raport',
          dueDate: today,
          sheetsCompleted: true,
        }).expect(201)
      ).body;
      expect(general.sheetsCompleted).toBe(false);
      // Schimbarea tipului șterge confirmarea.
      const changed = await patch(`/api/tasks/${visit.id}`, ana.cookie, { kind: 'GENERAL' }).expect(
        200,
      );
      expect(changed.body.sheetsCompleted).toBe(false);
    });

    it('preluare pentru o singură deplasare: colegul vede task-ul și datele de contact, nu și clientul', async () => {
      await patch(`/api/clients/${clientId}`, ana.cookie, {
        address: 'Str. Fabricii 10',
        contactPerson: 'Ion Pop',
        phone: '0721 000 000',
        employeeCount: 12,
      }).expect(200);
      const visit = await createVisit(ana.cookie);
      expect(visit.isCover).toBe(false);

      const handed = await patch(`/api/tasks/${visit.id}`, ana.cookie, {
        assigneeId: dan.id,
      }).expect(200);
      expect(handed.body.isCover).toBe(true);

      const seenByDan = (await get(`/api/tasks/${visit.id}`, dan.cookie).expect(200)).body;
      expect(seenByDan.client).toEqual({
        id: clientId,
        name: 'SC Ștefănescu SRL',
        address: 'Str. Fabricii 10',
        contactPerson: 'Ion Pop',
        phone: '0721 000 000',
        employeeCount: 12,
        responsibles: [{ id: ana.id, firstName: 'Ana', lastName: 'Pop' }],
      });
      // La finalizare, cel care a fost acolo notează și câți angajați are acum clientul.
      const finished = await patch(`/api/tasks/${visit.id}`, dan.cookie, {
        status: 'DONE',
        sheetsCompleted: true,
        clientEmployeeCount: 14,
      }).expect(200);
      expect(finished.body.client.employeeCount).toBe(14);
      const client = (await get(`/api/clients/${clientId}`, ana.cookie).expect(200)).body;
      expect(client.employeeCount).toBe(14);
      const log = await t.prisma.db.activityLog.findFirst({
        where: { action: 'client.employee_count_updated' },
        orderBy: { createdAt: 'desc' },
      });
      expect(log).toMatchObject({
        userId: dan.id,
        metadata: { from: 12, to: 14, taskId: visit.id },
      });
      // Restul datelor clientului și celelalte task-uri ale lui rămân inaccesibile.
      await get(`/api/clients/${clientId}`, dan.cookie).expect(404);
      await get(`/api/locations?clientId=${clientId}`, dan.cookie).expect(404);
      await patch(`/api/clients/${clientId}`, dan.cookie, { employeeCount: 1 }).expect(404);
      const other = await createVisit(ana.cookie, { title: 'Altă deplasare' });
      await get(`/api/tasks/${other.id}`, dan.cookie).expect(404);
      expect((await get('/api/notifications', dan.cookie).expect(200)).body.items[0]).toMatchObject(
        {
          type: 'TASK_ASSIGNED',
          taskId: visit.id,
        },
      );
    });
  });

  describe('notificări', () => {
    it('anunță utilizatorul căruia i se atribuie un task de către altcineva', async () => {
      const task = (
        await post('/api/tasks', admin.cookie, {
          title: 'Verificare',
          dueDate: today,
          assigneeId: ana.id,
        }).expect(201)
      ).body as Task;
      // Auto-atribuirea nu generează notificare.
      await post('/api/tasks', ana.cookie, {
        title: 'Al meu',
        dueDate: today,
        assigneeId: ana.id,
      }).expect(201);

      expect((await get('/api/notifications/unread-count', ana.cookie).expect(200)).body).toEqual({
        count: 1,
      });
      // Atribuirea este anunțată și pe email, fără titlul task-ului.
      const mail = t.mail.sent.find((item) => item.kind === 'notification');
      expect(mail).toMatchObject({
        to: 'ana@test.ro',
        headline: 'Ai primit ceva de făcut',
        actionUrl: `http://localhost:3000/task-uri?task=${task.id}`,
      });
      expect(JSON.stringify(mail)).not.toContain('Verificare');
      const list = (await get('/api/notifications', ana.cookie).expect(200)).body;
      expect(list.items[0]).toMatchObject({
        type: 'TASK_ASSIGNED',
        body: 'Verificare',
        taskId: task.id,
        readAt: null,
      });

      // Notificările altui utilizator par inexistente.
      await post(`/api/notifications/${list.items[0].id}/read`, dan.cookie).expect(404);
      await post(`/api/notifications/${list.items[0].id}/read`, ana.cookie).expect(204);
      expect((await get('/api/notifications/unread-count', ana.cookie).expect(200)).body).toEqual({
        count: 0,
      });
      expect(
        (await get('/api/notifications?unreadOnly=true', ana.cookie).expect(200)).body.total,
      ).toBe(0);
    });

    it('fiecare utilizator își configurează reamintirile', async () => {
      expect((await get('/api/notifications/settings', ana.cookie).expect(200)).body).toEqual({
        emailEnabled: true,
        remindDaysBefore: 3,
      });
      const updated = await put('/api/notifications/settings', ana.cookie, {
        emailEnabled: false,
        remindDaysBefore: 7,
      }).expect(200);
      expect(updated.body).toEqual({ emailEnabled: false, remindDaysBefore: 7 });
      await put('/api/notifications/settings', ana.cookie, { remindDaysBefore: 99 }).expect(400);
      expect(
        (await get('/api/notifications/settings', dan.cookie).expect(200)).body.remindDaysBefore,
      ).toBe(3);
    });
  });

  it('lista scurtă de utilizatori este disponibilă tuturor; administrarea rămâne restricționată', async () => {
    const options = await get('/api/users/options', ana.cookie).expect(200);
    expect(options.body).toHaveLength(3);
    expect(options.body[0]).not.toHaveProperty('email');
    await get('/api/users', ana.cookie).expect(403);
    await get(`/api/users/${admin.id}`, ana.cookie).expect(403);
    await post('/api/users', ana.cookie, {}).expect(403);
    await patch(`/api/users/${admin.id}`, ana.cookie, { role: 'EMPLOYEE' }).expect(403);
    await post(`/api/users/${admin.id}/reset-password`, ana.cookie, {
      password: 'parola-noua-123',
    }).expect(403);
  });
});
