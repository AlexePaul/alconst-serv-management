import type { Queue } from 'bullmq';
import { createPrismaClient, type PrismaClient } from '@alconst/database';
import { addDays, diffDays, type MailJobData, startOfWeek, todayIn } from '@alconst/shared';
import { WorkerConfig } from '../src/config/worker-config.js';
import { MaintenanceService } from '../src/maintenance/maintenance.service.js';
import { TEST_DATABASE_URL } from './global-setup.js';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const TZ = 'Europe/Bucharest';
const HORIZON = 60;

const toDate = (value: string) => new Date(`${value}T00:00:00.000Z`);
const toDateOnly = (value: Date) => value.toISOString().slice(0, 10);

/**
 * Rularea periodică în condiții neobișnuite: worker oprit mai multe zile, rulări din oră în oră
 * peste schimbarea orei de vară/iarnă, responsabil cu contul dezactivat.
 * Timpul este simulat prin parametrul `now` al rulării.
 */
describe('Robustețea rulării periodice (integrare cu baza de date)', () => {
  let db: PrismaClient;
  let service: MaintenanceService;
  let mails: MailJobData[];
  let admin: string;
  let ana: string;
  let dan: string;
  let clientId: string;

  const config = Object.assign(new WorkerConfig(), {
    appUrl: 'https://app.test',
    timeZone: TZ,
    taskHorizonDays: HORIZON,
  });

  beforeAll(() => {
    db = createPrismaClient(TEST_DATABASE_URL);
  });
  afterAll(() => db.$disconnect());

  beforeEach(async () => {
    await db.$executeRawUnsafe(
      'TRUNCATE TABLE "activity_logs", "password_reset_tokens", "sessions", "notifications", "tasks", "obligations", "clients", "services", "users" CASCADE',
    );
    mails = [];
    const fakeQueue = {
      add: (_name: string, data: MailJobData) => {
        mails.push(data);
        return Promise.resolve();
      },
    } as unknown as Queue<MailJobData>;
    service = new MaintenanceService(db, config, fakeQueue);

    const user = (email: string, role: 'ADMIN' | 'EMPLOYEE') =>
      db.user.create({
        data: { email, firstName: email, lastName: 'Test', passwordHash: 'x', role },
      });
    admin = (await user('admin@test.ro', 'ADMIN')).id;
    ana = (await user('ana@test.ro', 'EMPLOYEE')).id;
    dan = (await user('dan@test.ro', 'EMPLOYEE')).id;
    // Administratorul și Dan nu primesc rezumat pe email, ca numărătoarea să o privească doar pe Ana.
    await db.notificationSettings.createMany({
      data: [
        { userId: admin, emailEnabled: false },
        { userId: dan, emailEnabled: false },
      ],
    });
    clientId = (
      await db.client.create({
        data: {
          name: 'SC Exemplu SRL',
          cui: '123',
          searchText: 'sc exemplu srl',
          assignments: { create: { userId: ana } },
        },
      })
    ).id;
  });

  const obligation = (
    title: string,
    unit: 'DAY' | 'WEEK' | 'MONTH',
    startDate: string,
    interval = 1,
  ) =>
    db.obligation.create({
      data: {
        title,
        kind: 'VISIT',
        clientId,
        assigneeId: ana,
        recurrenceUnit: unit,
        recurrenceInterval: interval,
        startDate: toDate(startDate),
        searchText: title.toLowerCase(),
      },
    });

  const datesOf = async (obligationId: string) =>
    (
      await db.task.findMany({
        where: { obligationId },
        orderBy: { dueDate: 'asc' },
        select: { dueDate: true },
      })
    ).map((task) => toDateOnly(task.dueDate));

  const expectConsecutiveDays = (dates: string[], from: string, to: string) => {
    expect(dates).toHaveLength(diffDays(from, to) + 1);
    dates.forEach((date, index) => expect(date).toBe(addDays(from, index)));
  };

  const countByType = async (userId: string) => {
    const groups = await db.notification.groupBy({
      by: ['type'],
      where: { userId },
      _count: { _all: true },
    });
    return Object.fromEntries(groups.map((group) => [group.type, group._count._all]));
  };

  describe('worker oprit mai multe zile', () => {
    // 09:00 UTC este în aceeași zi calendaristică și la București.
    const now = new Date(`${new Date().toISOString().slice(0, 10)}T09:00:00Z`);
    const today = todayIn(TZ, now);
    const before = new Date(now.getTime() - 5 * DAY_MS);
    const lastRunDay = todayIn(TZ, before);

    it('la repornire nu se pierde și nu se dublează niciun termen', async () => {
      const daily = await obligation('Verificare zilnică', 'DAY', addDays(today, -30));
      const weekly = await obligation('Deplasare săptămânală', 'WEEK', addDays(today, -28));

      // Ultima rulare înainte de oprire, apoi cinci zile fără nicio rulare.
      await service.run(before);
      expectConsecutiveDays(await datesOf(daily.id), lastRunDay, addDays(lastRunDay, HORIZON));

      const resumed = await service.run(now);
      // Doar termenele intrate între timp în orizont sunt noi: 5 zilnice și cel mult unul săptămânal.
      expect(resumed.tasksGenerated).toBeGreaterThanOrEqual(5);
      expect(resumed.tasksGenerated).toBeLessThanOrEqual(6);
      expectConsecutiveDays(await datesOf(daily.id), lastRunDay, addDays(today, HORIZON));

      const weeklyDates = await datesOf(weekly.id);
      expect(new Set(weeklyDates).size).toBe(weeklyDates.length);
      weeklyDates.forEach((date, index) => expect(date).toBe(addDays(weeklyDates[0]!, index * 7)));
      // Termen flexibil: apariția din săptămâna ultimei rulări contează, chiar dacă ziua ei trecuse.
      expect(weeklyDates[0]! >= startOfWeek(lastRunDay)).toBe(true);
      expect(weeklyDates.at(-1)! > addDays(today, HORIZON - 7)).toBe(true);

      // O a treia rulare, imediat după, nu mai are nimic de făcut.
      expect((await service.run(now)).tasksGenerated).toBe(0);
    });

    it('termenele trecute în timpul opririi apar ca restanțe și sunt anunțate o singură dată', async () => {
      const daily = await obligation('Verificare zilnică', 'DAY', addDays(today, -30));
      await service.run(before);
      // Notificările dinaintea opririi au fost create acum cinci zile.
      await db.notification.updateMany({ data: { createdAt: before } });
      mails.length = 0;

      const resumed = await service.run(now);

      // Cele 5 zile ratate: task-urile există (generate în avans) și sunt acum restante.
      const overdue = await db.task.count({
        where: { obligationId: daily.id, status: 'TODO', dueDate: { lt: toDate(today) } },
      });
      expect(overdue).toBe(5);
      expect(await countByType(ana)).toEqual({
        TASK_OVERDUE: 5,
        TASK_DUE_TODAY: 2, // ziua ultimei rulări și ziua repornirii
        TASK_DUE_SOON: 6, // câte trei zile în avans, la fiecare dintre cele două rulări
      });
      // Un singur rezumat, cu situația de la repornire.
      expect(resumed.digestsQueued).toBe(1);
      expect(mails).toEqual([
        expect.objectContaining({
          kind: 'task-digest',
          overdueCount: 5,
          dueTodayCount: 1,
          dueSoonCount: 3,
        }),
      ]);

      const again = await service.run(new Date(now.getTime() + HOUR_MS));
      expect(again).toMatchObject({ notificationsCreated: 0, digestsQueued: 0 });
      expect(mails).toHaveLength(1);
    });
  });

  describe.each([
    {
      name: 'trecerea la ora de vară (29 martie 2026)',
      // De sâmbătă 00:05 până luni 23:05, ora României, din oră în oră.
      firstRun: '2026-03-27T22:05:00Z',
      days: ['2026-03-28', '2026-03-29', '2026-03-30'],
    },
    {
      name: 'trecerea la ora de iarnă (25 octombrie 2026)',
      firstRun: '2026-10-23T21:05:00Z',
      days: ['2026-10-24', '2026-10-25', '2026-10-26'],
    },
  ])('rulări din oră în oră peste $name', ({ firstRun, days }) => {
    const [saturday, sunday, monday] = days as [string, string, string];

    it('fiecare termen este generat o singură dată, în ziua corectă', async () => {
      const daily = await obligation('Verificare zilnică', 'DAY', addDays(saturday, -20));
      // Termene care cad chiar în ziua schimbării orei.
      const weekly = await obligation('Deplasare săptămânală', 'WEEK', addDays(sunday, -14));
      const monthly = await obligation('Instruire lunară', 'MONTH', addDays(sunday, 0));

      let generated = 0;
      const start = new Date(firstRun).getTime();
      const runs: string[] = [];
      for (let time = start; todayIn(TZ, new Date(time)) <= monday; time += HOUR_MS) {
        const now = new Date(time);
        runs.push(todayIn(TZ, now));
        generated += (await service.run(now)).tasksGenerated;
      }
      // Ziua de 23 de ore are 23 de rulări, cea de 25 de ore are 25.
      const runsOn = (day: string) => runs.filter((value) => value === day).length;
      expect(runsOn(saturday)).toBe(24);
      expect([23, 25]).toContain(runsOn(sunday));
      expect(runsOn(monday)).toBe(24);

      expectConsecutiveDays(await datesOf(daily.id), saturday, addDays(monday, HORIZON));
      const weeklyDates = await datesOf(weekly.id);
      expect(weeklyDates[0]).toBe(sunday);
      weeklyDates.forEach((date, index) => expect(date).toBe(addDays(sunday, index * 7)));
      expect((await datesOf(monthly.id))[0]).toBe(sunday);

      // Numărul de task-uri create în total coincide cu ce există: nimic dublat, nimic șters.
      expect(generated).toBe(await db.task.count());
      const occurrences = await db.task.findMany({
        select: { obligationId: true, occurrenceDate: true },
      });
      const keys = occurrences.map((row) => `${row.obligationId}:${row.occurrenceDate?.getTime()}`);
      expect(new Set(keys).size).toBe(keys.length);
    });

    it('reamintirile și rezumatul zilnic apar o singură dată pe zi', async () => {
      const daily = await obligation('Verificare zilnică', 'DAY', addDays(saturday, -20));
      const start = new Date(firstRun).getTime();
      for (let time = start; todayIn(TZ, new Date(time)) <= monday; time += HOUR_MS) {
        await service.run(new Date(time));
      }

      const dueToday = await db.notification.findMany({
        where: { userId: ana, type: 'TASK_DUE_TODAY' },
        include: { task: { select: { dueDate: true, obligationId: true } } },
      });
      // Câte o reamintire „termen astăzi” pentru fiecare dintre cele trei zile.
      expect(dueToday.map((item) => toDateOnly(item.task!.dueDate)).sort()).toEqual(days);
      expect(dueToday.every((item) => item.task!.obligationId === daily.id)).toBe(true);

      // Task-urile de sâmbătă și duminică, nefinalizate, devin restanțe: câte o notificare fiecare.
      const overdue = await db.notification.findMany({
        where: { userId: ana, type: 'TASK_OVERDUE' },
        include: { task: { select: { dueDate: true } } },
      });
      expect(overdue.map((item) => toDateOnly(item.task!.dueDate)).sort()).toEqual([
        saturday,
        sunday,
      ]);

      // Un rezumat pe zi, nici mai mult (ziua de 25 de ore), nici mai puțin (ziua de 23 de ore).
      expect(mails.filter((mail) => mail.kind === 'task-digest')).toHaveLength(3);
      const settings = await db.notificationSettings.findUnique({ where: { userId: ana } });
      expect(toDateOnly(settings!.lastDigestDate!)).toBe(monday);
    });
  });

  describe('obligație lunară cu termen flexibil', () => {
    const at = (iso: string) => new Date(iso);

    it('luna în curs este „la timp” până la sfârșitul ei, apoi devine restanță', async () => {
      // Deplasare lunară în jurul datei de 5, introdusă cu o dată de început din ianuarie.
      const visit = await obligation('Deplasare lunară', 'MONTH', '2026-01-05');

      // 20 martie: lunile trecute nu se generează; martie da, deși data de 5 a trecut.
      await service.run(at('2026-03-20T09:00:00Z'));
      expect(await datesOf(visit.id)).toEqual(['2026-03-05', '2026-04-05', '2026-05-05']);
      const march = await db.task.findFirstOrThrow({
        where: { obligationId: visit.id, dueDate: toDate('2026-03-05') },
      });
      expect([toDateOnly(march.periodStart!), toDateOnly(march.periodEnd!)]).toEqual([
        '2026-03-01',
        '2026-03-31',
      ]);
      // Nicio restanță anunțată: mai sunt 11 zile din lună.
      expect(await countByType(ana)).toEqual({});

      // 29 martie: se apropie sfârșitul lunii.
      await service.run(at('2026-03-29T09:00:00Z'));
      expect(await countByType(ana)).toEqual({ TASK_DUE_SOON: 1 });
      // 31 martie: ultima zi.
      await service.run(at('2026-03-31T09:00:00Z'));
      expect(await countByType(ana)).toEqual({ TASK_DUE_SOON: 1, TASK_DUE_TODAY: 1 });
      expect(await db.notification.count({ where: { type: 'TASK_OVERDUE' } })).toBe(0);

      // 1 aprilie: martie a rămas nefăcută → restanță; aprilie este o perioadă nouă.
      await service.run(at('2026-04-01T09:00:00Z'));
      const overdue = await db.notification.findMany({ where: { type: 'TASK_OVERDUE' } });
      expect(overdue.map((item) => item.taskId)).toEqual([march.id]);

      // Făcută în aprilie, împreună cu cea din aprilie: nu se mai generează nimic pentru martie.
      await db.task.updateMany({
        where: { obligationId: visit.id, dueDate: { lte: toDate('2026-04-05') } },
        data: { status: 'DONE' },
      });
      await service.run(at('2026-04-10T09:00:00Z'));
      expect(await datesOf(visit.id)).toEqual([
        '2026-03-05',
        '2026-04-05',
        '2026-05-05',
        '2026-06-05',
      ]);
    });
  });

  describe('responsabil cu contul dezactivat', () => {
    const now = new Date(`${new Date().toISOString().slice(0, 10)}T09:00:00Z`);
    const today = todayIn(TZ, now);
    const dueToday = (assigneeId: string | null) =>
      db.task.create({
        data: {
          title: 'Deplasare',
          dueDate: toDate(today),
          assigneeId,
          clientId,
          searchText: 'deplasare',
        },
      });

    it('reamintirea ajunge la responsabilii activi ai clientului, apoi la administratori', async () => {
      await db.clientAssignment.create({ data: { clientId, userId: dan } });
      await dueToday(ana);
      await db.user.update({ where: { id: ana }, data: { isActive: false } });

      await service.run(now);
      expect(await countByType(ana)).toEqual({});
      expect(await countByType(dan)).toEqual({ TASK_DUE_TODAY: 1 });
      expect(await countByType(admin)).toEqual({});

      // Nici clientul nu mai are un responsabil activ: termenul ajunge la administrator.
      await db.user.update({ where: { id: dan }, data: { isActive: false } });
      await dueToday(ana);
      await service.run(now);
      expect(await countByType(admin)).toEqual({ TASK_DUE_TODAY: 2 });
    });
  });
});
