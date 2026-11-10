import { Injectable } from '@nestjs/common';
import type { Prisma } from '@alconst/database';
import { type ContractDto, isRecurringUnit } from '@alconst/shared';
import { ActivityService } from '../activity/activity.service.js';
import { AppException } from '../common/app.exception.js';
import { formatDateOnly, parseDateOnly } from '../common/dates.js';
import type { AuthContext, ClientInfo } from '../common/request-context.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ClientAccessService } from './client-access.service.js';
import { contractInclude, toContractDto } from './client.mapper.js';
import type {
  ContractFeeInput,
  CreateContractDto,
  UpdateContractDto,
} from './dto/contracts.dto.js';

type Row = Prisma.ContractGetPayload<{ include: typeof contractInclude }>;

@Injectable()
export class ContractsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ClientAccessService,
    private readonly activity: ActivityService,
  ) {}

  async list(clientId: string, auth: AuthContext): Promise<ContractDto[]> {
    await this.access.assertAccess(clientId, auth.user);
    const rows = await this.prisma.db.contract.findMany({
      where: { clientId },
      include: contractInclude,
      orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map(toContractDto);
  }

  async create(
    dto: CreateContractDto,
    auth: AuthContext,
    client: ClientInfo,
  ): Promise<ContractDto> {
    await this.access.assertAccess(dto.clientId, auth.user);
    this.assertPeriod(dto.startDate, dto.endDate ?? null);
    const fees = await this.prepareFees(dto.fees ?? []);

    const row = await this.prisma.db.contract.create({
      data: {
        clientId: dto.clientId,
        number: dto.number ?? null,
        startDate: parseDateOnly(dto.startDate),
        endDate: dto.endDate ? parseDateOnly(dto.endDate) : null,
        status: dto.status ?? 'ACTIVE',
        notes: dto.notes ?? null,
        fees: { create: fees },
      },
      include: contractInclude,
    });
    await this.log('contract.created', row, auth, client);
    return toContractDto(row);
  }

  async update(
    id: string,
    dto: UpdateContractDto,
    auth: AuthContext,
    client: ClientInfo,
  ): Promise<ContractDto> {
    const existing = await this.find(id, auth);

    const startDate = dto.startDate ?? formatDateOnly(existing.startDate);
    const endDate =
      dto.endDate !== undefined
        ? dto.endDate
        : existing.endDate
          ? formatDateOnly(existing.endDate)
          : null;
    this.assertPeriod(startDate, endDate);
    const fees = dto.fees !== undefined ? await this.prepareFees(dto.fees) : undefined;

    // Tarifele se înlocuiesc integral, în aceeași tranzacție cu restul modificărilor.
    const row = await this.prisma.db.$transaction(async (tx) => {
      if (fees) await tx.contractFee.deleteMany({ where: { contractId: id } });
      return tx.contract.update({
        where: { id },
        data: {
          ...(dto.number !== undefined ? { number: dto.number } : {}),
          ...(dto.startDate !== undefined ? { startDate: parseDateOnly(dto.startDate) } : {}),
          ...(dto.endDate !== undefined
            ? { endDate: dto.endDate ? parseDateOnly(dto.endDate) : null }
            : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
          ...(fees ? { fees: { create: fees } } : {}),
        },
        include: contractInclude,
      });
    });
    // Încetarea unui contract apare distinct în jurnal; contractul rămâne în evidență.
    const ended = row.status === 'ENDED' && existing.status !== 'ENDED';
    await this.log(ended ? 'contract.ended' : 'contract.updated', row, auth, client);
    return toContractDto(row);
  }

  private async find(id: string, auth: AuthContext): Promise<Row> {
    const row = await this.prisma.db.contract.findFirst({
      where: { id, client: this.access.scope(auth.user) },
      include: contractInclude,
    });
    if (!row) throw AppException.notFound('Contractul nu există.');
    return row;
  }

  private assertPeriod(startDate: string, endDate: string | null): void {
    if (endDate && endDate < startDate) {
      throw AppException.validation('Data expirării nu poate fi înaintea datei de începere.', {
        endDate: ['Data expirării nu poate fi înaintea datei de începere.'],
      });
    }
  }

  /** Validează tarifele și le aduce la forma stocată. */
  private async prepareFees(
    fees: ContractFeeInput[],
  ): Promise<Prisma.ContractFeeUncheckedCreateWithoutContractInput[]> {
    fees.forEach((fee, index) => {
      if (!fee.serviceId && !fee.description) {
        throw AppException.validation(
          'Fiecare tarif trebuie să aibă un serviciu sau o descriere.',
          {
            [`fees.${index}.description`]: ['Alege un serviciu sau completează o descriere.'],
          },
        );
      }
    });

    const serviceIds = [...new Set(fees.flatMap((fee) => (fee.serviceId ? [fee.serviceId] : [])))];
    if (serviceIds.length > 0) {
      const found = await this.prisma.db.service.count({ where: { id: { in: serviceIds } } });
      if (found !== serviceIds.length) {
        throw AppException.validation('Unul dintre serviciile selectate nu mai există.');
      }
    }

    return fees.map((fee, position) => ({
      serviceId: fee.serviceId ?? null,
      description: fee.description ?? null,
      amount: fee.amount,
      frequencyUnit: fee.frequencyUnit,
      // Intervalul are sens doar pentru frecvențele exprimate în timp.
      frequencyInterval: isRecurringUnit(fee.frequencyUnit) ? (fee.frequencyInterval ?? 1) : 1,
      position,
    }));
  }

  private log(
    action: 'contract.created' | 'contract.updated' | 'contract.ended',
    row: Row,
    auth: AuthContext,
    client: ClientInfo,
  ): Promise<void> {
    return this.activity.log({
      action,
      userId: auth.user.id,
      entityType: 'contract',
      entityId: row.id,
      entityLabel: row.number ? `Contract ${row.number}` : 'Contract',
      metadata: { clientId: row.clientId },
      ip: client.ip,
    });
  }
}
