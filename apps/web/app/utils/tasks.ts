import type { RecurrenceUnit, TaskDto, TaskKind, TaskPriority, TaskStatus } from '@alconst/shared'
import { diffDays, formatPeriod, isOpenTask, taskDeadline, todayIn } from '@alconst/shared'
import { countLabel, formatDate } from './format'

/** Data de azi în fusul orar al firmei – aceeași referință ca pe server. */
export function todayLocal(): string {
  return todayIn()
}

type BadgeColor = 'error' | 'warning' | 'neutral' | 'success' | 'info' | 'primary'

export const TASK_STATUS_COLORS: Record<TaskStatus, BadgeColor> = {
  TODO: 'neutral',
  IN_PROGRESS: 'info',
  DONE: 'success',
  CANCELLED: 'neutral'
}

export const TASK_KIND_ICONS: Record<TaskKind, string> = {
  GENERAL: 'i-lucide-clipboard-list',
  VISIT: 'i-lucide-car'
}

export const TASK_PRIORITY_COLORS: Record<TaskPriority, BadgeColor> = {
  LOW: 'neutral',
  NORMAL: 'neutral',
  HIGH: 'error'
}

const weekdayFormat = new Intl.DateTimeFormat('ro-RO', { weekday: 'long', day: 'numeric', month: 'short' })
const shortDateFormat = new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'short' })
const shortDate = (value: string) => shortDateFormat.format(new Date(`${value}T00:00:00`))

export interface DueInfo {
  label: string
  color: BadgeColor
  overdue: boolean
}

/**
 * Cum se afișează termenul unui task: „Restant de 3 zile”, „Azi”, „Mâine”, „vineri, 14 nov.”.
 *
 * La termenele flexibile (de făcut oricând în lună sau în săptămână), un task a cărui dată
 * planificată a trecut nu este restant cât timp perioada nu s-a încheiat: apare „până la 30 nov.”.
 */
export function taskDueInfo(task: Pick<TaskDto, 'dueDate' | 'status'> & { periodEnd?: string | null }, today: string): DueInfo {
  if (!isOpenTask(task.status)) return { label: formatDate(task.dueDate), color: 'neutral', overdue: false }
  const days = diffDays(today, task.dueDate)
  if (days < 0) {
    const deadline = taskDeadline(task)
    const late = diffDays(deadline, today)
    if (late > 0) return { label: `Restant de ${countLabel(late, 'zi', 'zile')}`, color: 'error', overdue: true }
    return { label: late === 0 ? 'Ultima zi' : `până la ${shortDate(deadline)}`, color: 'warning', overdue: false }
  }
  if (days === 0) return { label: 'Azi', color: 'warning', overdue: false }
  if (days === 1) return { label: 'Mâine', color: 'neutral', overdue: false }
  if (days <= 7) return { label: weekdayFormat.format(new Date(`${task.dueDate}T00:00:00`)), color: 'neutral', overdue: false }
  return { label: formatDate(task.dueDate), color: 'neutral', overdue: false }
}

/** Perioada unui task cu termen flexibil, ex. „noiembrie 2026”; null dacă termenul este o zi anume. */
export function taskPeriodLabel(task: Pick<TaskDto, 'periodStart' | 'periodEnd'>): string | null {
  return task.periodStart && task.periodEnd ? formatPeriod(task.periodStart, task.periodEnd) : null
}

export const TASK_GROUPS = ['overdue', 'pending', 'today', 'week', 'later'] as const
export type TaskGroup = (typeof TASK_GROUPS)[number]

export const TASK_GROUP_LABELS: Record<TaskGroup, string> = {
  overdue: 'Restante',
  pending: 'Încă în termen',
  today: 'Azi',
  week: 'Următoarele 7 zile',
  later: 'Mai târziu'
}

type Schedulable = Pick<TaskDto, 'dueDate'> & { periodEnd?: string | null }

export function taskGroup(task: Schedulable, today: string): TaskGroup {
  const days = diffDays(today, task.dueDate)
  // Data planificată a trecut: restant doar dacă s-a încheiat și perioada.
  if (days < 0) return taskDeadline(task) < today ? 'overdue' : 'pending'
  if (days === 0) return 'today'
  return days <= 7 ? 'week' : 'later'
}

/** Împarte o listă de task-uri deschise (deja ordonată după termen) pe grupe de urgență. */
export function groupTasks<T extends Schedulable>(tasks: T[], today: string): { group: TaskGroup, tasks: T[] }[] {
  return TASK_GROUPS
    .map(group => ({ group, tasks: tasks.filter(task => taskGroup(task, today) === group) }))
    .filter(entry => entry.tasks.length > 0)
}

/** Opțiunile de frecvență oferite în formularul de obligație; „custom” deschide alegerea liberă. */
export const RECURRENCE_PRESETS = [
  { value: 'WEEK:1', label: 'Săptămânal', unit: 'WEEK', interval: 1 },
  { value: 'WEEK:2', label: 'La 2 săptămâni', unit: 'WEEK', interval: 2 },
  { value: 'MONTH:1', label: 'Lunar', unit: 'MONTH', interval: 1 },
  { value: 'MONTH:3', label: 'La 3 luni', unit: 'MONTH', interval: 3 },
  { value: 'MONTH:6', label: 'La 6 luni', unit: 'MONTH', interval: 6 },
  { value: 'YEAR:1', label: 'Anual', unit: 'YEAR', interval: 1 }
] as const satisfies { value: string, label: string, unit: RecurrenceUnit, interval: number }[]

export const CUSTOM_RECURRENCE = 'custom'

export function recurrencePresetFor(unit: RecurrenceUnit, interval: number): string {
  return RECURRENCE_PRESETS.find(preset => preset.unit === unit && preset.interval === interval)?.value ?? CUSTOM_RECURRENCE
}

const HISTORY_FIELD_LABELS: Record<string, string> = {
  status: 'statusul',
  title: 'titlul',
  dueDate: 'termenul',
  assignee: 'responsabilul',
  priority: 'prioritatea',
  kind: 'tipul',
  client: 'clientul',
  location: 'punctul de lucru',
  time: 'intervalul orar',
  sheets: 'fișele completate',
  description: 'descrierea',
  notes: 'observațiile'
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

function historyValue(field: string, value: string | null, labels: Record<string, Record<string, string>>): string {
  if (value === null) return '—'
  if (DATE_ONLY.test(value)) return formatDate(value)
  return labels[field]?.[value] ?? value
}

/** Descrie o modificare din istoricul unui task: „termenul: 10 nov. 2026 → 13 nov. 2026”. */
export function describeHistoryChange(
  change: { field: string, from: string | null, to: string | null },
  labels: Record<string, Record<string, string>>
): string {
  const name = HISTORY_FIELD_LABELS[change.field] ?? change.field
  if (change.from === null && change.to === null) return name
  return `${name}: ${historyValue(change.field, change.from, labels)} → ${historyValue(change.field, change.to, labels)}`
}
