import type { UserRefDto } from './clients.js';
import { addDays, addMonths, diffDays } from './dates.js';

// --- Enumerări ---------------------------------------------------------------------------------

export const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  TODO: 'De făcut',
  IN_PROGRESS: 'În lucru',
  DONE: 'Finalizat',
  CANCELLED: 'Anulat',
};

/** Statusurile în care un task mai are nevoie de atenție. */
export const OPEN_TASK_STATUSES: readonly TaskStatus[] = ['TODO', 'IN_PROGRESS'];

export function isOpenTask(status: TaskStatus): boolean {
  return OPEN_TASK_STATUSES.includes(status);
}

export const TASK_PRIORITIES = ['LOW', 'NORMAL', 'HIGH'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  LOW: 'Scăzută',
  NORMAL: 'Normală',
  HIGH: 'Ridicată',
};

/**
 * Felul activității. O deplasare înseamnă mersul la client și completarea fișelor;
 * nu are nicio legătură obligatorie cu facturarea.
 */
export const TASK_KINDS = ['GENERAL', 'VISIT'] as const;
export type TaskKind = (typeof TASK_KINDS)[number];

export const TASK_KIND_LABELS: Record<TaskKind, string> = {
  GENERAL: 'Activitate',
  VISIT: 'Deplasare',
};

export const RECURRENCE_UNITS = ['DAY', 'WEEK', 'MONTH', 'YEAR'] as const;
export type RecurrenceUnit = (typeof RECURRENCE_UNITS)[number];

/** Cu câte zile în avans se generează task-urile din obligații. */
export const DEFAULT_TASK_HORIZON_DAYS = 60;

// --- Recurență ---------------------------------------------------------------------------------

/** Ex.: „lunar”, „la 3 luni”, „săptămânal”, „la 2 săptămâni”. */
export function formatRecurrence(unit: RecurrenceUnit, interval: number): string {
  switch (unit) {
    case 'DAY':
      return interval === 1 ? 'zilnic' : `la ${interval} zile`;
    case 'WEEK':
      return interval === 1 ? 'săptămânal' : `la ${interval} săptămâni`;
    case 'MONTH':
      return interval === 1 ? 'lunar' : `la ${interval} luni`;
    case 'YEAR':
      return interval === 1 ? 'anual' : `la ${interval} ani`;
  }
}

/** A `index`-a apariție (0 = data de început). Se calculează mereu de la început, fără derivă. */
function occurrenceAt(
  start: string,
  unit: RecurrenceUnit,
  interval: number,
  index: number,
): string {
  switch (unit) {
    case 'DAY':
      return addDays(start, index * interval);
    case 'WEEK':
      return addDays(start, index * interval * 7);
    case 'MONTH':
      return addMonths(start, index * interval);
    case 'YEAR':
      return addMonths(start, index * interval * 12);
  }
}

export interface Recurrence {
  /** Prima apariție, `YYYY-MM-DD`. */
  startDate: string;
  /** Ultima zi în care mai pot exista apariții; null = fără sfârșit. */
  endDate?: string | null;
  unit: RecurrenceUnit;
  interval: number;
}

/**
 * Aparițiile unei recurențe în intervalul [from, to] (inclusiv).
 * `limit` protejează împotriva intervalelor foarte lungi.
 */
export function occurrencesBetween(
  recurrence: Recurrence,
  from: string,
  to: string,
  limit = 400,
): string[] {
  const interval = Math.max(1, Math.floor(recurrence.interval));
  const last = recurrence.endDate && recurrence.endDate < to ? recurrence.endDate : to;
  if (last < recurrence.startDate || last < from) return [];

  // Estimăm indexul primei apariții din interval, apoi corectăm (lunile au lungimi diferite).
  // Supraestimăm lungimea pasului, ca indexul de pornire să fie sigur înaintea primei apariții căutate.
  const maxDaysPerStep = { DAY: 1, WEEK: 7, MONTH: 31, YEAR: 366 }[recurrence.unit] * interval;
  let index = Math.max(0, Math.floor(diffDays(recurrence.startDate, from) / maxDaysPerStep) - 1);
  while (occurrenceAt(recurrence.startDate, recurrence.unit, interval, index) < from) index++;

  const result: string[] = [];
  while (result.length < limit) {
    const date = occurrenceAt(recurrence.startDate, recurrence.unit, interval, index++);
    if (date > last) break;
    result.push(date);
  }
  return result;
}

/** Prima apariție în ziua `onOrAfter` sau după ea; null dacă recurența s-a încheiat. */
export function nextOccurrence(recurrence: Recurrence, onOrAfter: string): string | null {
  const from = recurrence.startDate > onOrAfter ? recurrence.startDate : onOrAfter;
  return occurrencesBetween(recurrence, from, '9999-12-31', 1)[0] ?? null;
}

