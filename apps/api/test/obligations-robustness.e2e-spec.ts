import { generateObligationTasks, lockObligations } from '@alconst/database';
import { addDays, todayIn } from '@alconst/shared';
import { createTestApp, ORIGIN, type TestApp } from './test-app.js';

/**
 * Scenarii-limită pentru obligațiile recurente: ce se întâmplă cu task-urile generate atunci când
 * obligația, responsabilul sau clientul se schimbă și când generarea rulează repetat sau simultan.
 * (Oprirea worker-ului și schimbarea orei sunt testate în `apps/worker/test`.)
 */
describe('Robustețea obligațiilor recurente (e2e)', () => {
  let t: TestApp;
  let admin: { id: string; cookie: string };
  let ana: { id: string; cookie: string };
  let dan: { id: string; cookie: string };
  let clientId: string;
  const today = todayIn('Europe/Bucharest');
  const HORIZON = 60;

  beforeAll(async () => {
    t = await createTestApp();
  });
  beforeEach(async () => {
    await t.reset();
    const adminUser = await t.createUser({ email: 'admin@test.ro' });
    const anaUser = await t.createUser({ email: 'ana@test.ro', role: 'EMPLOYEE' });
    const danUser = await t.createUser({ email: 'dan@test.ro', role: 'EMPLOYEE' });
    admin = { id: adminUser.id, cookie: await t.login('admin@test.ro') };
    ana = { id: anaUser.id, cookie: await t.login('ana@test.ro') };
    dan = { id: danUser.id, cookie: await t.login('dan@test.ro') };
    clientId = (
      await post('/api/clients', ana.cookie, { name: 'SC Exemplu SRL', cui: '12345678' }).expect(
        201,
      )
    ).body.id;
  });
  afterAll(() => t.close());

  const post = (url: string, cookie: string, body: object = {}) =>
    t.http().post(url).set('Origin', ORIGIN).set('Cookie', cookie).send(body);
  const patch = (url: string, cookie: string, body: object) =>
    t.http().patch(url).set('Origin', ORIGIN).set('Cookie', cookie).send(body);
  const del = (url: string, cookie: string) =>
    t.http().delete(url).set('Origin', ORIGIN).set('Cookie', cookie);

  type Task = {
    id: string;
    dueDate: string;
    status: string;
    startTime: string | null;
    assignee: { id: string } | null;
  };
  const tasksOf = async (obligationId: string) =>
    (
      await t
        .http()
        .get(`/api/tasks?obligationId=${obligationId}&status=all&pageSize=100`)
        .set('Cookie', admin.cookie)
        .expect(200)
    ).body.items as Task[];

  // La două săptămâni, de azi: în orizontul de 60 de zile intră 5 apariții (0, 14, 28, 42, 56).
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
    ).body as { id: string };

  /** Aceeași generare pe care o rulează worker-ul din oră în oră. */
  const workerRun = (day = today) =>
    generateObligationTasks(t.prisma.db, { today: day, horizonDays: HORIZON });

  /** Nicio apariție a unei obligații nu are voie să existe de două ori. */
  const expectNoDuplicates = async () => {
    const rows = await t.prisma.db.task.findMany({
      where: { obligationId: { not: null } },
      select: { obligationId: true, occurrenceDate: true },
    });
    const keys = rows.map(
      (row) => `${row.obligationId}:${row.occurrenceDate?.toISOString().slice(0, 10)}`,
    );
    expect(new Set(keys).size).toBe(keys.length);
  };

  describe('modificarea frecvenței unei obligații active', () => {
    it('păstrează task-urile ale căror termene rămân în program și le înlocuiește pe celelalte', async () => {
      const obligation = await createObligation();
      const before = await tasksOf(obligation.id);
      const [first, second, third] = before;
      await patch(`/api/tasks/${first!.id}`, ana.cookie, { status: 'DONE' }).expect(200);
      // Task-ul de peste 28 de zile primește o oră și este preluat de un coleg.
      await patch(`/api/tasks/${third!.id}`, ana.cookie, {
        startTime: '09:00',
        assigneeId: dan.id,
      }).expect(200);

      // Din „la 2 săptămâni” în „la 4 săptămâni”: rămân termenele 0, 28 și 56.
      await patch(`/api/obligations/${obligation.id}`, ana.cookie, {
        recurrenceInterval: 4,
      }).expect(200);

      const after = await tasksOf(obligation.id);
      expect(after.map((task) => [task.dueDate, task.status])).toEqual([
        [today, 'DONE'],
        [addDays(today, 28), 'TODO'],
        [addDays(today, 56), 'TODO'],
      ]);
      // Task-ul de la 28 de zile este același, cu ora și preluarea păstrate – nu unul recreat.
      expect(after[1]).toMatchObject({
        id: third!.id,
        startTime: '09:00',
        assignee: { id: dan.id },
      });
      expect(after.some((task) => task.id === second!.id)).toBe(false);
      await expectNoDuplicates();
    });

    it('revenirea la frecvența inițială și rulările worker-ului nu produc duplicate', async () => {
      const obligation = await createObligation();
      await patch(`/api/obligations/${obligation.id}`, ana.cookie, {
        recurrenceUnit: 'MONTH',
        recurrenceInterval: 1,
      }).expect(200);
      await workerRun();
      await patch(`/api/obligations/${obligation.id}`, ana.cookie, {
        recurrenceUnit: 'WEEK',
        recurrenceInterval: 2,
      }).expect(200);
      await workerRun();
      await workerRun();

      expect((await tasksOf(obligation.id)).map((task) => task.dueDate)).toEqual(
        [0, 14, 28, 42, 56].map((days) => addDays(today, days)),
      );
      await expectNoDuplicates();
    });

    it('nu atinge task-urile începute, finalizate, anulate sau restante', async () => {
      const obligation = await createObligation();
      const [first, second, third] = await tasksOf(obligation.id);
      await patch(`/api/tasks/${first!.id}`, ana.cookie, { status: 'IN_PROGRESS' }).expect(200);
      await patch(`/api/tasks/${second!.id}`, ana.cookie, { status: 'CANCELLED' }).expect(200);
      // O restanță: un task generat mai demult, încă neînceput.
      const overdue = await t.prisma.db.task.create({
        data: {
          title: 'Deplasare periodică',
          dueDate: new Date(`${addDays(today, -14)}T00:00:00Z`),
          occurrenceDate: new Date(`${addDays(today, -14)}T00:00:00Z`),
          obligationId: obligation.id,
          clientId,
          assigneeId: ana.id,
          searchText: 'deplasare periodica',
        },
      });

      // „La 3 săptămâni”: termenele noi sunt 0, 21 și 42.
      await patch(`/api/obligations/${obligation.id}`, ana.cookie, {
        recurrenceInterval: 3,
      }).expect(200);

      const after = await tasksOf(obligation.id);
      expect(after.map((task) => [task.dueDate, task.status])).toEqual([
        [addDays(today, -14), 'TODO'],
        [today, 'IN_PROGRESS'],
        [addDays(today, 14), 'CANCELLED'],
        [addDays(today, 21), 'TODO'],
        [addDays(today, 42), 'TODO'],
      ]);
      expect(after[0]!.id).toBe(overdue.id);
      expect(after.some((task) => task.id === third!.id)).toBe(false);
      await expectNoDuplicates();
    });
  });

  describe('dezactivarea unei obligații', () => {
    it('retrage doar task-urile viitoare neîncepute; worker-ul nu le recreează', async () => {
      const obligation = await createObligation();
      const [first, second] = await tasksOf(obligation.id);
      await patch(`/api/tasks/${first!.id}`, ana.cookie, { status: 'DONE' }).expect(200);
      await patch(`/api/tasks/${second!.id}`, ana.cookie, { status: 'IN_PROGRESS' }).expect(200);

      await patch(`/api/obligations/${obligation.id}`, ana.cookie, { isActive: false }).expect(200);
      expect(await workerRun()).toBe(0);
      expect(await workerRun(addDays(today, 30))).toBe(0);
      expect((await tasksOf(obligation.id)).map((task) => task.status)).toEqual([
        'DONE',
        'IN_PROGRESS',
      ]);
    });

    it('reactivarea reia programul de azi încolo, fără duplicate', async () => {
      const obligation = await createObligation();
      const [first] = await tasksOf(obligation.id);
      await patch(`/api/tasks/${first!.id}`, ana.cookie, { status: 'DONE' }).expect(200);
      await patch(`/api/obligations/${obligation.id}`, ana.cookie, { isActive: false }).expect(200);
      await patch(`/api/obligations/${obligation.id}`, ana.cookie, { isActive: true }).expect(200);
      await workerRun();

      const tasks = await tasksOf(obligation.id);
      expect(tasks.map((task) => task.status)).toEqual(['DONE', 'TODO', 'TODO', 'TODO', 'TODO']);
      expect(tasks[0]!.id).toBe(first!.id);
      await expectNoDuplicates();
    });
  });

  describe('schimbarea responsabilului', () => {
    it('noul responsabil primește task-urile neîncepute ale celui vechi, nu și pe cele preluate de un coleg', async () => {
      const obligation = await createObligation();
      const [first, second, third] = await tasksOf(obligation.id);
      await patch(`/api/tasks/${first!.id}`, ana.cookie, { status: 'DONE' }).expect(200);
      await patch(`/api/tasks/${second!.id}`, ana.cookie, { status: 'IN_PROGRESS' }).expect(200);
      // Administratorul preia o singură deplasare.
      await patch(`/api/tasks/${third!.id}`, ana.cookie, { assigneeId: admin.id }).expect(200);

      await patch(`/api/obligations/${obligation.id}`, ana.cookie, { assigneeId: dan.id }).expect(
        200,
      );
      await workerRun();

      expect((await tasksOf(obligation.id)).map((task) => task.assignee?.id)).toEqual([
        ana.id, // finalizat – istoricul rămâne
        ana.id, // început – rămâne la cine l-a început
        admin.id, // preluat de un coleg
        dan.id,
        dan.id,
      ]);
      await expectNoDuplicates();
    });

    it('o modificare fără legătură (titlul) nu anulează preluarea unei deplasări', async () => {
      const obligation = await createObligation();
      const [, second] = await tasksOf(obligation.id);
      await patch(`/api/tasks/${second!.id}`, ana.cookie, { assigneeId: dan.id }).expect(200);

      await patch(`/api/obligations/${obligation.id}`, ana.cookie, { title: 'Alt titlu' }).expect(
        200,
      );

      const tasks = await tasksOf(obligation.id);
      expect(tasks.map((task) => task.assignee?.id)).toEqual([
        ana.id,
        dan.id,
        ana.id,
        ana.id,
        ana.id,
      ]);
    });

    it('predarea definitivă a clientului mută obligația și task-urile deschise, o singură dată', async () => {
      const obligation = await createObligation();
      const [first] = await tasksOf(obligation.id);
      await patch(`/api/tasks/${first!.id}`, ana.cookie, { status: 'DONE' }).expect(200);

      await post(`/api/clients/${clientId}/transfer`, admin.cookie, {
        fromUserId: ana.id,
        toUserId: dan.id,
      }).expect(200);
      await workerRun();
      // A doua zi worker-ul adaugă cel mult termenele noi intrate în orizont, pentru noul responsabil.
      await workerRun(addDays(today, 14));

      const tasks = await tasksOf(obligation.id);
      expect(tasks.map((task) => task.assignee?.id)).toEqual([
        ana.id,
        dan.id,
        dan.id,
        dan.id,
        dan.id,
        dan.id,
      ]);
      await expectNoDuplicates();
    });
  });

  describe('task-uri anulate manual', () => {
    it('o apariție anulată nu este regenerată de nicio operațiune ulterioară', async () => {
      const obligation = await createObligation();
      const [, second] = await tasksOf(obligation.id);
      await patch(`/api/tasks/${second!.id}`, ana.cookie, { status: 'CANCELLED' }).expect(200);
      const cancelledDate = addDays(today, 14);

      const stillCancelledOnce = async () => {
        const sameDay = (await tasksOf(obligation.id)).filter(
          (task) => task.dueDate === cancelledDate,
        );
        expect(sameDay.map((task) => [task.id, task.status])).toEqual([[second!.id, 'CANCELLED']]);
      };

      await workerRun();
      await stillCancelledOnce();

      await patch(`/api/obligations/${obligation.id}`, ana.cookie, { title: 'Alt titlu' }).expect(
        200,
      );
      await stillCancelledOnce();

      // Schimbarea frecvenței păstrează termenul de la 14 zile în program („săptămânal”).
      await patch(`/api/obligations/${obligation.id}`, ana.cookie, {
        recurrenceInterval: 1,
      }).expect(200);
      await stillCancelledOnce();

      await patch(`/api/obligations/${obligation.id}`, ana.cookie, { isActive: false }).expect(200);
      await patch(`/api/obligations/${obligation.id}`, ana.cookie, { isActive: true }).expect(200);
      await stillCancelledOnce();

      await patch(`/api/clients/${clientId}`, ana.cookie, { isActive: false }).expect(200);
      await patch(`/api/clients/${clientId}`, ana.cookie, { isActive: true }).expect(200);
      await workerRun();
      await stillCancelledOnce();
      await expectNoDuplicates();
    });

    it('un task generat nu poate fi șters (ar fi recreat), iar unul reprogramat nu este dublat', async () => {
      const obligation = await createObligation();
      const [first, second] = await tasksOf(obligation.id);
      await del(`/api/tasks/${first!.id}`, ana.cookie).expect(400);

      // Reprogramat cu trei zile mai târziu: termenul inițial nu primește un task nou.
      await patch(`/api/tasks/${second!.id}`, ana.cookie, { dueDate: addDays(today, 17) }).expect(
        200,
      );
      await workerRun();
      expect((await tasksOf(obligation.id)).map((task) => task.dueDate)).toEqual(
        [0, 17, 28, 42, 56].map((days) => addDays(today, days)),
      );
    });

    it('task-urile manuale se pot șterge doar cât timp nu au fost începute', async () => {
      const create = async () =>
        (
          await post('/api/tasks', ana.cookie, {
            title: 'Sună clientul',
            dueDate: today,
            clientId,
          }).expect(201)
        ).body as { id: string };

      const mistake = await create();
      await del(`/api/tasks/${mistake.id}`, ana.cookie).expect(204);

      const done = await create();
      await patch(`/api/tasks/${done.id}`, ana.cookie, { status: 'DONE' }).expect(200);
      const response = await del(`/api/tasks/${done.id}`, ana.cookie).expect(400);
      expect(response.body.message).toContain('rămân în evidență');
      expect(await t.prisma.db.task.count()).toBe(1);
    });
  });

  describe('apariții sărite (clientul a fost ratat luna trecută)', () => {
    const get = (url: string, cookie: string) => t.http().get(url).set('Cookie', cookie);
    /** O apariție mai veche a obligației, rămasă nebifată. */
    const pastOccurrence = (obligationId: string, daysAgo: number, status = 'TODO') =>
      t.prisma.db.task.create({
        data: {
          title: 'Deplasare periodică',
          kind: 'VISIT',
          status: status as 'TODO',
          dueDate: new Date(`${addDays(today, -daysAgo)}T00:00:00Z`),
          occurrenceDate: new Date(`${addDays(today, -daysAgo)}T00:00:00Z`),
          obligationId,
          clientId,
          assigneeId: ana.id,
          searchText: 'deplasare periodica',
        },
      });

    it('la finalizare sunt găsite aparițiile anterioare nebifate ale aceleiași obligații', async () => {
      const obligation = await createObligation();
      const other = await createObligation({ title: 'Altă obligație' });
      const [current, next] = await tasksOf(obligation.id);
      const older = await pastOccurrence(obligation.id, 28);
      const newer = await pastOccurrence(obligation.id, 14);
      await pastOccurrence(obligation.id, 42, 'DONE');
      await pastOccurrence(obligation.id, 56, 'CANCELLED');
      await pastOccurrence(other.id, 14);

      const skipped = await get(`/api/tasks/${current!.id}/skipped`, ana.cookie).expect(200);
      expect(skipped.body.map((task: Task) => task.id)).toEqual([older.id, newer.id]);

      // Pentru apariția următoare, și cea de azi contează ca sărită cât timp nu este bifată.
      const forNext = await get(`/api/tasks/${next!.id}/skipped`, ana.cookie).expect(200);
      expect(forNext.body).toHaveLength(3);
      // Cea mai veche nu are nimic înaintea ei.
      expect((await get(`/api/tasks/${older.id}/skipped`, ana.cookie)).body).toEqual([]);
    });

    it('bifate împreună, toate rămân finalizate și nu mai apar ca restanțe', async () => {
      const obligation = await createObligation();
      const [current] = await tasksOf(obligation.id);
      const missed = await pastOccurrence(obligation.id, 14);
      const before = await get('/api/tasks/overview?scope=mine', ana.cookie).expect(200);
      expect(before.body.counts.overdue).toBe(1);

      // Exact ce face interfața când utilizatorul confirmă: întâi cea sărită, apoi cea curentă.
      for (const id of [missed.id, current!.id]) {
        await patch(`/api/tasks/${id}`, ana.cookie, {
          status: 'DONE',
          sheetsCompleted: true,
        }).expect(200);
      }
      await workerRun();

      const after = await get('/api/tasks/overview?scope=mine', ana.cookie).expect(200);
      expect(after.body.counts).toMatchObject({ overdue: 0, dueToday: 0 });
      const tasks = await tasksOf(obligation.id);
      expect(tasks.slice(0, 2).map((task) => task.status)).toEqual(['DONE', 'DONE']);
      expect((await get(`/api/tasks/${current!.id}/skipped`, ana.cookie)).body).toEqual([]);
      // Fiecare are propria intrare în istoric, cu cine și când a bifat-o.
      const history = await get(`/api/tasks/${missed.id}/history`, ana.cookie).expect(200);
      expect(history.body[0]).toMatchObject({ user: { id: ana.id } });
      await expectNoDuplicates();
    });

    it('task-urile fără obligație nu au apariții sărite, iar accesul rămâne cel obișnuit', async () => {
      const manual = (
        await post('/api/tasks', ana.cookie, { title: 'Sună clientul', dueDate: today }).expect(201)
      ).body as { id: string };
      expect((await get(`/api/tasks/${manual.id}/skipped`, ana.cookie)).body).toEqual([]);

      const obligation = await createObligation();
      const [current] = await tasksOf(obligation.id);
      await pastOccurrence(obligation.id, 14);
      // Dan nu are acces la client: nu vede nici task-ul…
      await get(`/api/tasks/${current!.id}/skipped`, dan.cookie).expect(404);
      // …iar dacă preia doar deplasarea de azi, nu vede aparițiile vechi ale colegei.
      await patch(`/api/tasks/${current!.id}`, ana.cookie, { assigneeId: dan.id }).expect(200);
      expect((await get(`/api/tasks/${current!.id}/skipped`, dan.cookie)).body).toEqual([]);
    });
  });

  describe('arhivarea clientului', () => {
    it('suspendă obligațiile: retrage task-urile viitoare neîncepute și păstrează restul', async () => {
      const obligation = await createObligation();
      const [first, second] = await tasksOf(obligation.id);
      await patch(`/api/tasks/${first!.id}`, ana.cookie, { status: 'DONE' }).expect(200);
      await patch(`/api/tasks/${second!.id}`, ana.cookie, { status: 'IN_PROGRESS' }).expect(200);
      const manual = (
        await post('/api/tasks', ana.cookie, {
          title: 'Predare documente',
          dueDate: addDays(today, 5),
          clientId,
        }).expect(201)
      ).body as { id: string };

      await patch(`/api/clients/${clientId}`, ana.cookie, { isActive: false }).expect(200);
      expect(await workerRun()).toBe(0);

      // Rămân: ce s-a făcut, ce este în lucru și task-ul creat manual.
      const remaining = await t.prisma.db.task.findMany({ orderBy: { dueDate: 'asc' } });
      expect(remaining.map((task) => [task.id, task.status])).toEqual([
        [first!.id, 'DONE'],
        [manual.id, 'TODO'],
        [second!.id, 'IN_PROGRESS'],
      ]);

      await patch(`/api/clients/${clientId}`, ana.cookie, { isActive: true }).expect(200);
      expect((await tasksOf(obligation.id)).map((task) => task.status)).toEqual([
        'DONE',
        'IN_PROGRESS',
        'TODO',
        'TODO',
        'TODO',
      ]);
      await expectNoDuplicates();
    });
  });

  describe('rulări simultane', () => {
    it('generarea simultană din mai multe locuri creează fiecare task o singură dată', async () => {
      const obligation = await createObligation({ recurrenceUnit: 'DAY', recurrenceInterval: 1 });
      await t.prisma.db.task.deleteMany({});

      const created = await Promise.all(Array.from({ length: 6 }, () => workerRun()));

      expect(created.reduce((sum, count) => sum + count, 0)).toBe(HORIZON + 1);
      expect(await tasksOf(obligation.id)).toHaveLength(HORIZON + 1);
      await expectNoDuplicates();
    });

    it('modificări și generări care se suprapun lasă exact programul final', async () => {
      const obligation = await createObligation();
      await Promise.all([
        workerRun(),
        patch(`/api/obligations/${obligation.id}`, ana.cookie, { recurrenceInterval: 4 }).expect(
          200,
        ),
        workerRun(),
        workerRun(),
      ]);
      await workerRun();

      expect((await tasksOf(obligation.id)).map((task) => task.dueDate)).toEqual(
        [0, 28, 56].map((days) => addDays(today, days)),
      );
      await expectNoDuplicates();
    });

    it('o generare pornită în timpul unei modificări așteaptă și folosește datele noi', async () => {
      const obligation = await createObligation();
      let generation: Promise<number> | undefined;

      // O modificare a frecvenței aflată încă în tranzacție (necomisă) în momentul în care
      // pornește rularea periodică.
      await t.prisma.db.$transaction(async (tx) => {
        await lockObligations(tx, { obligationId: obligation.id });
        await tx.obligation.update({
          where: { id: obligation.id },
          data: { recurrenceInterval: 4 },
        });
        await tx.task.deleteMany({ where: { obligationId: obligation.id } });
        generation = workerRun();
        await new Promise((resolve) => setTimeout(resolve, 300));
      });
      await generation;

      // Fără blocaj, rularea ar fi recreat termenele vechi (14 și 42 de zile).
      expect((await tasksOf(obligation.id)).map((task) => task.dueDate)).toEqual(
        [0, 28, 56].map((days) => addDays(today, days)),
      );
    });
  });
});
