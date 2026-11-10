import { DEFAULT_NOTIFICATION_SETTINGS, diffDays, type NotificationType } from '@alconst/shared';

export interface ReminderTask {
  id: string;
  title: string;
  /** `YYYY-MM-DD` */
  dueDate: string;
  clientName: string | null;
  assigneeId: string | null;
  /** Responsabilii clientului – destinatarii reamintirilor când task-ul nu are responsabil. */
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
 */
export function planReminders(
  tasks: ReminderTask[],
  today: string,
  activeUserIds: ReadonlySet<string>,
  remindDaysByUser: ReadonlyMap<string, number>,
): PlannedNotification[] {
  const planned: PlannedNotification[] = [];

  for (const task of tasks) {
    const recipients = task.assigneeId ? [task.assigneeId] : task.clientResponsibleIds;
    const days = diffDays(today, task.dueDate);
    const label = task.clientName ? `${task.title} · ${task.clientName}` : task.title;

    for (const userId of new Set(recipients)) {
      if (!activeUserIds.has(userId)) continue;
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
