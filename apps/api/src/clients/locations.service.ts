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

type Row = Prisma.LocationGetPayload<object>;

function toDto(row: Row): LocationDto {
  return {
    id: row.id,
    clientId: row.clientId,
    name: row.name,
    address: row.address,
    notes: row.notes,
    isActive: row.isActive,
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
    const row = await this.prisma.db.location.create({ data: dto });
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
    const row = await this.prisma.db.location.update({ where: { id }, data: changes });
    await this.logChanges(Object.keys(changes), row, auth, client);
    return toDto(row);
  }

  private async find(id: string, auth: AuthContext): Promise<Row> {
    const row = await this.prisma.db.location.findFirst({
      where: { id, client: this.access.scope(auth.user) },
    });
    if (!row) throw AppException.notFound('Punctul de lucru nu există.');
    return row;
  }

  /** Arhivarea și reactivarea apar distinct în jurnal, separat de celelalte modificări. */
  private async logChanges(
    fields: string[],
    row: Row,
    auth: AuthContext,
    client: ClientInfo,
  ): Promise<void> {
    if (fields.includes('isActive')) {
      await this.log(
        row.isActive ? 'location.activated' : 'location.deactivated',
        row,
        auth,
        client,
      );
    }
    if (fields.some((field) => field !== 'isActive')) {
      await this.log('location.updated', row, auth, client);
    }
  }

  private log(
    action: 'location.created' | 'location.updated' | 'location.activated' | 'location.deactivated',
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
