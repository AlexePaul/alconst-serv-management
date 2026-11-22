import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { generateObligationTasks, type PrismaClient } from '@alconst/database';
import {
  addDays,
  DEFAULT_NOTIFICATION_SETTINGS,
  formatTimeRange,
  hourIn,
  MAINTENANCE_HEARTBEAT,
  type MailJobData,
  MAX_REMIND_DAYS_BEFORE,
  type PushJobData,
  QUEUE_MAIL,
  QUEUE_PUSH,
  todayIn,
} from '@alconst/shared';
import { WorkerConfig } from '../config/worker-config.js';
import { PUSH_FROM_HOUR, PUSH_UNTIL_HOUR, reminderPushPayload } from '../push/reminder-push.js';
import { planReminders } from './reminders.js';

export const PRISMA = Symbol('PRISMA');

const DAY_MS = 24 * 60 * 60 * 1000;
/** Rezumatul pe email se trimite după această oră locală, o singură dată pe zi. */
const DIGEST_FROM_HOUR = 7;
/** Notificările citite se păstrează atât timp. */
const READ_NOTIFICATION_RETENTION_DAYS = 90;

/** Câte minute au trecut de la miezul nopții, în fusul orar dat. */
function minutesSinceMidnight(timeZone: string, now: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return value('hour') * 60 + value('minute');
}

const toDate = (value: string) => new Date(`${value}T00:00:00.000Z`);
const toDateOnly = (value: Date) => value.toISOString().slice(0, 10);

export interface MaintenanceResult {
  tasksGenerated: number;
  notificationsCreated: number;
  digestsQueued: number;
  pushesQueued: number;
}

const REMINDER_TYPES = ['TASK_OVERDUE', 'TASK_DUE_TODAY', 'TASK_DUE_SOON'];

/**
 * Activitățile periodice ale aplicației. Rulează din oră în oră și sunt idempotente:
 * o rulare repetată sau una ratată nu produce duplicate și nu pierde nimic.
 */
@Injectable()
export class MaintenanceService {
  private readonly logger = new Logger(MaintenanceService.name);

  constructor(
    @Inject(PRISMA) private readonly db: PrismaClient,
    private readonly config: WorkerConfig,
    @InjectQueue(QUEUE_MAIL) private readonly mailQueue: Queue<MailJobData>,
    @InjectQueue(QUEUE_PUSH) private readonly pushQueue: Queue<PushJobData>,
  ) {}

  async run(now: Date = new Date()): Promise<MaintenanceResult> {
    const today = todayIn(this.config.timeZone, now);

    const tasksGenerated = await generateObligationTasks(this.db, {
      today,
      horizonDays: this.config.taskHorizonDays,
    });
    const notificationsCreated = await this.createReminders(today);
    const digestsQueued =
      hourIn(this.config.timeZone, now) >= DIGEST_FROM_HOUR
        ? await this.queueDigests(today, now)
        : 0;
    const hour = hourIn(this.config.timeZone, now);
    const pushesQueued =
      hour >= PUSH_FROM_HOUR && hour < PUSH_UNTIL_HOUR ? await this.queueReminderPushes(now) : 0;
    await this.cleanup(now);

    const result = { tasksGenerated, notificationsCreated, digestsQueued, pushesQueued };
    // Semn de viață pentru administratori: dacă rularea se oprește, aplicația îi avertizează.
    await this.db.workerHeartbeat.upsert({
      where: { name: MAINTENANCE_HEARTBEAT },
      create: { name: MAINTENANCE_HEARTBEAT, lastRunAt: new Date(), details: result },
      update: { lastRunAt: new Date(), details: result },
    });
    this.logger.log(
      `Rulare periodică (${today}): ${tasksGenerated} task-uri generate, ` +
        `${notificationsCreated} notificări, ${digestsQueued} rezumate pe email, ` +
        `${pushesQueued} notificări pe telefon`,
    );
    return result;
  }

  /** Creează reamintirile care lipsesc pentru task-urile deschise. */
  private async createReminders(today: string): Promise<number> {
    const [tasks, users, settings] = await Promise.all([
      this.db.task.findMany({
        where: {
          status: { in: ['TODO', 'IN_PROGRESS'] },
          dueDate: { lte: toDate(addDays(today, MAX_REMIND_DAYS_BEFORE)) },
        },
        select: {
          id: true,
          title: true,
          dueDate: true,
          periodEnd: true,
          startTime: true,
          endTime: true,
          assigneeId: true,
          client: { select: { name: true, assignments: { select: { userId: true } } } },
        },
      }),
      this.db.user.findMany({ where: { isActive: true }, select: { id: true, role: true } }),
      this.db.notificationSettings.findMany({ select: { userId: true, remindDaysBefore: true } }),
    ]);

    const planned = planReminders(
      tasks.map((task) => ({
        id: task.id,
        title: task.title,
        dueDate: toDateOnly(task.dueDate),
        periodEnd: task.periodEnd ? toDateOnly(task.periodEnd) : null,
        timeRange: formatTimeRange(task.startTime, task.endTime),
        clientName: task.client?.name ?? null,
        assigneeId: task.assigneeId,
        clientResponsibleIds: task.client?.assignments.map((assignment) => assignment.userId) ?? [],
      })),
      today,
      new Set(users.map((user) => user.id)),
      new Map(settings.map((row) => [row.userId, row.remindDaysBefore])),
      users.filter((user) => user.role === 'ADMIN').map((user) => user.id),
    );
    if (planned.length === 0) return 0;

    const { count } = await this.db.notification.createMany({
      data: planned,
      skipDuplicates: true,
    });
    return count;
  }

