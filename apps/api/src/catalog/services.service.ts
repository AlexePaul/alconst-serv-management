import { Injectable } from '@nestjs/common';
import type { Prisma } from '@alconst/database';
import type { ServiceDto } from '@alconst/shared';
import { ActivityService } from '../activity/activity.service.js';
import { AppException } from '../common/app.exception.js';
import { definedChanges } from '../common/changes.js';
import { isForeignKeyViolation, isUniqueViolation } from '../common/prisma-errors.js';
import type { AuthContext, ClientInfo } from '../common/request-context.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateServiceDto, UpdateServiceDto } from './dto/services.dto.js';

const NAME_TAKEN = 'Există deja un serviciu cu această denumire.';
const include = { _count: { select: { clients: true } } } satisfies Prisma.ServiceInclude;
type Row = Prisma.ServiceGetPayload<{ include: typeof include }>;

function toDto(row: Row): ServiceDto {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    isActive: row.isActive,
    clientCount: row._count.clients,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Catalogul serviciilor oferite de firmă. Toți utilizatorii îl pot consulta; doar administratorii îl modifică. */
@Injectable()
export class ServicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
  ) {}

  async list(): Promise<ServiceDto[]> {
    const rows = await this.prisma.db.service.findMany({
      include,
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
    return rows.map(toDto);
  }

  async create(dto: CreateServiceDto, auth: AuthContext, client: ClientInfo): Promise<ServiceDto> {
    await this.assertNameAvailable(dto.name);
    try {
      const row = await this.prisma.db.service.create({ data: dto, include });
      await this.log('service.created', row, auth, client);
      return toDto(row);
    } catch (error) {
      if (isUniqueViolation(error)) throw AppException.conflict(NAME_TAKEN, { name: [NAME_TAKEN] });
      throw error;
    }
  }

  async update(
    id: string,
    dto: UpdateServiceDto,
    auth: AuthContext,
    client: ClientInfo,
  ): Promise<ServiceDto> {
    const existing = await this.find(id);
    const changes = definedChanges(dto, existing);
    if (Object.keys(changes).length === 0) return toDto(existing);
    if (changes.name !== undefined) await this.assertNameAvailable(changes.name, id);
    try {
      const row = await this.prisma.db.service.update({ where: { id }, data: changes, include });
      await this.log('service.updated', row, auth, client);
      return toDto(row);
    } catch (error) {
      if (isUniqueViolation(error)) throw AppException.conflict(NAME_TAKEN, { name: [NAME_TAKEN] });
      throw error;
    }
  }

  /** Un serviciu folosit de clienți sau în contracte nu poate fi șters, doar dezactivat. */
  async remove(id: string, auth: AuthContext, client: ClientInfo): Promise<void> {
    const existing = await this.find(id);
    try {
      await this.prisma.db.service.delete({ where: { id } });
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw AppException.conflict(
          'Serviciul este folosit de clienți sau în contracte și nu poate fi șters. Îl poți dezactiva.',
        );
      }
      throw error;
    }
    await this.log('service.deleted', existing, auth, client);
  }

  private async find(id: string): Promise<Row> {
    const row = await this.prisma.db.service.findUnique({ where: { id }, include });
    if (!row) throw AppException.notFound('Serviciul nu există.');
    return row;
  }

  /** Denumirile sunt unice indiferent de majuscule („ssm” și „SSM” sunt același serviciu). */
  private async assertNameAvailable(name: string, exceptId?: string): Promise<void> {
    const existing = await this.prisma.db.service.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (existing) throw AppException.conflict(NAME_TAKEN, { name: [NAME_TAKEN] });
  }

  private log(
    action: 'service.created' | 'service.updated' | 'service.deleted',
    row: Row,
    auth: AuthContext,
    client: ClientInfo,
  ): Promise<void> {
    return this.activity.log({
      action,
      userId: auth.user.id,
      entityType: 'service',
      entityId: row.id,
      entityLabel: row.name,
      ip: client.ip,
    });
  }
}
