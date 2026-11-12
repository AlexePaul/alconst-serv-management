import type { UserRole } from './auth.js';

/** Referință scurtă către un utilizator intern (ex. responsabilul unui client). */
export interface UserRefDto {
  id: string;
  firstName: string;
  lastName: string;
}

export interface UserOptionDto extends UserRefDto {
  role: UserRole;
}

// --- Servicii ----------------------------------------------------------------------------------

export interface ServiceDto {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  /** Numărul de clienți cărora le este prestat serviciul. */
  clientCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceRefDto {
  id: string;
  name: string;
}

// --- Clienți -----------------------------------------------------------------------------------

export interface ClientListItemDto {
  id: string;
  name: string;
  cui: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  isActive: boolean;
  responsibles: UserRefDto[];
  /**
   * Câți angajați are clientul; null dacă nu se știe încă. Aplicația ține doar numărul –
   * nu se stochează date despre persoane.
   */
  employeeCount: number | null;
  locationCount: number;
}

export interface ClientDto extends ClientListItemDto {
  tradeRegisterNumber: string | null;
  address: string | null;
  legalRepresentative: string | null;
  notes: string | null;
  /** Când a fost confirmat ultima dată numărul de angajați (de regulă la o deplasare). */
  employeeCountCheckedAt: string | null;
  services: ServiceRefDto[];
  /** Venitul lunar estimat din tarifele recurente ale contractelor active (lei). */
  monthlyEstimate: number;
  createdAt: string;
  updatedAt: string;
}

/** Limita superioară acceptată pentru numărul de angajați ai unui client. */
export const MAX_EMPLOYEE_COUNT = 100_000;

/** Format acceptat pentru CUI: opțional prefixul „RO”, urmat de 2–10 cifre. */
export const CUI_PATTERN = /^(RO)?\d{2,10}$/;

/** Elimină spațiile și trece la majuscule: „ro 123 456” → „RO123456”. */
export function normalizeCui(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase();
}

// --- Persoane de contact -----------------------------------------------------------------------

/** O persoană de contact a clientului, pe lângă contactul principal. */
export interface ClientContactDto {
  id: string;
  clientId: string;
  /** Rolul, în cuvintele utilizatorului (ex. „Administrator”). */
  label: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
}

/** Un contact fără telefon și fără email nu ajută pe nimeni. */
export const CONTACT_METHOD_REQUIRED = 'Completează telefonul sau emailul.';

// --- Puncte de lucru ---------------------------------------------------------------------------

export interface LocationDto {
  id: string;
  clientId: string;
  name: string;
  address: string | null;
  notes: string | null;
  isActive: boolean;
}

// --- Contracte și tarife -----------------------------------------------------------------------

export const CONTRACT_STATUSES = ['DRAFT', 'ACTIVE', 'ENDED'] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

export const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  DRAFT: 'În pregătire',
  ACTIVE: 'Activ',
  ENDED: 'Încheiat',
};

export const FEE_FREQUENCY_UNITS = ['WEEK', 'MONTH', 'YEAR', 'VISIT', 'ONCE'] as const;
export type FeeFrequencyUnit = (typeof FEE_FREQUENCY_UNITS)[number];

export const FEE_FREQUENCY_UNIT_LABELS: Record<FeeFrequencyUnit, string> = {
  WEEK: 'Săptămâni',
  MONTH: 'Luni',
  YEAR: 'Ani',
  VISIT: 'La fiecare deplasare',
  ONCE: 'O singură dată',
};

/** Unitățile pentru care are sens un interval („la fiecare N …”). */
export function isRecurringUnit(unit: FeeFrequencyUnit): unit is 'WEEK' | 'MONTH' | 'YEAR' {
  return unit === 'WEEK' || unit === 'MONTH' || unit === 'YEAR';
}

export interface ContractFeeDto {
  id: string;
  serviceId: string | null;
  serviceName: string | null;
  description: string | null;
  /** Suma în lei. */
  amount: number;
  frequencyUnit: FeeFrequencyUnit;
  frequencyInterval: number;
}

