import { Injectable } from '@nestjs/common';
import type { Prisma } from '@alconst/database';
import {
  type ClientDto,
  type ClientListItemDto,
  type ClientsSummaryDto,
  normalizeSearch,
  type Paginated,
} from '@alconst/shared';
import { ActivityService } from '../activity/activity.service.js';
import { AppException } from '../common/app.exception.js';
import { formatDateOnly, todayDateOnly } from '../common/dates.js';
import { definedChanges } from '../common/changes.js';
import { statusWhere } from '../common/pagination.js';
import { isUniqueViolation } from '../common/prisma-errors.js';
import type { AuthContext, ClientInfo } from '../common/request-context.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ClientAccessService } from './client-access.service.js';
import {
  clientDetailInclude,
  clientListInclude,
  estimateFees,
  toClientDto,
  toClientListItem,
} from './client.mapper.js';
import type { CreateClientDto, ListClientsQuery, UpdateClientDto } from './dto/clients.dto.js';

const CUI_TAKEN =
  'Există deja un client cu acest CUI. Dacă nu îl vezi în listă, cere unui administrator să te adauge ca responsabil.';
const EXPIRING_WINDOW_DAYS = 30;

type SearchableFields = Pick<
  Prisma.ClientUncheckedCreateInput,
  'name' | 'cui' | 'contactPerson' | 'email' | 'phone' | 'legalRepresentative' | 'address'
>;

function buildSearchText(client: SearchableFields): string {
  return normalizeSearch(
    [
      client.name,
      client.cui,
      client.contactPerson,
      client.email,
      client.phone,
      client.legalRepresentative,
      client.address,
    ]
      .filter(Boolean)
      .join(' '),
  );
}

