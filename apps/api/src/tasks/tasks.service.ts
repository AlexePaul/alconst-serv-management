import { Injectable } from '@nestjs/common';
import type { Prisma } from '@alconst/database';
import {
  addDays,
  normalizeSearch,
  OPEN_TASK_STATUSES,
  type Paginated,
  type TaskDto,
  type TaskHistoryEntryDto,
  type TasksOverviewDto,
  type TaskStatus,
} from '@alconst/shared';
import { ActivityService } from '../activity/activity.service.js';
import { AppException } from '../common/app.exception.js';
import { formatDateOnly, parseDateOnly } from '../common/dates.js';
import type { AuthContext, ClientInfo } from '../common/request-context.js';
import { AppConfig } from '../config/app-config.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateTaskDto, ListTasksQuery, UpdateTaskDto } from './dto/tasks.dto.js';
import { NotificationsService } from './notifications.service.js';
import { TaskAccessService } from './task-access.service.js';
import { taskInclude, type TaskRow, toTaskDto } from './task.mapper.js';

const OPEN = [...OPEN_TASK_STATUSES];
const OVERVIEW_LIMIT = 50;

interface FieldChange {
  field: string;
  from: string | null;
  to: string | null;
}

const fullName = (user: { firstName: string; lastName: string } | null) =>
  user ? `${user.firstName} ${user.lastName}` : null;

