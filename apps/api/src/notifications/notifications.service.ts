import { Injectable, Logger } from '@nestjs/common';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  type NotificationDto,
  type NotificationSettingsDto,
  type NotificationType,
  type Paginated,
} from '@alconst/shared';
import { AppException } from '../common/app.exception.js';
import { AppConfig } from '../config/app-config.js';
import { MailQueueService } from '../mail/mail-queue.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  ListNotificationsQuery,
  UpdateNotificationSettingsDto,
} from './dto/notifications.dto.js';

export interface NotifyInput {
  userId: string;
  type: NotificationType;
  /** ID-ul entității la care se referă notificarea (task, client, cerere) – parte din cheia unică. */
  subjectId: string;
  title: string;
  /** Detaliile afișate în aplicație (pot conține titluri și nume de clienți). */
  body?: string;
  taskId?: string;
  /** Pagina din aplicație la care trimite notificarea, când nu se referă la un task. */
  link?: string;
  /** Textul emailului – general, fără titluri de task-uri sau nume de clienți. */
  emailMessage: string;
}

/**
 * Notificările din aplicație și emailurile trimise imediat pentru evenimente.
 * Reamintirile de termen și rezumatul zilnic sunt create periodic de worker.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    private readonly mailQueue: MailQueueService,
  ) {}

  async list(userId: string, query: ListNotificationsQuery): Promise<Paginated<NotificationDto>> {
    const where = { userId, ...(query.unreadOnly ? { readAt: null } : {}) };
    const [rows, total] = await Promise.all([
      this.prisma.db.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.db.notification.count({ where }),
    ]);
    return {
      items: rows.map((row) => ({
        id: row.id,
        type: row.type,
        title: row.title,
        body: row.body,
        taskId: row.taskId,
        link: row.link,
        readAt: row.readAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
      })),
      total,
    };
  }

  unreadCount(userId: string): Promise<number> {
    return this.prisma.db.notification.count({ where: { userId, readAt: null } });
  }

  async markRead(id: string, userId: string): Promise<void> {
    // Filtrul după utilizator face ca notificările altora să pară inexistente.
    const { count } = await this.prisma.db.notification.updateMany({
      where: { id, userId },
      data: { readAt: new Date() },
    });
    if (count === 0) throw AppException.notFound('Notificarea nu există.');
  }

  async markAllRead(userId: string): Promise<void> {
    await this.prisma.db.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  async getSettings(userId: string): Promise<NotificationSettingsDto> {
    const row = await this.prisma.db.notificationSettings.findUnique({ where: { userId } });
    return {
      emailEnabled: row?.emailEnabled ?? DEFAULT_NOTIFICATION_SETTINGS.emailEnabled,
      remindDaysBefore: row?.remindDaysBefore ?? DEFAULT_NOTIFICATION_SETTINGS.remindDaysBefore,
    };
  }

  async updateSettings(
    userId: string,
    dto: UpdateNotificationSettingsDto,
  ): Promise<NotificationSettingsDto> {
    const current = await this.getSettings(userId);
    const next = {
      emailEnabled: dto.emailEnabled ?? current.emailEnabled,
      remindDaysBefore: dto.remindDaysBefore ?? current.remindDaysBefore,
    };
    await this.prisma.db.notificationSettings.upsert({
      where: { userId },
      create: { userId, ...next },
      update: next,
    });
    return next;
  }

  /**
   * Creează o notificare în aplicație și, dacă destinatarul are emailurile activate, îi trimite
   * imediat și un email.
   *
   * Emailul este deliberat general („Ți-a fost atribuit un task”): titlurile task-urilor și numele
   * clienților rămân în aplicație și nu trec prin furnizorul de email. Un eșec la trimiterea
   * emailului nu afectează operațiunea care a produs notificarea.
   */
  async notify(input: NotifyInput): Promise<void> {
    await this.prisma.db.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        taskId: input.taskId ?? null,
        link: input.link ?? null,
        // Momentul face cheia unică: același eveniment, repetat mai târziu, notifică din nou.
        dedupeKey: `${input.type}:${input.subjectId}:${input.userId}:${Date.now()}`,
      },
    });

    try {
      const user = await this.prisma.db.user.findUnique({
        where: { id: input.userId },
        select: { email: true, firstName: true, isActive: true, notificationSettings: true },
      });
      const emailEnabled =
        user?.notificationSettings?.emailEnabled ?? DEFAULT_NOTIFICATION_SETTINGS.emailEnabled;
      if (!user?.isActive || !emailEnabled) return;

      const path = input.taskId ? `/task-uri?task=${input.taskId}` : (input.link ?? '/notificari');
      await this.mailQueue.enqueue({
        kind: 'notification',
        to: user.email,
        firstName: user.firstName,
        headline: input.title,
        message: input.emailMessage,
        actionUrl: `${this.config.appUrl}${path}`,
      });
    } catch (error) {
      this.logger.error(
        `Emailul pentru notificarea „${input.type}” nu a putut fi pus în coadă`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /** Anunță un utilizator că i-a fost atribuit un task de către altcineva. */
  notifyAssigned(task: { id: string; title: string }, assigneeId: string): Promise<void> {
    return this.notify({
      userId: assigneeId,
      type: 'TASK_ASSIGNED',
      subjectId: task.id,
      title: 'Ai primit ceva de făcut',
      body: task.title,
      taskId: task.id,
      emailMessage: 'Un coleg ți-a dat ceva de făcut în aplicația Alconst Serv.',
    });
  }
}
