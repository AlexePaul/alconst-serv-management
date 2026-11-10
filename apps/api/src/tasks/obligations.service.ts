import { Injectable } from '@nestjs/common';
import { generateObligationTasks, type Prisma } from '@alconst/database';
import {
  nextOccurrence,
  normalizeSearch,
  type ObligationDto,
  OPEN_TASK_STATUSES,
  type Paginated,
} from '@alconst/shared';
import { ActivityService } from '../activity/activity.service.js';
import { AppException } from '../common/app.exception.js';
import { formatDateOnly, parseDateOnly } from '../common/dates.js';
import { statusWhere } from '../common/pagination.js';
import type { AuthContext, ClientInfo } from '../common/request-context.js';
import { AppConfig } from '../config/app-config.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  CreateObligationDto,
  ListObligationsQuery,
  UpdateObligationDto,
} from './dto/obligations.dto.js';
import { TaskAccessService } from './task-access.service.js';

const OPEN = [...OPEN_TASK_STATUSES];

const include = {
  client: { select: { id: true, name: true } },
  location: { select: { id: true, name: true } },
  assignee: { select: { id: true, firstName: true, lastName: true } },
  // Cel mai apropiat task deschis = următorul termen real (poate fi reprogramat față de calcul).
  tasks: {
    where: { status: { in: OPEN } },
    orderBy: { dueDate: 'asc' },
    take: 1,
    select: { dueDate: true },
  },
  _count: { select: { tasks: { where: { status: { in: OPEN } } } } },
} satisfies Prisma.ObligationInclude;
type Row = Prisma.ObligationGetPayload<{ include: typeof include }>;