// --- Interval orar -----------------------------------------------------------------------------

/** Ora în format `HH:mm` (24 de ore). */
export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Ex.: „10:00–12:00”, „de la 10:00”; null dacă nu este stabilit niciun interval. */
export function formatTimeRange(
  startTime: string | null | undefined,
  endTime: string | null | undefined,
): string | null {
  if (!startTime) return null;
  return endTime ? `${startTime}–${endTime}` : `de la ${startTime}`;
}

// --- DTO-uri -----------------------------------------------------------------------------------

export interface ClientRefDto {
  id: string;
  name: string;
}

/**
 * Datele clientului de care are nevoie cel care execută task-ul (unde merge, pe cine caută).
 * Sunt vizibile și unui coleg care preia task-ul fără a avea acces la restul datelor clientului.
 */
export interface TaskClientDto extends ClientRefDto {
  address: string | null;
  contactPerson: string | null;
  phone: string | null;
  /** Responsabilii clientului – colegii de la care a fost preluat task-ul, dacă este o înlocuire. */
  responsibles: UserRefDto[];
}

export interface TaskDto {
  id: string;
  title: string;
  description: string | null;
  notes: string | null;
  kind: TaskKind;
  status: TaskStatus;
  priority: TaskPriority;
  /** Termenul, `YYYY-MM-DD`. */
  dueDate: string;
  /** Intervalul orar estimat (`HH:mm`), dacă a fost stabilit. */
  startTime: string | null;
  endTime: string | null;
  client: TaskClientDto | null;
  location: { id: string; name: string; address: string | null } | null;
  assignee: UserRefDto | null;
  /** Responsabilul task-ului nu este responsabil al clientului: a preluat doar această activitate. */
  isCover: boolean;
  /** Doar pentru deplasări: s-a confirmat completarea fișelor. */
  sheetsCompleted: boolean;
  sheetsCompletedAt: string | null;
  /** Obligația din care a fost generat task-ul, dacă există. */
  obligation: { id: string; title: string } | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskHistoryEntryDto {
  id: string;
  action: string;
  createdAt: string;
  user: UserRefDto | null;
  /** Câmpurile modificate, cu valoarea veche și cea nouă (deja formatate pentru afișare). */
  changes: { field: string; from: string | null; to: string | null }[];
}

export interface TasksOverviewDto {
  /** Data de azi folosită la calcul, în fusul orar al firmei. */
  today: string;
  overdue: TaskDto[];
  dueToday: TaskDto[];
  /** Următoarele 7 zile, fără azi. */
  upcoming: TaskDto[];
  counts: { overdue: number; dueToday: number; upcoming: number };
  /** Deplasări finalizate pentru care nu s-a confirmat completarea fișelor. */
  visitsMissingSheets: number;
}

export interface ObligationDto {
  id: string;
  title: string;
  description: string | null;
  kind: TaskKind;
  client: ClientRefDto | null;
  location: { id: string; name: string } | null;
  assignee: UserRefDto | null;
  priority: TaskPriority;
  recurrenceUnit: RecurrenceUnit;
  recurrenceInterval: number;
  startDate: string;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  isActive: boolean;
  /** Următorul termen: cel mai apropiat task deschis sau următoarea apariție calculată. */
  nextDueDate: string | null;
  openTaskCount: number;
  createdAt: string;
  updatedAt: string;
}

// --- Notificări --------------------------------------------------------------------------------

export const NOTIFICATION_TYPES = [
  'TASK_ASSIGNED',
  'TASK_DUE_SOON',
  'TASK_DUE_TODAY',
  'TASK_OVERDUE',
  'CLIENT_TRANSFERRED',
  'TRANSFER_REQUESTED',
  'TRANSFER_ACCEPTED',
  'TRANSFER_DECLINED',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface NotificationDto {
  id: string;
  type: NotificationType | string;
  title: string;
  body: string | null;
  taskId: string | null;
  /** Pagina din aplicație la care trimite notificarea, când nu se referă la un task. */
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationSettingsDto {
  /**
   * Notificări pe email: imediat pentru evenimente (task atribuit, cereri de preluare)
   * și cel mult un rezumat pe zi pentru termene.
   */
  emailEnabled: boolean;
  /** Cu câte zile înainte de termen se trimite reamintirea (0 = fără reamintire în avans). */
  remindDaysBefore: number;
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettingsDto = {
  emailEnabled: true,
  remindDaysBefore: 3,
};

export const MAX_REMIND_DAYS_BEFORE = 30;