  /**
   * Trimite cel mult un email pe zi fiecărui utilizator care are reamintiri noi necitite.
   * Emailul conține doar numere; detaliile rămân în aplicație.
   */
  private async queueDigests(today: string, now: Date): Promise<number> {
    const users = await this.db.user.findMany({
      where: { isActive: true },
      select: { id: true, email: true, firstName: true, notificationSettings: true },
    });
    const since = new Date(now.getTime() - DAY_MS);
    // „Azi” înseamnă doar reamintirile create azi: una de ieri, încă necitită, ar apărea altfel
    // ca termen de azi (și încă o dată ca restanță).
    const todayStart = new Date(
      now.getTime() - minutesSinceMidnight(this.config.timeZone, now) * 60_000,
    );
    let queued = 0;

    for (const user of users) {
      const settings = user.notificationSettings;
      const emailEnabled = settings?.emailEnabled ?? DEFAULT_NOTIFICATION_SETTINGS.emailEnabled;
      const alreadySent = settings?.lastDigestDate
        ? toDateOnly(settings.lastDigestDate) === today
        : false;
      if (!emailEnabled || alreadySent) continue;

      const groups = await this.db.notification.groupBy({
        by: ['type'],
        where: {
          userId: user.id,
          readAt: null,
          OR: [
            { type: { in: ['TASK_OVERDUE', 'TASK_DUE_SOON'] }, createdAt: { gte: since } },
            { type: 'TASK_DUE_TODAY', createdAt: { gte: todayStart } },
          ],
        },
        _count: { _all: true },
      });
      const count = (type: string) => groups.find((group) => group.type === type)?._count._all ?? 0;
      const overdueCount = count('TASK_OVERDUE');
      const dueTodayCount = count('TASK_DUE_TODAY');
      const dueSoonCount = count('TASK_DUE_SOON');
      if (overdueCount + dueTodayCount + dueSoonCount === 0) continue;

      // Marcăm ziua înainte de a pune emailul în coadă: la o eroare între cei doi pași
      // preferăm un rezumat lipsă unuia trimis de două ori.
      await this.db.notificationSettings.upsert({
        where: { userId: user.id },
        create: { userId: user.id, lastDigestDate: toDate(today) },
        update: { lastDigestDate: toDate(today) },
      });
      await this.mailQueue.add(
        'task-digest',
        {
          kind: 'task-digest',
          to: user.email,
          firstName: user.firstName,
          overdueCount,
          dueTodayCount,
          dueSoonCount,
          appUrl: this.config.appUrl,
        },
        {
          attempts: 5,
          backoff: { type: 'exponential', delay: 30_000 },
          removeOnComplete: true,
          removeOnFail: { age: 24 * 60 * 60 },
        },
      );
      queued++;
    }
    return queued;
  }

  /**
   * Trimite pe telefon reamintirile noi, câte o singură notificare pe utilizator la fiecare
   * rulare. Reamintirile create noaptea așteaptă până dimineață. Doar pentru utilizatorii care au
   * pornit notificările pe cel puțin un dispozitiv.
   */
  private async queueReminderPushes(now: Date): Promise<number> {
    const users = await this.db.user.findMany({
      where: { isActive: true, pushSubscriptions: { some: {} } },
      select: { id: true },
    });
    const since = new Date(now.getTime() - DAY_MS);
    let queued = 0;

    for (const user of users) {
      const pending = await this.db.notification.findMany({
        where: {
          userId: user.id,
          readAt: null,
          pushedAt: null,
          createdAt: { gte: since },
          type: { in: REMINDER_TYPES },
        },
        orderBy: { createdAt: 'asc' },
        select: { id: true, type: true, title: true, body: true, taskId: true },
      });
      const payload = reminderPushPayload(pending);
      if (!payload) continue;

      // Marcate înainte de punerea în coadă: mai bine o notificare lipsă decât una dublă.
      await this.db.notification.updateMany({
        where: { id: { in: pending.map((notification) => notification.id) } },
        data: { pushedAt: now },
      });
      const badge = await this.db.notification.count({ where: { userId: user.id, readAt: null } });
      await this.pushQueue.add(
        'push',
        { userId: user.id, payload: { ...payload, badge } },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 30_000 },
          removeOnComplete: true,
          removeOnFail: { age: 24 * 60 * 60 },
        },
      );
      queued++;
    }
    return queued;
  }

  /** Șterge datele care nu mai sunt necesare: sesiuni și linkuri expirate, notificări vechi citite. */
  private async cleanup(now: Date): Promise<void> {
    const yesterday = new Date(now.getTime() - DAY_MS);
    await this.db.session.deleteMany({ where: { expiresAt: { lt: now } } });
    await this.db.passwordResetToken.deleteMany({
      where: { OR: [{ expiresAt: { lt: yesterday } }, { usedAt: { lt: yesterday } }] },
    });
    await this.db.notification.deleteMany({
      where: {
        readAt: { lt: new Date(now.getTime() - READ_NOTIFICATION_RETENTION_DAYS * DAY_MS) },
      },
    });
  }
}
