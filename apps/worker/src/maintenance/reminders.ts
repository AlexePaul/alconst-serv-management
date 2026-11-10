import { DEFAULT_NOTIFICATION_SETTINGS, diffDays, type NotificationType } from '@alconst/shared';

export interface ReminderTask {
  id: string;
  title: string;
  /** `YYYY-MM-DD` */
  dueDate: string;
  /** Intervalul orar estimat, deja formatat (ex. „10:00–12:00”), dacă există. */
  timeRange?: string | null;
  clientName: string | null;
  assigneeId: string | null;
  /** Responsabilii clientului – destinatarii reamintirilor când task-ul nu are responsabil activ. */
  clientResponsibleIds: string[];
}

export interface PlannedNotification {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  taskId: string;
  dedupeKey: string;
}

const formatDate = (date: string) => date.split('-').reverse().join('.');

/** Primul grup care are cel puțin un utilizator activ: responsabilul, responsabilii clientului, administratorii. */
function pickRecipients(
  task: ReminderTask,
  activeUserIds: ReadonlySet<string>,
  adminIds: readonly string[],
): string[] {
  const groups = [task.assigneeId ? [task.assigneeId] : [], task.clientResponsibleIds, adminIds];
  for (const group of groups) {
    const active = [...new Set(group)].filter((userId) => activeUserIds.has(userId));
    if (active.length > 0) return active;
  }
  return [];
}

/**
 * Stabilește ce reamintiri trebuie să existe astăzi pentru task-urile deschise.
 *
 * Fiecare reamintire are o cheie care îi descrie unic motivul (tip, task, destinatar, termen).
 * Inserarea cu „ignoră duplicatele” pe această cheie face ca rulările repetate să nu trimită
 * aceeași notificare de două ori:
 *  - înainte de termen: o singură dată, cu N zile înainte (N ales de fiecare utilizator);
 *  - în ziua termenului: o singură dată;
 *  - restanțe: în prima zi de întârziere, apoi o dată la 7 zile.
 * Cheia include termenul, deci un task reprogramat primește reamintiri noi.
 *
 * Destinatarul este responsabilul task-ului. Dacă task-ul nu are responsabil sau contul acestuia
 * a fost dezactivat (de exemplu după plecarea din firmă), reamintirea ajunge la responsabilii
 * activi ai clientului, iar în lipsa lor la administratori – niciun termen nu rămâne fără
 * cineva care să fie anunțat.
 */
export function planReminders(
  tasks: ReminderTask[],
  today: string,
  activeUserIds: ReadonlySet<string>,
  remindDaysByUser: ReadonlyMap<string, number>,
  adminIds: readonly string[] = [],
): PlannedNotification[] {
  const planned: PlannedNotification[] = [];

  for (const task of tasks) {
    const recipients = pickRecipients(task, activeUserIds, adminIds);
    const days = diffDays(today, task.dueDate);
    const label = [task.title, task.clientName, task.timeRange].filter(Boolean).join(' · ');

    for (const userId of recipients) {
      const remindDays =
        remindDaysByUser.get(userId) ?? DEFAULT_NOTIFICATION_SETTINGS.remindDaysBefore;
      const base = { userId, taskId: task.id };
      const key = `${task.id}:${userId}:${task.dueDate}`;

      if (days < 0) {
        const week = Math.floor((-days - 1) / 7);
        planned.push({
          ...base,
          type: 'TASK_OVERDUE',
          title: 'Task restant',
          body: `${label} · termen ${formatDate(task.dueDate)}`,
          dedupeKey: `overdue:${key}:${week}`,
        });
      } else if (days === 0) {
        planned.push({
          ...base,
          type: 'TASK_DUE_TODAY',
          title: 'Termen astăzi',
          body: label,
          dedupeKey: `due-today:${key}`,
        });
      } else if (days <= remindDays) {
        planned.push({
          ...base,
          type: 'TASK_DUE_SOON',
          title: 'Termen apropiat',
          body: `${label} · ${days === 1 ? 'mâine' : `în ${days} zile`}`,
          dedupeKey: `due-soon:${key}`,
        });
      }
    }
  }
  return planned;
}
