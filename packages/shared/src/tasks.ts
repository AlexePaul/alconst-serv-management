import type { UserRefDto } from './clients.js';
import { addDays, addMonths, diffDays, endOfMonth, startOfMonth, startOfWeek } from './dates.js';

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
  GENERAL: 'Altă activitate',
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

// --- Perioada unui termen ----------------------------------------------------------------------

/** Perioada în care un termen recurent poate fi îndeplinit la timp (capete incluse). */
export interface TaskPeriod {
  start: string;
  end: string;
}

/**
 * Perioada din care face parte o apariție, pentru obligațiile cu termen flexibil: o activitate
 * lunară (sau la N luni, anuală) poate fi făcută oricând în luna în care cade, iar una săptămânală
 * (sau la N săptămâni) oricând în săptămâna respectivă, de luni până duminică.
 * Frecvențele exprimate în zile nu au perioadă: termenul este ziua însăși.
 */
export function occurrencePeriod(unit: RecurrenceUnit, date: string): TaskPeriod | null {
  switch (unit) {
    case 'DAY':
      return null;
    case 'WEEK': {
      const start = startOfWeek(date);
      return { start, end: addDays(start, 6) };
    }
    case 'MONTH':
    case 'YEAR':
      return { start: startOfMonth(date), end: endOfMonth(date) };
  }
}

/**
 * Prima zi din care se generează task-uri. Pentru termenele flexibile este începutul perioadei
 * curente: apariția lunii în curs este încă „la timp”, chiar dacă data ei planificată a trecut.
 */
export function generationStart(
  unit: RecurrenceUnit,
  dueWithinPeriod: boolean,
  today: string,
): string {
  return (dueWithinPeriod ? occurrencePeriod(unit, today)?.start : undefined) ?? today;
}

/**
 * Ultima zi în care un task este considerat „la timp”. Data planificată poate fi mutată liber;
 * task-ul devine restant abia după ce au trecut atât data planificată, cât și sfârșitul perioadei.
 */
export function taskDeadline(task: { dueDate: string; periodEnd?: string | null }): string {
  return task.periodEnd && task.periodEnd > task.dueDate ? task.periodEnd : task.dueDate;
}

const MONTH_NAMES = [
  'ianuarie',
  'februarie',
  'martie',
  'aprilie',
  'mai',
  'iunie',
  'iulie',
  'august',
  'septembrie',
  'octombrie',
  'noiembrie',
  'decembrie',
];
const MONTH_SHORT = [
  'ian.',
  'feb.',
  'mar.',
  'apr.',
  'mai',
  'iun.',
  'iul.',
  'aug.',
  'sept.',
  'oct.',
  'nov.',
  'dec.',
];

/**
 * Câte luni are ciclul unei recurențe care cade în aceleași luni în fiecare an
 * (la 2, 3, 4 sau 6 luni, ori anual); 0 pentru celelalte frecvențe.
 */
function monthCycleLength(unit: RecurrenceUnit, interval: number): number {
  const months = unit === 'YEAR' && interval === 1 ? 12 : unit === 'MONTH' ? interval : 0;
  return months >= 2 && 12 % months === 0 ? months : 0;
}

/**
 * Variantele de luni dintre care se poate alege pentru o frecvență. Pentru „la 3 luni”:
 * ianuarie–aprilie–iulie–octombrie, februarie–mai–august–noiembrie sau
 * martie–iunie–septembrie–decembrie. Lista este goală dacă frecvența nu are luni fixe.
 */
export function monthCycleOptions(unit: RecurrenceUnit, interval: number): number[][] {
  const length = monthCycleLength(unit, interval);
  return Array.from({ length }, (_, first) =>
    Array.from({ length: 12 / length }, (_, index) => first + index * length + 1),
  );
}

/** Lunile anului (1–12) în care cade o recurență; null dacă nu sunt aceleași în fiecare an. */
export function recurrenceMonths(
  unit: RecurrenceUnit,
  interval: number,
  startDate: string,
): number[] | null {
  const options = monthCycleOptions(unit, interval);
  if (options.length === 0) return null;
  return options[(Number(startDate.slice(5, 7)) - 1) % options.length] ?? null;
}

/**
 * Mută prima dată a unei recurențe în lunile alese, păstrând ziua din lună: rezultatul cade în
 * prima lună din `months` începând cu luna lui `from` (de regulă luna curentă). Astfel, o
 * schimbare făcută în noiembrie către un ciclu care conține noiembrie are efect chiar din
 * luna în curs.
 */
export function alignToMonthCycle(startDate: string, months: number[], from: string): string {
  const base = startOfMonth(from);
  const day = Number(startDate.slice(8, 10));
  for (let offset = 0; offset < 12; offset++) {
    const month = addMonths(base, offset);
    if (!months.includes(Number(month.slice(5, 7)))) continue;
    const lastDay = Number(endOfMonth(month).slice(8, 10));
    return addDays(month, Math.min(day, lastDay) - 1);
  }
  return startDate;
}

/** Ex.: „ian., apr., iul., oct.”. */
export function formatMonthList(months: number[]): string {
  return months.map((month) => MONTH_SHORT[month - 1]).join(', ');
}

/** Ex.: „noiembrie 2026” pentru o lună întreagă, „9–15 nov. 2026” pentru o săptămână. */
export function formatPeriod(start: string, end: string): string {
  const [startYear, startMonth, startDay] = start.split('-').map(Number) as [
    number,
    number,
    number,
  ];
  const [endYear, endMonth, endDay] = end.split('-').map(Number) as [number, number, number];
  if (start === startOfMonth(start) && end === endOfMonth(start)) {
    return `${MONTH_NAMES[startMonth - 1]} ${startYear}`;
  }
  if (startYear === endYear && startMonth === endMonth) {
    return `${startDay}–${endDay} ${MONTH_SHORT[endMonth - 1]} ${endYear}`;
  }
  const from = `${startDay} ${MONTH_SHORT[startMonth - 1]}${startYear === endYear ? '' : ` ${startYear}`}`;
  return `${from} – ${endDay} ${MONTH_SHORT[endMonth - 1]} ${endYear}`;
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
  /** Numărul de angajați cunoscut al clientului; se reconfirmă la finalizarea unei deplasări. */
  employeeCount: number | null;
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
  /**
   * Data planificată, `YYYY-MM-DD`. Pentru task-urile fără perioadă este și termenul-limită.
   */
  dueDate: string;
  /**
   * Perioada în care task-ul poate fi făcut la timp (ex. luna), pentru termenele flexibile.
   * Task-ul devine restant abia după `periodEnd`. Null = termenul este exact `dueDate`.
   */
  periodStart: string | null;
  periodEnd: string | null;
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
  /**
   * Data planificată a trecut, dar perioada (luna, săptămâna) nu s-a încheiat: încă la timp.
   */
  inPeriod: TaskDto[];
  dueToday: TaskDto[];
  /** Următoarele 7 zile, fără azi. */
  upcoming: TaskDto[];
  counts: { overdue: number; inPeriod: number; dueToday: number; upcoming: number };
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
  /**
   * Termen flexibil: activitatea poate fi făcută oricând în luna (sau săptămâna) în care cade
   * și devine restanță abia după încheierea perioadei. Fără efect la frecvențele în zile.
   */
  dueWithinPeriod: boolean;
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
