import { Injectable } from '@nestjs/common';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  type NotificationDto,
  type NotificationSettingsDto,
  type Paginated,
} from '@alconst/shared';
import { AppException } from '../common/app.exception.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  ListNotificationsQuery,
  UpdateNotificationSettingsDto,
} from './dto/notifications.dto.js';

/** Notificările din aplicație. Reamintirile de termen sunt create periodic de worker. */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

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

  /** Anunță un utilizator că i-a fost atribuit un task de către altcineva. */
  async notifyAssigned(task: { id: string; title: string }, assigneeId: string): Promise<void> {
    await this.prisma.db.notification.create({
      data: {
        userId: assigneeId,
        type: 'TASK_ASSIGNED',
        title: 'Ți-a fost atribuit un task',
        body: task.title,
        taskId: task.id,
        // Momentul face cheia unică: o reatribuire ulterioară trebuie să notifice din nou.
        dedupeKey: `assigned:${task.id}:${assigneeId}:${Date.now()}`,
      },
    });
  }
}
