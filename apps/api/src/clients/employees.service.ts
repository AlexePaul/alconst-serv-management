import { Injectable } from '@nestjs/common';
import type { Prisma } from '@alconst/database';
import { type ClientEmployeeDto, normalizeSearch, type Paginated } from '@alconst/shared';
import { ActivityService } from '../activity/activity.service.js';
import { AppException } from '../common/app.exception.js';
import { definedChanges } from '../common/changes.js';
import { formatDateOnly, parseDateOnly } from '../common/dates.js';
import { statusWhere } from '../common/pagination.js';
import type { AuthContext, ClientInfo } from '../common/request-context.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ClientAccessService } from './client-access.service.js';
import type {
  CreateEmployeeDto,
  ListEmployeesQuery,
  UpdateEmployeeDto,
} from './dto/employees.dto.js';

const include = {
  client: { select: { name: true } },
  location: { select: { name: true } },
} satisfies Prisma.EmployeeInclude;
type Row = Prisma.EmployeeGetPayload<{ include: typeof include }>;

function toDto(row: Row): ClientEmployeeDto {
  return {
    id: row.id,
    clientId: row.clientId,
    clientName: row.client.name,
    locationId: row.locationId,
    locationName: row.location?.name ?? null,
    firstName: row.firstName,
    lastName: row.lastName,
    position: row.position,
    hireDate: row.hireDate ? formatDateOnly(row.hireDate) : null,
    notes: row.notes,
    isActive: row.isActive,
  };
}

function buildSearchText(employee: {
  firstName: string;
  lastName: string;
  position?: string | null;
}): string {
  // Numele apare de două ori, astfel încât să se potrivească și „Popescu Ion”, și „Ion Popescu”.
  return normalizeSearch(
    [employee.lastName, employee.firstName, employee.lastName, employee.position]
      .filter(Boolean)
      .join(' '),
  );
}

/**
 * Angajații companiilor cliente. Accesul urmează accesul la clientul de care aparțin.
 * Angajații nu se șterg: cei plecați devin inactivi și rămân în evidență.
 */
@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ClientAccessService,
    private readonly activity: ActivityService,
  ) {}

  async list(query: ListEmployeesQuery, auth: AuthContext): Promise<Paginated<ClientEmployeeDto>> {
    const search = query.search ? normalizeSearch(query.search) : '';
    const where: Prisma.EmployeeWhereInput = {
      client: this.access.scope(auth.user),
      ...statusWhere(query.status),
      ...(query.clientId ? { clientId: query.clientId } : {}),
      ...(query.locationId ? { locationId: query.locationId } : {}),
      ...(search ? { searchText: { contains: search } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.db.employee.findMany({
        where,
        include,
        orderBy: [{ isActive: 'desc' }, { lastName: 'asc' }, { firstName: 'asc' }],
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.db.employee.count({ where }),
    ]);
    return { items: rows.map(toDto), total };
  }

  async create(
    dto: CreateEmployeeDto,
    auth: AuthContext,
    client: ClientInfo,
  ): Promise<ClientEmployeeDto> {
    await this.access.assertAccess(dto.clientId, auth.user);
    await this.assertLocationBelongs(dto.locationId, dto.clientId);

    const row = await this.prisma.db.employee.create({
      data: {
        clientId: dto.clientId,
        locationId: dto.locationId ?? null,
        firstName: dto.firstName,
        lastName: dto.lastName,
        position: dto.position ?? null,
        hireDate: dto.hireDate ? parseDateOnly(dto.hireDate) : null,
        notes: dto.notes ?? null,
        isActive: dto.isActive ?? true,
        searchText: buildSearchText(dto),
      },
      include,
    });
    await this.log('employee.created', row, auth, client);
    return toDto(row);
  }

  async update(
    id: string,
    dto: UpdateEmployeeDto,
    auth: AuthContext,
    client: ClientInfo,
  ): Promise<ClientEmployeeDto> {
    const existing = await this.find(id, auth);
    if (dto.locationId) await this.assertLocationBelongs(dto.locationId, existing.clientId);

    const { hireDate, ...rest } = dto;
    const changes = definedChanges(
      {
        ...rest,
        hireDate: hireDate === undefined ? undefined : hireDate ? parseDateOnly(hireDate) : null,
      },
      existing,
    );
    if (Object.keys(changes).length === 0) return toDto(existing);

    const row = await this.prisma.db.employee.update({
      where: { id },
      data: { ...changes, searchText: buildSearchText({ ...existing, ...changes }) },
      include,
    });
    if ('isActive' in changes) {
      await this.log(
        row.isActive ? 'employee.activated' : 'employee.deactivated',
        row,
        auth,
        client,
      );
    }
    if (Object.keys(changes).some((field) => field !== 'isActive')) {
      await this.log('employee.updated', row, auth, client);
    }
    return toDto(row);
  }

  private async find(id: string, auth: AuthContext): Promise<Row> {
    const row = await this.prisma.db.employee.findFirst({
      where: { id, client: this.access.scope(auth.user) },
      include,
    });
    if (!row) throw AppException.notFound('Angajatul nu există.');
    return row;
  }

  private async assertLocationBelongs(
    locationId: string | null | undefined,
    clientId: string,
  ): Promise<void> {
    if (!locationId) return;
    const location = await this.prisma.db.location.findFirst({
      where: { id: locationId, clientId },
      select: { id: true },
    });
    if (!location) {
      throw AppException.validation('Punctul de lucru nu aparține acestui client.', {
        locationId: ['Punctul de lucru nu aparține acestui client.'],
      });
    }
  }

  private log(
    action: 'employee.created' | 'employee.updated' | 'employee.activated' | 'employee.deactivated',
    row: Row,
    auth: AuthContext,
    client: ClientInfo,
  ): Promise<void> {
    return this.activity.log({
      action,
      userId: auth.user.id,
      entityType: 'employee',
      entityId: row.id,
      entityLabel: `${row.firstName} ${row.lastName}`,
      metadata: { clientId: row.clientId },
      ip: client.ip,
    });
  }
}
