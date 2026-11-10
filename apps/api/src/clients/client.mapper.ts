import type { Prisma } from '@alconst/database';
import {
  type ClientDto,
  type ClientListItemDto,
  type ContractDto,
  type ContractFeeDto,
  monthlyEstimate,
} from '@alconst/shared';
import { formatDateOnly } from '../common/dates.js';

const userRef = { select: { id: true, firstName: true, lastName: true } } as const;

/** Relațiile necesare pentru afișarea unui client într-o listă. */
export const clientListInclude = {
  assignments: {
    include: { user: userRef },
    orderBy: { createdAt: 'asc' },
  },
  // Numărăm doar ce este în vigoare; angajații și punctele de lucru arhivate rămân în evidență.
  _count: {
    select: {
      employees: { where: { isActive: true } },
      locations: { where: { isActive: true } },
    },
  },
} satisfies Prisma.ClientInclude;

export const contractInclude = {
  fees: {
    include: { service: { select: { name: true } } },
    orderBy: { position: 'asc' },
  },
} satisfies Prisma.ContractInclude;

/** Relațiile necesare pentru pagina de detalii a unui client. */
export const clientDetailInclude = {
  ...clientListInclude,
  services: {
    include: { service: { select: { id: true, name: true } } },
    orderBy: { service: { name: 'asc' } },
  },
  contracts: { where: { status: 'ACTIVE' }, include: { fees: true } },
} satisfies Prisma.ClientInclude;

type ClientListRow = Prisma.ClientGetPayload<{ include: typeof clientListInclude }>;
type ClientDetailRow = Prisma.ClientGetPayload<{ include: typeof clientDetailInclude }>;
type ContractRow = Prisma.ContractGetPayload<{ include: typeof contractInclude }>;
type FeeAmounts = Pick<
  Prisma.ContractFeeGetPayload<object>,
  'amount' | 'frequencyUnit' | 'frequencyInterval'
>;

export function toClientListItem(row: ClientListRow): ClientListItemDto {
  return {
    id: row.id,
    name: row.name,
    cui: row.cui,
    contactPerson: row.contactPerson,
    phone: row.phone,
    email: row.email,
    isActive: row.isActive,
    responsibles: row.assignments.map((assignment) => assignment.user),
    employeeCount: row._count.employees,
    locationCount: row._count.locations,
  };
}

/** Suma echivalentelor lunare ale tarifelor recurente. */
export function estimateFees(fees: FeeAmounts[]): number {
  return monthlyEstimate(
    fees.map((fee) => ({
      amount: fee.amount.toNumber(),
      frequencyUnit: fee.frequencyUnit,
      frequencyInterval: fee.frequencyInterval,
    })),
  );
}

export function toClientDto(row: ClientDetailRow): ClientDto {
  return {
    ...toClientListItem(row),
    tradeRegisterNumber: row.tradeRegisterNumber,
    address: row.address,
    legalRepresentative: row.legalRepresentative,
    notes: row.notes,
    services: row.services.map((entry) => entry.service),
    monthlyEstimate: estimateFees(row.contracts.flatMap((contract) => contract.fees)),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toContractDto(row: ContractRow): ContractDto {
  const fees: ContractFeeDto[] = row.fees.map((fee) => ({
    id: fee.id,
    serviceId: fee.serviceId,
    serviceName: fee.service?.name ?? null,
    description: fee.description,
    amount: fee.amount.toNumber(),
    frequencyUnit: fee.frequencyUnit,
    frequencyInterval: fee.frequencyInterval,
  }));
  return {
    id: row.id,
    clientId: row.clientId,
    number: row.number,
    startDate: formatDateOnly(row.startDate),
    endDate: row.endDate ? formatDateOnly(row.endDate) : null,
    status: row.status,
    notes: row.notes,
    fees,
    monthlyEstimate: monthlyEstimate(fees),
  };
}
