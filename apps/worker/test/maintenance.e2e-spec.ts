import type { Queue } from 'bullmq';
import { createPrismaClient, type PrismaClient } from '@alconst/database';
import { addDays, type MailJobData, todayIn } from '@alconst/shared';
import { WorkerConfig } from '../src/config/worker-config.js';
import { MaintenanceService } from '../src/maintenance/maintenance.service.js';
import { TEST_DATABASE_URL } from './global-setup.js';

const toDate = (value: string) => new Date(`${value}T00:00:00.000Z`);

describe('Rularea periodică (integrare cu baza de date)', () => {
  let db: PrismaClient;
  let service: MaintenanceService;
  let mails: MailJobData[];
  let ana: string;
  let dan: string;
  let clientId: string;

  // 09:00 UTC este în aceeași zi calendaristică și la București (11:00 sau 12:00).
  const utcDay = new Date().toISOString().slice(0, 10);
  const midday = new Date(`${utcDay}T09:00:00Z`);
  const earlyMorning = new Date(`${utcDay}T02:00:00Z`);
  const today = todayIn('Europe/Bucharest', midday);

  const config = Object.assign(new WorkerConfig(), {
    appUrl: 'https://app.test',
    timeZone: 'Europe/Bucharest',
    taskHorizonDays: 60,
  });

  beforeAll(() => {
    db = createPrismaClient(TEST_DATABASE_URL);
  });
  afterAll(() => db.$disconnect());

  beforeEach(async () => {
    await db.$executeRawUnsafe(
      'TRUNCATE TABLE "activity_logs", "password_reset_tokens", "sessions", "notifications", "tasks", "obligations", "clients", "services", "users", "worker_heartbeats" CASCADE',
    );
    mails = [];
    const fakeQueue = {
      add: (_name: string, data: MailJobData) => {
        mails.push(data);
        return Promise.resolve();
      },
    } as unknown as Queue<MailJobData>;
    service = new MaintenanceService(db, config, fakeQueue);

    const user = (email: string, firstName: string) =>
      db.user.create({
        data: { email, firstName, lastName: 'Test', passwordHash: 'x', role: 'EMPLOYEE' },
      });
    ana = (await user('ana@test.ro', 'Ana')).id;
    dan = (await user('dan@test.ro', 'Dan')).id;
    clientId = (
      await db.client.create({
        data: {
          name: 'SC Exemplu SRL',
          cui: '123',
          searchText: 'sc exemplu srl',
          assignments: { create: { userId: dan } },
        },
      })
    ).id;
  });

  const task = (title: string, dueDate: string, assigneeId: string | null = ana) =>
    db.task.create({
      data: { title, dueDate: toDate(dueDate), assigneeId, clientId, searchText: title },
    });

  it('generează task-urile obligațiilor active, fără duplicate la rulări repetate', async () => {
    await db.obligation.create({
      data: {
        title: 'Deplasare lunară',
        kind: 'VISIT',
        clientId,
        assigneeId: ana,
        recurrenceUnit: 'WEEK',
        recurrenceInterval: 2,
        startDate: toDate(today),
        searchText: 'deplasare lunara',
      },
    });
    await db.obligation.create({
      data: {
        title: 'Inactivă',
        recurrenceUnit: 'DAY',
        startDate: toDate(today),
        isActive: false,
        searchText: 'inactiva',
      },
    });

    expect((await service.run(midday)).tasksGenerated).toBe(5);
    expect((await service.run(midday)).tasksGenerated).toBe(0);
    expect(await db.task.count()).toBe(5);
  });

  it('nu generează task-uri pentru clienții dezactivați', async () => {
    await db.client.update({ where: { id: clientId }, data: { isActive: false } });
    await db.obligation.create({
      data: {
        title: 'X',
        clientId,
        recurrenceUnit: 'WEEK',
        startDate: toDate(today),
        searchText: 'x',
      },
    });
    expect((await service.run(midday)).tasksGenerated).toBe(0);
  });

  it('creează reamintirile o singură dată și le trimite destinatarului potrivit', async () => {
    await task('Restant', addDays(today, -3));
    await task('Azi', today);
    await task('Curând', addDays(today, 2));
    await task('Departe', addDays(today, 20));
    await task('Fără responsabil', today, null);
    await db.task.create({
      data: {
        title: 'Finalizat',
        dueDate: toDate(today),
        assigneeId: ana,
        status: 'DONE',
        searchText: 'finalizat',
      },
    });

    expect((await service.run(midday)).notificationsCreated).toBe(4);
    expect((await service.run(midday)).notificationsCreated).toBe(0);

    const anas = await db.notification.findMany({
      where: { userId: ana },
      orderBy: { type: 'asc' },
    });
    expect(anas.map((n) => [n.type, n.body])).toEqual([
      ['TASK_DUE_SOON', 'Curând · SC Exemplu SRL · în 2 zile'],
      ['TASK_DUE_TODAY', 'Azi · SC Exemplu SRL'],
      ['TASK_OVERDUE', expect.stringContaining('Restant · SC Exemplu SRL · termen')],
    ]);
    // Task-ul fără responsabil ajunge la responsabilul clientului.
    const dans = await db.notification.findMany({ where: { userId: dan } });
    expect(dans.map((n) => n.body)).toEqual(['Fără responsabil · SC Exemplu SRL']);
  });

  it('trimite cel mult un rezumat pe zi, doar după ora 7 și doar celor care îl doresc', async () => {
    await task('Restant', addDays(today, -1));
    await task('Azi', today);
    await task('Al lui Dan', today, dan);
    await db.notificationSettings.create({ data: { userId: dan, emailEnabled: false } });

    expect((await service.run(earlyMorning)).digestsQueued).toBe(0);
    expect((await service.run(midday)).digestsQueued).toBe(1);
    expect(mails).toEqual([
      {
        kind: 'task-digest',
        to: 'ana@test.ro',
        firstName: 'Ana',
        overdueCount: 1,
        dueTodayCount: 1,
        dueSoonCount: 0,
        appUrl: 'https://app.test',
      },
    ]);

    await task('Încă unul', today);
    expect((await service.run(midday)).digestsQueued).toBe(0);
    expect(mails).toHaveLength(1);
  });

  it('nu trimite rezumat dacă nu există reamintiri noi', async () => {
    await task('Departe', addDays(today, 20));
    expect((await service.run(midday)).digestsQueued).toBe(0);
  });

  it('își notează fiecare rulare reușită, pentru avertizarea administratorilor', async () => {
    expect(await db.workerHeartbeat.count()).toBe(0);
    const before = Date.now();
    await service.run(midday);
    await service.run(midday);

    const heartbeats = await db.workerHeartbeat.findMany();
    expect(heartbeats).toHaveLength(1);
    expect(heartbeats[0]).toMatchObject({
      name: 'maintenance',
      details: { tasksGenerated: 0, notificationsCreated: 0, digestsQueued: 0 },
    });
    // Momentul real al rulării, nu cel simulat în test.
    expect(heartbeats[0]!.lastRunAt.getTime()).toBeGreaterThanOrEqual(before);
  });

  it('șterge sesiunile expirate și păstrează restul', async () => {
    const session = (tokenHash: string, expiresAt: Date) =>
      db.session.create({ data: { tokenHash, userId: ana, expiresAt } });
    await session('expirata', new Date(midday.getTime() - 1000));
    await session('valida', new Date(midday.getTime() + 60_000));
    await service.run(midday);
    expect((await db.session.findMany()).map((s) => s.tokenHash)).toEqual(['valida']);
  });
});
