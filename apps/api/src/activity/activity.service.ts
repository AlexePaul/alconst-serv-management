import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@alconst/database';
import type { ActivityAction, ActivityLogDto } from '@alconst/shared';
import { PrismaService } from '../prisma/prisma.service.js';

export interface ActivityEntry {
  action: ActivityAction;
  /** Utilizatorul care a efectuat acțiunea (null pentru acțiuni anonime). */
  userId?: string | null;
  entityType?: string;
  entityId?: string;
  entityLabel?: string;
  metadata?: Prisma.InputJsonObject;
  ip?: string | null;
}

/** Jurnalul de activitate (audit log) al aplicației. */
@Injectable()
export class ActivityService {
  private readonly logger = new Logger(ActivityService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Înregistrează o acțiune. Un eșec al jurnalizării nu întrerupe operațiunea principală,
   * dar este raportat în loguri.
   */
  async log(entry: ActivityEntry): Promise<void> {
    try {
      await this.prisma.db.activityLog.create({
        data: {
          action: entry.action,
          userId: entry.userId ?? null,
          entityType: entry.entityType ?? null,
          entityId: entry.entityId ?? null,
          entityLabel: entry.entityLabel ?? null,
          ...(entry.metadata ? { metadata: entry.metadata } : {}),
          ip: entry.ip ?? null,
        },
      });
    } catch (error) {
      this.logger.error(
        `Nu s-a putut înregistra acțiunea „${entry.action}” în jurnal`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async recent(limit: number): Promise<ActivityLogDto[]> {
    const rows = await this.prisma.db.activityLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
    });
    return rows.map((row) => ({
      id: row.id,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      entityLabel: row.entityLabel,
      createdAt: row.createdAt.toISOString(),
      user: row.user,
    }));
  }
}