@Injectable()
export class ObligationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    private readonly access: TaskAccessService,
    private readonly activity: ActivityService,
  ) {}

  async list(query: ListObligationsQuery, auth: AuthContext): Promise<Paginated<ObligationDto>> {
    const search = query.search ? normalizeSearch(query.search) : '';
    const where: Prisma.ObligationWhereInput = {
      AND: [
        this.access.obligationScope(auth.user),
        statusWhere(query.status),
        query.clientId ? { clientId: query.clientId } : {},
        search
          ? {
              OR: [
                { searchText: { contains: search } },
                { client: { searchText: { contains: search } } },
              ],
            }
          : {},
      ],
    };
    const [rows, total] = await Promise.all([
      this.prisma.db.obligation.findMany({
        where,
        include,
        orderBy: [{ isActive: 'desc' }, { title: 'asc' }],
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.db.obligation.count({ where }),
    ]);
    return { items: rows.map((row) => this.toDto(row)), total };
  }

  async create(
    dto: CreateObligationDto,
    auth: AuthContext,
    client: ClientInfo,
  ): Promise<ObligationDto> {
    await this.access.assertLinks(dto, auth.user);
    this.assertPeriod(dto.startDate, dto.endDate ?? null);

    const created = await this.prisma.db.obligation.create({
      data: {
        title: dto.title,
        description: dto.description ?? null,
        kind: dto.kind ?? 'GENERAL',
        priority: dto.priority ?? 'NORMAL',
        clientId: dto.clientId ?? null,
        locationId: dto.locationId ?? null,
        assigneeId: dto.assigneeId ?? null,
        recurrenceUnit: dto.recurrenceUnit,
        recurrenceInterval: dto.recurrenceInterval ?? 1,
        startDate: parseDateOnly(dto.startDate),
        endDate: dto.endDate ? parseDateOnly(dto.endDate) : null,
        isActive: dto.isActive ?? true,
        searchText: normalizeSearch(dto.title),
        createdById: auth.user.id,
      },
      select: { id: true, title: true },
    });
    // Task-urile apar imediat, fără a aștepta următoarea rulare periodică a worker-ului.
    await this.generate(created.id);

    await this.activity.log({
      action: 'obligation.created',
      userId: auth.user.id,
      entityType: 'obligation',
      entityId: created.id,
      entityLabel: created.title,
      ip: client.ip,
    });
    return this.toDto(await this.find(created.id, auth));
  }

  /**
   * Modificările se propagă doar asupra task-urilor viitoare neîncepute:
   *  - schimbarea frecvenței, a perioadei sau dezactivarea le șterge și le regenerează;
   *  - celelalte modificări (titlu, responsabil, prioritate etc.) le actualizează pe loc,
   *    păstrând eventualele reprogramări.
   * Task-urile începute, finalizate sau anulate nu sunt atinse niciodată.
   */
  async update(
    id: string,
    dto: UpdateObligationDto,
    auth: AuthContext,
    client: ClientInfo,
  ): Promise<ObligationDto> {
    const before = await this.find(id, auth);

    const clientId = dto.clientId !== undefined ? dto.clientId : before.clientId;
    const locationId =
      dto.locationId !== undefined
        ? dto.locationId
        : clientId !== before.clientId
          ? null
          : before.locationId;
    const assigneeId = dto.assigneeId !== undefined ? dto.assigneeId : before.assigneeId;
    await this.access.assertChangedLinks(before, { clientId, locationId, assigneeId }, auth.user);

    const startDate = dto.startDate ?? formatDateOnly(before.startDate);
    const endDate =
      dto.endDate !== undefined
        ? dto.endDate
        : before.endDate
          ? formatDateOnly(before.endDate)
          : null;
    this.assertPeriod(startDate, endDate);

    const next = {
      title: dto.title ?? before.title,
      description: dto.description !== undefined ? dto.description : before.description,
      kind: dto.kind ?? before.kind,
      priority: dto.priority ?? before.priority,
      clientId,
      locationId,
      assigneeId,
      recurrenceUnit: dto.recurrenceUnit ?? before.recurrenceUnit,
      recurrenceInterval: dto.recurrenceInterval ?? before.recurrenceInterval,
      startDate: parseDateOnly(startDate),
      endDate: endDate ? parseDateOnly(endDate) : null,
      isActive: dto.isActive ?? before.isActive,
    };

    const scheduleChanged =
      next.recurrenceUnit !== before.recurrenceUnit ||
      next.recurrenceInterval !== before.recurrenceInterval ||
      startDate !== formatDateOnly(before.startDate) ||
      endDate !== (before.endDate ? formatDateOnly(before.endDate) : null) ||
      next.isActive !== before.isActive;

    const pending = this.pendingGeneratedTasks(id);
    await this.prisma.db.$transaction(async (tx) => {
      await tx.obligation.update({
        where: { id },
        data: { ...next, searchText: normalizeSearch(next.title) },
      });
      if (scheduleChanged) {
        await tx.task.deleteMany({ where: pending });
      } else {
        await tx.task.updateMany({
          where: pending,
          data: {
            title: next.title,
            description: next.description,
            kind: next.kind,
            priority: next.priority,
            clientId: next.clientId,
            locationId: next.locationId,
            assigneeId: next.assigneeId,
            searchText: normalizeSearch(next.title),
          },
        });
      }
    });
    if (scheduleChanged) await this.generate(id);

    await this.activity.log({
      action: 'obligation.updated',
      userId: auth.user.id,
      entityType: 'obligation',
      entityId: id,
      entityLabel: next.title,
      ip: client.ip,
    });
    return this.toDto(await this.find(id, auth));
  }

  /** Șterge obligația și task-urile ei viitoare neîncepute; restul task-urilor rămân în evidență. */
  async remove(id: string, auth: AuthContext, client: ClientInfo): Promise<void> {
    const existing = await this.find(id, auth);
    await this.prisma.db.$transaction([
      this.prisma.db.task.deleteMany({ where: this.pendingGeneratedTasks(id) }),
      this.prisma.db.obligation.delete({ where: { id } }),
    ]);
    await this.activity.log({
      action: 'obligation.deleted',
      userId: auth.user.id,
      entityType: 'obligation',
      entityId: id,
      entityLabel: existing.title,
      ip: client.ip,
    });
  }

  /** Task-urile generate care încă nu au fost începute și au termenul de azi încolo. */
  private pendingGeneratedTasks(obligationId: string): Prisma.TaskWhereInput {
    return {
      obligationId,
      status: 'TODO',
      occurrenceDate: { gte: parseDateOnly(this.config.today()) },
    };
  }

  private generate(obligationId: string): Promise<number> {
    return generateObligationTasks(this.prisma.db, {
      today: this.config.today(),
      horizonDays: this.config.taskHorizonDays,
      obligationId,
    });
  }

  private async find(id: string, auth: AuthContext): Promise<Row> {
    const row = await this.prisma.db.obligation.findFirst({
      where: { id, ...this.access.obligationScope(auth.user) },
      include,
    });
    if (!row) throw AppException.notFound('Obligația nu există.');
    return row;
  }

  private assertPeriod(startDate: string, endDate: string | null): void {
    if (endDate && endDate < startDate) {
      throw AppException.validation('Data de sfârșit nu poate fi înaintea primului termen.', {
        endDate: ['Data de sfârșit nu poate fi înaintea primului termen.'],
      });
    }
  }

  private toDto(row: Row): ObligationDto {
    const startDate = formatDateOnly(row.startDate);
    const endDate = row.endDate ? formatDateOnly(row.endDate) : null;
    const openTask = row.tasks[0];
    const computed = row.isActive
      ? nextOccurrence(
          { startDate, endDate, unit: row.recurrenceUnit, interval: row.recurrenceInterval },
          this.config.today(),
        )
      : null;
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      kind: row.kind,
      client: row.client,
      location: row.location,
      assignee: row.assignee,
      priority: row.priority,
      recurrenceUnit: row.recurrenceUnit,
      recurrenceInterval: row.recurrenceInterval,
      startDate,
      endDate,
      isActive: row.isActive,
      nextDueDate: openTask ? formatDateOnly(openTask.dueDate) : computed,
      openTaskCount: row._count.tasks,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