/** Compară două versiuni ale unui task și descrie diferențele, pentru istoricul de modificări. */
function describeChanges(before: TaskRow, after: TaskRow): FieldChange[] {
  const changes: FieldChange[] = [];
  const compare = (field: string, from: string | null, to: string | null) => {
    if (from !== to) changes.push({ field, from, to });
  };
  compare('status', before.status, after.status);
  compare('title', before.title, after.title);
  compare('dueDate', formatDateOnly(before.dueDate), formatDateOnly(after.dueDate));
  compare('assignee', fullName(before.assignee), fullName(after.assignee));
  compare('priority', before.priority, after.priority);
  compare('kind', before.kind, after.kind);
  compare('client', before.client?.name ?? null, after.client?.name ?? null);
  compare('location', before.location?.name ?? null, after.location?.name ?? null);
  // Textele lungi nu se copiază în jurnal; se reține doar că au fost modificate.
  if (before.description !== after.description)
    changes.push({ field: 'description', from: null, to: null });
  if (before.notes !== after.notes) changes.push({ field: 'notes', from: null, to: null });
  return changes;
}

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    private readonly access: TaskAccessService,
    private readonly activity: ActivityService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(query: ListTasksQuery, auth: AuthContext): Promise<Paginated<TaskDto>> {
    const status = query.status ?? 'open';
    const search = query.search ? normalizeSearch(query.search) : '';
    const dueDate: Prisma.DateTimeFilter = {
      ...(query.from ? { gte: parseDateOnly(query.from) } : {}),
      ...(query.to ? { lte: parseDateOnly(query.to) } : {}),
    };

    const where: Prisma.TaskWhereInput = {
      AND: [
        this.access.taskScope(auth.user),
        status === 'open' ? { status: { in: OPEN } } : {},
        status === 'done' ? { status: 'DONE' } : {},
        status === 'cancelled' ? { status: 'CANCELLED' } : {},
        query.assignee === 'me' ? { assigneeId: auth.user.id } : {},
        query.assignee === 'none' ? { assigneeId: null } : {},
        query.assignee && !['me', 'none'].includes(query.assignee)
          ? { assigneeId: query.assignee }
          : {},
        query.clientId ? { clientId: query.clientId } : {},
        query.obligationId ? { obligationId: query.obligationId } : {},
        query.kind ? { kind: query.kind } : {},
        query.from || query.to ? { dueDate } : {},
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

    const pageSize = query.pageSize ?? 50;
    const [rows, total] = await Promise.all([
      this.prisma.db.task.findMany({
        where,
        include: taskInclude,
        // Cele finalizate: cele mai recente primele; restul: în ordinea termenelor.
        orderBy:
          status === 'done'
            ? [{ completedAt: 'desc' }]
            : [{ dueDate: 'asc' }, { priority: 'desc' }, { createdAt: 'asc' }],
        skip: ((query.page ?? 1) - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.db.task.count({ where }),
    ]);
    return { items: rows.map(toTaskDto), total };
  }

  async get(id: string, auth: AuthContext): Promise<TaskDto> {
    return toTaskDto(await this.find(id, auth));
  }

  async create(dto: CreateTaskDto, auth: AuthContext, client: ClientInfo): Promise<TaskDto> {
    await this.access.assertLinks(dto, auth.user);
    const status = dto.status ?? 'TODO';

    const row = await this.prisma.db.task.create({
      data: {
        title: dto.title,
        description: dto.description ?? null,
        notes: dto.notes ?? null,
        kind: dto.kind ?? 'GENERAL',
        priority: dto.priority ?? 'NORMAL',
        status,
        dueDate: parseDateOnly(dto.dueDate),
        clientId: dto.clientId ?? null,
        locationId: dto.locationId ?? null,
        assigneeId: dto.assigneeId ?? null,
        createdById: auth.user.id,
        searchText: normalizeSearch(dto.title),
        ...this.completionFields(status, auth.user.id),
      },
      include: taskInclude,
    });

    await this.activity.log({
      action: 'task.created',
      userId: auth.user.id,
      entityType: 'task',
      entityId: row.id,
      entityLabel: row.title,
      ip: client.ip,
    });
    if (row.assigneeId && row.assigneeId !== auth.user.id) {
      await this.notifications.notifyAssigned(row, row.assigneeId);
    }
    return toTaskDto(row);
  }

  async update(
    id: string,
    dto: UpdateTaskDto,
    auth: AuthContext,
    client: ClientInfo,
  ): Promise<TaskDto> {
    const before = await this.find(id, auth);

    // Schimbarea clientului invalidează punctul de lucru, dacă nu este trimis unul nou.
    const clientId = dto.clientId !== undefined ? dto.clientId : before.clientId;
    const locationId =
      dto.locationId !== undefined
        ? dto.locationId
        : clientId !== before.clientId
          ? null
          : before.locationId;
    const assigneeId = dto.assigneeId !== undefined ? dto.assigneeId : before.assigneeId;
    await this.access.assertChangedLinks(before, { clientId, locationId, assigneeId }, auth.user);

    const status: TaskStatus = dto.status ?? before.status;
    const after = await this.prisma.db.task.update({
      where: { id },
      data: {
        ...(dto.title !== undefined
          ? { title: dto.title, searchText: normalizeSearch(dto.title) }
          : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        ...(dto.kind !== undefined ? { kind: dto.kind } : {}),
        ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
        ...(dto.dueDate !== undefined ? { dueDate: parseDateOnly(dto.dueDate) } : {}),
        clientId,
        locationId,
        assigneeId,
        ...(status !== before.status
          ? { status, ...this.completionFields(status, auth.user.id) }
          : {}),
      },
      include: taskInclude,
    });

    const changes = describeChanges(before, after);
    if (changes.length > 0) {
      const onlyStatus = changes.length === 1 && changes[0]?.field === 'status';
      await this.activity.log({
        action: onlyStatus ? 'task.status_changed' : 'task.updated',
        userId: auth.user.id,
        entityType: 'task',
        entityId: after.id,
        entityLabel: after.title,
        metadata: { changes: changes as unknown as Prisma.InputJsonArray },
        ip: client.ip,
      });
    }
    if (
      after.assigneeId &&
      after.assigneeId !== before.assigneeId &&
      after.assigneeId !== auth.user.id
    ) {
      await this.notifications.notifyAssigned(after, after.assigneeId);
    }
    return toTaskDto(after);
  }

  /**
   * Doar task-urile create manual pot fi șterse. Cele generate dintr-o obligație se anulează:
   * dacă ar fi șterse, următoarea generare le-ar crea din nou.
   */
  async remove(id: string, auth: AuthContext, client: ClientInfo): Promise<void> {
    const existing = await this.find(id, auth);
    if (existing.obligationId) {
      throw AppException.validation(
        'Task-urile generate dintr-o obligație nu pot fi șterse. Marchează task-ul ca anulat.',
      );
    }
    await this.prisma.db.task.delete({ where: { id } });
    await this.activity.log({
      action: 'task.deleted',
      userId: auth.user.id,
      entityType: 'task',
      entityId: id,
      entityLabel: existing.title,
      ip: client.ip,
    });
  }

  /** Istoricul unui task, reconstituit din jurnalul de activitate. */
  async history(id: string, auth: AuthContext): Promise<TaskHistoryEntryDto[]> {
    await this.find(id, auth);
    const rows = await this.prisma.db.activityLog.findMany({
      where: { entityType: 'task', entityId: id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
    });
    return rows.map((row) => {
      const metadata = row.metadata as { changes?: FieldChange[] } | null;
      return {
        id: row.id,
        action: row.action,
        createdAt: row.createdAt.toISOString(),
        user: row.user,
        changes: Array.isArray(metadata?.changes) ? metadata.changes : [],
      };
    });
  }

  /** Datele pentru pagina principală: restanțe, termene de azi și din următoarele 7 zile. */
  async overview(scope: 'mine' | 'all', auth: AuthContext): Promise<TasksOverviewDto> {
    const today = this.config.today();
    const todayDate = parseDateOnly(today);
    const weekAhead = parseDateOnly(addDays(today, 7));
    const base: Prisma.TaskWhereInput = {
      AND: [
        this.access.taskScope(auth.user),
        { status: { in: OPEN } },
        scope === 'mine' ? { assigneeId: auth.user.id } : {},
      ],
    };
    const buckets = {
      overdue: { ...base, dueDate: { lt: todayDate } },
      dueToday: { ...base, dueDate: todayDate },
      upcoming: { ...base, dueDate: { gt: todayDate, lte: weekAhead } },
    } satisfies Record<string, Prisma.TaskWhereInput>;

    const fetch = (where: Prisma.TaskWhereInput) =>
      this.prisma.db.task.findMany({
        where,
        include: taskInclude,
        orderBy: [{ dueDate: 'asc' }, { priority: 'desc' }],
        take: OVERVIEW_LIMIT,
      });
    const [overdue, dueToday, upcoming, overdueCount, dueTodayCount, upcomingCount] =
      await Promise.all([
        fetch(buckets.overdue),
        fetch(buckets.dueToday),
        fetch(buckets.upcoming),
        this.prisma.db.task.count({ where: buckets.overdue }),
        this.prisma.db.task.count({ where: buckets.dueToday }),
        this.prisma.db.task.count({ where: buckets.upcoming }),
      ]);

    return {
      today,
      overdue: overdue.map(toTaskDto),
      dueToday: dueToday.map(toTaskDto),
      upcoming: upcoming.map(toTaskDto),
      counts: { overdue: overdueCount, dueToday: dueTodayCount, upcoming: upcomingCount },
    };
  }

  private async find(id: string, auth: AuthContext): Promise<TaskRow> {
    const row = await this.prisma.db.task.findFirst({
      where: { id, ...this.access.taskScope(auth.user) },
      include: taskInclude,
    });
    if (!row) throw AppException.notFound('Task-ul nu există.');
    return row;
  }

  /** Momentul și autorul finalizării se rețin doar cât timp task-ul este „Finalizat”. */
  private completionFields(
    status: TaskStatus,
    userId: string,
  ): { completedAt: Date | null; completedById: string | null } {
    return status === 'DONE'
      ? { completedAt: new Date(), completedById: userId }
      : { completedAt: null, completedById: null };
  }
}