@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ClientAccessService,
    private readonly activity: ActivityService,
  ) {}

  async list(query: ListClientsQuery, auth: AuthContext): Promise<Paginated<ClientListItemDto>> {
    const search = query.search ? normalizeSearch(query.search) : '';
    const where: Prisma.ClientWhereInput = {
      AND: [
        this.access.scope(auth.user),
        statusWhere(query.status),
        search ? { searchText: { contains: search } } : {},
        // Filtrul după responsabil are sens doar pentru administratori (angajații își văd doar clienții).
        query.responsibleId && auth.user.role === 'ADMIN'
          ? { assignments: { some: { userId: query.responsibleId } } }
          : {},
      ],
    };
    const [rows, total] = await Promise.all([
      this.prisma.db.client.findMany({
        where,
        include: clientListInclude,
        orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.db.client.count({ where }),
    ]);
    return { items: rows.map(toClientListItem), total };
  }

  async get(id: string, auth: AuthContext): Promise<ClientDto> {
    const row = await this.prisma.db.client.findFirst({
      where: { id, ...this.access.scope(auth.user) },
      include: clientDetailInclude,
    });
    if (!row) throw AppException.notFound('Clientul nu există.');
    return toClientDto(row);
  }

  async create(dto: CreateClientDto, auth: AuthContext, client: ClientInfo): Promise<ClientDto> {
    await this.assertCuiAvailable(dto.cui);

    // Un angajat devine automat responsabilul clientului pe care îl adaugă;
    // doar administratorii pot alege alți responsabili.
    const responsibleIds = auth.user.role === 'ADMIN' ? (dto.responsibleIds ?? []) : [auth.user.id];
    if (auth.user.role === 'ADMIN') await this.assertActiveUsers(responsibleIds);

    const { responsibleIds: _ignored, ...fields } = dto;
    let id: string;
    try {
      const created = await this.prisma.db.client.create({
        data: {
          ...fields,
          searchText: buildSearchText(fields),
          createdById: auth.user.id,
          assignments: { create: responsibleIds.map((userId) => ({ userId })) },
        },
        select: { id: true },
      });
      id = created.id;
    } catch (error) {
      if (isUniqueViolation(error)) throw AppException.conflict(CUI_TAKEN, { cui: [CUI_TAKEN] });
      throw error;
    }

    await this.activity.log({
      action: 'client.created',
      userId: auth.user.id,
      entityType: 'client',
      entityId: id,
      entityLabel: dto.name,
      ip: client.ip,
    });
    return this.get(id, auth);
  }

  async update(
    id: string,
    dto: UpdateClientDto,
    auth: AuthContext,
    client: ClientInfo,
  ): Promise<ClientDto> {
    const existing = await this.prisma.db.client.findFirst({
      where: { id, ...this.access.scope(auth.user) },
    });
    if (!existing) throw AppException.notFound('Clientul nu există.');

    const { responsibleIds, ...fields } = dto;
    if (responsibleIds !== undefined) {
      throw AppException.validation('Responsabilii se modifică din secțiunea dedicată.');
    }
    if (fields.cui !== undefined && fields.cui !== existing.cui) {
      await this.assertCuiAvailable(fields.cui, id);
    }

    // Doar câmpurile trimise efectiv și care diferă de valoarea curentă.
    const changes = definedChanges(fields, existing);
    const changedFields = Object.keys(changes);
    if (changedFields.length === 0) return this.get(id, auth);

    try {
      await this.prisma.db.client.update({
        where: { id },
        data: { ...changes, searchText: buildSearchText({ ...existing, ...changes }) },
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw AppException.conflict(CUI_TAKEN, { cui: [CUI_TAKEN] });
      throw error;
    }

    const base = {
      userId: auth.user.id,
      entityType: 'client',
      entityId: id,
      entityLabel: changes.name ?? existing.name,
      ip: client.ip,
    };
    if (changedFields.includes('isActive')) {
      await this.activity.log({
        ...base,
        action: changes.isActive ? 'client.activated' : 'client.deactivated',
      });
    }
    const otherFields = changedFields.filter((field) => field !== 'isActive');
    if (otherFields.length > 0) {
      await this.activity.log({
        ...base,
        action: 'client.updated',
        metadata: { fields: otherFields },
      });
    }
    return this.get(id, auth);
  }

  /** Șterge definitiv clientul împreună cu punctele de lucru, angajații și contractele lui. */
  async remove(id: string, auth: AuthContext, client: ClientInfo): Promise<void> {
    const existing = await this.prisma.db.client.findUnique({ where: { id } });
    if (!existing) throw AppException.notFound('Clientul nu există.');
    await this.prisma.db.client.delete({ where: { id } });
    await this.activity.log({
      action: 'client.deleted',
      userId: auth.user.id,
      entityType: 'client',
      entityId: id,
      entityLabel: existing.name,
      metadata: { cui: existing.cui },
      ip: client.ip,
    });
  }

  async setResponsibles(
    id: string,
    userIds: string[],
    auth: AuthContext,
    client: ClientInfo,
  ): Promise<ClientDto> {
    const existing = await this.prisma.db.client.findUnique({ where: { id } });
    if (!existing) throw AppException.notFound('Clientul nu există.');
    await this.assertActiveUsers(userIds);

    await this.prisma.db.$transaction([
      this.prisma.db.clientAssignment.deleteMany({
        where: { clientId: id, userId: { notIn: userIds } },
      }),
      this.prisma.db.clientAssignment.createMany({
        data: userIds.map((userId) => ({ clientId: id, userId })),
        skipDuplicates: true,
      }),
    ]);
    await this.activity.log({
      action: 'client.responsibles_updated',
      userId: auth.user.id,
      entityType: 'client',
      entityId: id,
      entityLabel: existing.name,
      metadata: { userIds },
      ip: client.ip,
    });
    return this.get(id, auth);
  }

  /**
   * Predă definitiv clientul de la un responsabil la altul: noul responsabil preia și
   * obligațiile, și task-urile deschise ale celui vechi pentru acest client.
   *
   * Un administrator poate transfera între oricare doi utilizatori. Un angajat își poate preda
   * doar propriii clienți; nu poate prelua singur clientul altcuiva.
   * (Pentru o singură deplasare este suficientă schimbarea responsabilului pe task.)
   */
  async transfer(
    id: string,
    fromUserId: string,
    toUserId: string,
    auth: AuthContext,
    client: ClientInfo,
  ): Promise<void> {
    const existing = await this.prisma.db.client.findFirst({
      where: { id, ...this.access.scope(auth.user) },
      include: { assignments: { select: { userId: true } } },
    });
    if (!existing) throw AppException.notFound('Clientul nu există.');

    if (auth.user.role !== 'ADMIN' && fromUserId !== auth.user.id) {
      throw AppException.forbidden('Poți preda doar clienții la care ești tu responsabil.');
    }
    if (fromUserId === toUserId) {
      throw AppException.validation('Alege un alt utilizator decât responsabilul actual.', {
        toUserId: ['Alege un alt utilizator decât responsabilul actual.'],
      });
    }
    const responsibleIds = existing.assignments.map((assignment) => assignment.userId);
    if (!responsibleIds.includes(fromUserId)) {
      throw AppException.validation('Utilizatorul ales nu este responsabil pentru acest client.', {
        fromUserId: ['Utilizatorul ales nu este responsabil pentru acest client.'],
      });
    }
    const target = await this.prisma.db.user.findFirst({
      where: { id: toUserId, isActive: true },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!target) {
      throw AppException.validation('Noul responsabil nu există sau este dezactivat.', {
        toUserId: ['Noul responsabil nu există sau este dezactivat.'],
      });
    }

    const [, , obligations, tasks] = await this.prisma.db.$transaction([
      this.prisma.db.clientAssignment.deleteMany({ where: { clientId: id, userId: fromUserId } }),
      this.prisma.db.clientAssignment.createMany({
        data: [{ clientId: id, userId: toUserId }],
        skipDuplicates: true,
      }),
      this.prisma.db.obligation.updateMany({
        where: { clientId: id, assigneeId: fromUserId },
        data: { assigneeId: toUserId },
      }),
      // Doar task-urile deschise își schimbă responsabilul; istoricul celor încheiate rămâne.
      this.prisma.db.task.updateMany({
        where: { clientId: id, assigneeId: fromUserId, status: { in: ['TODO', 'IN_PROGRESS'] } },
        data: { assigneeId: toUserId },
      }),
    ]);

    if (toUserId !== auth.user.id) {
      await this.prisma.db.notification.create({
        data: {
          userId: toUserId,
          type: 'CLIENT_TRANSFERRED',
          title: 'Ai preluat un client',
          body:
            tasks.count > 0
              ? `${existing.name} · ${tasks.count === 1 ? '1 task deschis' : `${tasks.count} task-uri deschise`}`
              : existing.name,
          dedupeKey: `client-transferred:${id}:${toUserId}:${Date.now()}`,
        },
      });
    }
    await this.activity.log({
      action: 'client.transferred',
      userId: auth.user.id,
      entityType: 'client',
      entityId: id,
      entityLabel: existing.name,
      metadata: { fromUserId, toUserId, obligations: obligations.count, tasks: tasks.count },
      ip: client.ip,
    });
  }

  async setServices(
    id: string,
    serviceIds: string[],
    auth: AuthContext,
    client: ClientInfo,
  ): Promise<ClientDto> {
    await this.access.assertAccess(id, auth.user);
    const found = await this.prisma.db.service.count({ where: { id: { in: serviceIds } } });
    if (found !== serviceIds.length) {
      throw AppException.validation('Unul dintre serviciile selectate nu mai există.');
    }

    await this.prisma.db.$transaction([
      this.prisma.db.clientService.deleteMany({
        where: { clientId: id, serviceId: { notIn: serviceIds } },
      }),
      this.prisma.db.clientService.createMany({
        data: serviceIds.map((serviceId) => ({ clientId: id, serviceId })),
        skipDuplicates: true,
      }),
    ]);
    const updated = await this.get(id, auth);
    await this.activity.log({
      action: 'client.services_updated',
      userId: auth.user.id,
      entityType: 'client',
      entityId: id,
      entityLabel: updated.name,
      ip: client.ip,
    });
    return updated;
  }

  /** Cifrele afișate pe pagina principală, calculate doar din clienții vizibili utilizatorului. */
  async summary(auth: AuthContext): Promise<ClientsSummaryDto> {
    const visibleActive: Prisma.ClientWhereInput = {
      ...this.access.scope(auth.user),
      isActive: true,
    };
    const horizon = todayDateOnly();
    horizon.setUTCDate(horizon.getUTCDate() + EXPIRING_WINDOW_DAYS);

    const [activeClients, activeEmployees, fees, expiring] = await Promise.all([
      this.prisma.db.client.count({ where: visibleActive }),
      this.prisma.db.employee.count({ where: { isActive: true, client: visibleActive } }),
      this.prisma.db.contractFee.findMany({
        where: { contract: { status: 'ACTIVE', client: visibleActive } },
        select: { amount: true, frequencyUnit: true, frequencyInterval: true },
      }),
      this.prisma.db.contract.findMany({
        where: { status: 'ACTIVE', endDate: { lte: horizon }, client: visibleActive },
        include: { client: { select: { name: true } } },
        orderBy: { endDate: 'asc' },
        take: 10,
      }),
    ]);

    return {
      activeClients,
      activeEmployees,
      monthlyEstimate: estimateFees(fees),
      expiringContracts: expiring.flatMap((contract) =>
        contract.endDate
          ? [
              {
                id: contract.id,
                clientId: contract.clientId,
                clientName: contract.client.name,
                number: contract.number,
                endDate: formatDateOnly(contract.endDate),
              },
            ]
          : [],
      ),
    };
  }

  /** „RO123” și „123” desemnează aceeași companie, deci verificăm ambele forme. */
  private async assertCuiAvailable(cui: string, exceptId?: string): Promise<void> {
    const digits = cui.replace(/^RO/, '');
    const existing = await this.prisma.db.client.findFirst({
      where: {
        cui: { in: [digits, `RO${digits}`] },
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (existing) throw AppException.conflict(CUI_TAKEN, { cui: [CUI_TAKEN] });
  }

  private async assertActiveUsers(userIds: string[]): Promise<void> {
    if (userIds.length === 0) return;
    const found = await this.prisma.db.user.count({
      where: { id: { in: userIds }, isActive: true },
    });
    if (found !== userIds.length) {
      throw AppException.validation(
        'Unul dintre responsabilii selectați nu există sau este dezactivat.',
      );
    }
  }
}
