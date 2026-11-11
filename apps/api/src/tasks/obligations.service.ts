import { Injectable } from '@nestjs/common';
import {
  generateObligationTasks,
  lockObligations,
  pendingGeneratedTasks,
  type Prisma,
} from '@alconst/database';
import {
  addDays,
  generationStart,
  nextOccurrence,
  normalizeSearch,
  type ObligationDto,
  occurrencePeriod,
  occurrencesBetween,
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
import { assertTimeRange } from './time-range.js';

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
    assertTimeRange(dto.startTime ?? null, dto.endTime ?? null);

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
        dueWithinPeriod: dto.dueWithinPeriod ?? true,
        startTime: dto.startTime ?? null,
        endTime: dto.endTime ?? null,
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
   *  - la schimbarea frecvenței, a perioadei sau la dezactivare, task-urile ale căror termene nu
   *    mai fac parte din program sunt șterse, iar cele noi sunt generate; cele care rămân în
   *    program își păstrează reprogramările, orele și responsabilul;
   *  - celelalte modificări (titlu, prioritate etc.) se aplică pe loc, doar pentru câmpurile
   *    schimbate efectiv; noul responsabil primește task-urile care erau ale celui vechi, nu și
   *    pe cele preluate între timp de un coleg.
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
    const startTime = dto.startTime !== undefined ? dto.startTime : before.startTime;
    const endTime = dto.endTime !== undefined ? dto.endTime : before.endTime;
    assertTimeRange(startTime, endTime);
    const timeChanged = startTime !== before.startTime || endTime !== before.endTime;

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
      dueWithinPeriod: dto.dueWithinPeriod ?? before.dueWithinPeriod,
      startTime,
      endTime,
      isActive: dto.isActive ?? before.isActive,
    };

    const scheduleChanged =
      next.recurrenceUnit !== before.recurrenceUnit ||
      next.recurrenceInterval !== before.recurrenceInterval ||
      startDate !== formatDateOnly(before.startDate) ||
      endDate !== (before.endDate ? formatDateOnly(before.endDate) : null) ||
      next.dueWithinPeriod !== before.dueWithinPeriod ||
      next.isActive !== before.isActive;

    const today = this.config.today();
    // Termenele care rămân în program după modificare (niciunul, dacă obligația devine inactivă),
    // fiecare cu perioada lui – calculate exact ca la generare.
    const kept =
      scheduleChanged && next.isActive
        ? occurrencesBetween(
            {
              startDate,
              endDate,
              unit: next.recurrenceUnit,
              interval: next.recurrenceInterval,
            },
            generationStart(next.recurrenceUnit, next.dueWithinPeriod, today),
            addDays(today, this.config.taskHorizonDays),
          ).map((date) => ({
            date: parseDateOnly(date),
            period: next.dueWithinPeriod ? occurrencePeriod(next.recurrenceUnit, date) : null,
          }))
        : [];

    const title = next.title !== before.title;
    const content: Prisma.TaskUncheckedUpdateManyInput = {
      ...(title ? { title: next.title, searchText: normalizeSearch(next.title) } : {}),
      ...(next.description !== before.description ? { description: next.description } : {}),
      ...(next.kind !== before.kind ? { kind: next.kind } : {}),
      ...(next.priority !== before.priority ? { priority: next.priority } : {}),
      ...(clientId !== before.clientId ? { clientId } : {}),
      ...(locationId !== before.locationId ? { locationId } : {}),
      // Intervalul orar se propagă doar dacă s-a schimbat, ca să nu suprascrie orele ajustate
      // manual pe task-uri la o modificare fără legătură (ex. titlul).
      ...(timeChanged ? { startTime, endTime } : {}),
    };

    const pending = this.pendingGeneratedTasks(id);
    await this.prisma.db.$transaction(async (tx) => {
      // Același blocaj ca la generare: o rulare periodică simultană așteaptă și apoi vede noile date.
      await lockObligations(tx, { obligationId: id });
      await tx.obligation.update({
        where: { id },
        data: { ...next, searchText: normalizeSearch(next.title) },
      });
      if (before.dueWithinPeriod && !next.dueWithinPeriod) {
        // Termenul devine exact: apariția perioadei curente, dacă data ei a trecut și nu a fost
        // făcută, rămâne în evidență ca restanță – nu este retrasă împreună cu cele viitoare.
        await tx.task.updateMany({
          where: { obligationId: id, status: 'TODO', occurrenceDate: { lt: parseDateOnly(today) } },
          data: { periodStart: null, periodEnd: null },
        });
      }
      if (scheduleChanged) {
        await tx.task.deleteMany({
          where: { AND: [pending, { occurrenceDate: { notIn: kept.map((entry) => entry.date) } }] },
        });
        // Task-urile păstrate își aliniază perioada la noile reguli (ex. termenul a devenit flexibil).
        for (const { date, period } of kept) {
          await tx.task.updateMany({
            where: { AND: [pending, { occurrenceDate: date }] },
            data: {
              periodStart: period ? parseDateOnly(period.start) : null,
              periodEnd: period ? parseDateOnly(period.end) : null,
            },
          });
        }
      }
      if (Object.keys(content).length > 0) {
        await tx.task.updateMany({ where: pending, data: content });
      }
      if (assigneeId !== before.assigneeId) {
        await tx.task.updateMany({
          where: { AND: [pending, { assigneeId: before.assigneeId }] },
          data: { assigneeId },
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
    await this.prisma.db.$transaction(async (tx) => {
      await lockObligations(tx, { obligationId: id });
      await tx.task.deleteMany({ where: this.pendingGeneratedTasks(id) });
      await tx.obligation.delete({ where: { id } });
    });
    await this.activity.log({
      action: 'obligation.deleted',
      userId: auth.user.id,
      entityType: 'obligation',
      entityId: id,
      entityLabel: existing.title,
      ip: client.ip,
    });
  }

  /** Task-urile generate, neîncepute și încă „la timp” ale obligației (vezi `pendingGeneratedTasks`). */
  private pendingGeneratedTasks(obligationId: string): Prisma.TaskWhereInput {
    return { AND: [pendingGeneratedTasks(this.config.today()), { obligationId }] };
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
    if (!row) throw AppException.notFound('Activitatea recurentă nu există.');
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
      dueWithinPeriod: row.dueWithinPeriod,
      startTime: row.startTime,
      endTime: row.endTime,
      isActive: row.isActive,
      nextDueDate: openTask ? formatDateOnly(openTask.dueDate) : computed,
      openTaskCount: row._count.tasks,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
