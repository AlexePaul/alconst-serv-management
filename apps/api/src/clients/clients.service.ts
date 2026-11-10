import { Injectable } from '@nestjs/common';
import { generateObligationTasks, lockObligations, type Prisma } from '@alconst/database';
import {
  type ClientDto,
  type ClientListItemDto,
  type ClientsSummaryDto,
  normalizeSearch,
  type Paginated,
} from '@alconst/shared';
import { ActivityService } from '../activity/activity.service.js';
import { AppException } from '../common/app.exception.js';
import { formatDateOnly, parseDateOnly } from '../common/dates.js';
import { definedChanges } from '../common/changes.js';
import { statusWhere } from '../common/pagination.js';
import { isUniqueViolation } from '../common/prisma-errors.js';
import type { AuthContext, ClientInfo } from '../common/request-context.js';
import { AppConfig } from '../config/app-config.js';
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
    private readonly config: AppConfig,
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

    const data = { ...changes, searchText: buildSearchText({ ...existing, ...changes }) };
    try {
      if (changes.isActive === false) {
        await this.archive(id, data);
      } else {
        await this.prisma.db.client.update({ where: { id }, data });
      }
    } catch (error) {
      if (isUniqueViolation(error)) throw AppException.conflict(CUI_TAKEN, { cui: [CUI_TAKEN] });
      throw error;
    }
    // La reactivare, obligațiile clientului își reiau programul de azi încolo.
    if (changes.isActive === true) {
      await generateObligationTasks(this.prisma.db, {
        today: this.config.today(),
        horizonDays: this.config.taskHorizonDays,
        clientId: id,
      });
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
    // „Azi” în fusul orar al firmei, nu în UTC.
    const horizon = parseDateOnly(this.config.today());
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

  /**
   * Arhivarea unui client nu șterge nimic din evidență: punctele de lucru, angajații, contractele,
   * obligațiile și task-urile rămân. Obligațiile sunt suspendate cât timp clientul este arhivat,
   * iar task-urile lor viitoare neîncepute (create automat, în avans) sunt retrase, ca să nu
   * apară drept restanțe; la reactivare sunt generate din nou.
   */
  private async archive(id: string, data: Prisma.ClientUncheckedUpdateInput): Promise<void> {
    const today = parseDateOnly(this.config.today());
    await this.prisma.db.$transaction(async (tx) => {
      // Același blocaj ca la generarea task-urilor, ca o rulare simultană să nu le recreeze.
      await lockObligations(tx, { clientId: id });
      await tx.client.update({ where: { id }, data });
      await tx.task.deleteMany({
        where: {
          clientId: id,
          obligationId: { not: null },
          status: 'TODO',
          occurrenceDate: { gte: today },
        },
      });
    });
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
