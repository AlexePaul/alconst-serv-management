import { Injectable } from '@nestjs/common';
import type { Prisma } from '@alconst/database';
import type { LocationDto } from '@alconst/shared';
import { ActivityService } from '../activity/activity.service.js';
import { AppException } from '../common/app.exception.js';
import { definedChanges } from '../common/changes.js';
import type { AuthContext, ClientInfo } from '../common/request-context.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ClientAccessService } from './client-access.service.js';
import type { CreateLocationDto, UpdateLocationDto } from './dto/locations.dto.js';

const include = { _count: { select: { employees: true } } } satisfies Prisma.LocationInclude;
type Row = Prisma.LocationGetPayload<{ include: typeof include }>;

function toDto(row: Row): LocationDto {
  return {
    id: row.id,
    clientId: row.clientId,
    name: row.name,
    address: row.address,
    notes: row.notes,
    isActive: row.isActive,
    employeeCount: row._count.employees,
  };
}

@Injectable()
export class LocationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ClientAccessService,
    private readonly activity: ActivityService,
  ) {}

  async list(clientId: string, auth: AuthContext): Promise<LocationDto[]> {
    await this.access.assertAccess(clientId, auth.user);
    const rows = await this.prisma.db.location.findMany({
      where: { clientId },
      include,
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
    return rows.map(toDto);
  }

  async create(
    dto: CreateLocationDto,
    auth: AuthContext,
    client: ClientInfo,
  ): Promise<LocationDto> {
    await this.access.assertAccess(dto.clientId, auth.user);
    const row = await this.prisma.db.location.create({ data: dto, include });
    await this.log('location.created', row, auth, client);
    return toDto(row);
  }

  async update(
    id: string,
    dto: UpdateLocationDto,
    auth: AuthContext,
    client: ClientInfo,
  ): Promise<LocationDto> {
    const existing = await this.find(id, auth);
    const changes = definedChanges(dto, existing);
    if (Object.keys(changes).length === 0) return toDto(existing);
    const row = await this.prisma.db.location.update({ where: { id }, data: changes, include });
    await this.log('location.updated', row, auth, client);
    return toDto(row);
  }

  /** Angajații punctului de lucru rămân la client, fără punct de lucru asociat. */
  async remove(id: string, auth: AuthContext, client: ClientInfo): Promise<void> {
    const existing = await this.find(id, auth);
    await this.prisma.db.location.delete({ where: { id } });
    await this.log('location.deleted', existing, auth, client);
  }

  private async find(id: string, auth: AuthContext): Promise<Row> {
    const row = await this.prisma.db.location.findFirst({
      where: { id, client: this.access.scope(auth.user) },
      include,
    });
    if (!row) throw AppException.notFound('Punctul de lucru nu există.');
    return row;
  }

  private log(
    action: 'location.created' | 'location.updated' | 'location.deleted',
    row: Row,
    auth: AuthContext,
    client: ClientInfo,
  ): Promise<void> {
    return this.activity.log({
      action,
      userId: auth.user.id,
      entityType: 'location',
      entityId: row.id,
      entityLabel: row.name,
      metadata: { clientId: row.clientId },
      ip: client.ip,
    });
  }
}