export interface ContractDto {
  id: string;
  clientId: string;
  number: string | null;
  /** `YYYY-MM-DD` */
  startDate: string;
  /** `YYYY-MM-DD`; null = perioadă nedeterminată. */
  endDate: string | null;
  status: ContractStatus;
  notes: string | null;
  fees: ContractFeeDto[];
  /** Echivalentul lunar al tarifelor recurente (lei). */
  monthlyEstimate: number;
}

/** Ex.: „lunar”, „la 3 luni”, „săptămânal”, „la fiecare deplasare”. */
export function formatFeeFrequency(unit: FeeFrequencyUnit, interval: number): string {
  switch (unit) {
    case 'VISIT':
      return 'la fiecare deplasare';
    case 'ONCE':
      return 'o singură dată';
    case 'WEEK':
      return interval === 1 ? 'săptămânal' : `la ${interval} săptămâni`;
    case 'MONTH':
      return interval === 1 ? 'lunar' : `la ${interval} luni`;
    case 'YEAR':
      return interval === 1 ? 'anual' : `la ${interval} ani`;
  }
}

const WEEKS_PER_MONTH = 52 / 12;

/**
 * Echivalentul lunar al unui tarif recurent. Tarifele „la deplasare” și cele unice nu au un
 * echivalent lunar (depind de numărul deplasărilor), deci întorc `null`.
 */
export function monthlyEquivalent(fee: {
  amount: number;
  frequencyUnit: FeeFrequencyUnit;
  frequencyInterval: number;
}): number | null {
  const interval = Math.max(1, fee.frequencyInterval);
  switch (fee.frequencyUnit) {
    case 'WEEK':
      return (fee.amount * WEEKS_PER_MONTH) / interval;
    case 'MONTH':
      return fee.amount / interval;
    case 'YEAR':
      return fee.amount / (12 * interval);
    default:
      return null;
  }
}

/** Suma echivalentelor lunare, rotunjită la bani. */
export function monthlyEstimate(
  fees: { amount: number; frequencyUnit: FeeFrequencyUnit; frequencyInterval: number }[],
): number {
  const total = fees.reduce((sum, fee) => sum + (monthlyEquivalent(fee) ?? 0), 0);
  return Math.round(total * 100) / 100;
}

// --- Sumar pentru pagina principală ------------------------------------------------------------

export interface ExpiringContractDto {
  id: string;
  clientId: string;
  clientName: string;
  number: string | null;
  endDate: string;
}

export interface ClientsSummaryDto {
  activeClients: number;
  /** Suma angajaților declarați ai clienților activi vizibili utilizatorului. */
  totalEmployees: number;
  /** Venitul lunar estimat din contractele active ale clienților vizibili utilizatorului. */
  monthlyEstimate: number;
  /** Contracte active care expiră în următoarele 30 de zile sau au expirat deja. */
  expiringContracts: ExpiringContractDto[];
}

// --- Predarea clienților între colegi ----------------------------------------------------------

export const TRANSFER_REQUEST_STATUSES = ['PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED'] as const;
export type TransferRequestStatus = (typeof TRANSFER_REQUEST_STATUSES)[number];

/**
 * Cerere de predare definitivă a unui client. O poate iniția oricare dintre cei doi colegi
 * și are efect doar după acordul celuilalt; administratorii transferă direct.
 */
export interface ClientTransferRequestDto {
  id: string;
  client: { id: string; name: string };
  /** Responsabilul actual, care predă. */
  from: UserRefDto;
  /** Colegul care preia. */
  to: UserRefDto;
  initiatedBy: UserRefDto;
  createdAt: string;
  /** Utilizatorul curent este cel al cărui acord se așteaptă (sau este administrator). */
  canRespond: boolean;
  /** Utilizatorul curent a inițiat cererea și o poate retrage. */
  canCancel: boolean;
}

/** Rezultatul unei solicitări de transfer: efectuat pe loc (administrator) sau în așteptare. */
export interface TransferResultDto {
  status: 'COMPLETED' | 'PENDING';
}
