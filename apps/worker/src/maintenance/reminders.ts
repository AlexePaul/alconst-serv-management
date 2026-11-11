import {
  DEFAULT_NOTIFICATION_SETTINGS,
  diffDays,
  type NotificationType,
  taskDeadline,
} from '@alconst/shared';

export interface ReminderTask {
  id: string;
  title: string;
  /** Data planificată, `YYYY-MM-DD`. */
  dueDate: string;
  /** Sfârșitul perioadei în care task-ul poate fi făcut la timp (termene flexibile). */
  periodEnd?: string | null;
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
 *  - înainte de data planificată: o singură dată, cu N zile înainte (N ales de utilizator);
 *  - în ziua planificată: o singură dată;
 *  - restanțe: în prima zi de întârziere, apoi o dată la 7 zile.
 * Cheia include termenul, deci un task reprogramat primește reamintiri noi.
 *
 * La termenele flexibile (de făcut oricând în lună sau în săptămână), depășirea datei planificate
 * nu este o restanță. Cât timp perioada nu s-a încheiat se mai trimit doar două reamintiri:
 * cu N zile înainte de sfârșitul perioadei și în ultima ei zi. Restanța începe după perioadă.
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
    // Ultima zi „la timp”: sfârșitul perioadei sau data planificată, cea mai târzie dintre ele.
    const deadline = taskDeadline(task);
    const daysLeft = diffDays(today, deadline);
    const label = [task.title, task.clientName, task.timeRange].filter(Boolean).join(' · ');

    for (const userId of recipients) {
      const remindDays =
        remindDaysByUser.get(userId) ?? DEFAULT_NOTIFICATION_SETTINGS.remindDaysBefore;
      const base = { userId, taskId: task.id };
      const key = `${task.id}:${userId}:${task.dueDate}`;

      if (daysLeft < 0) {
        const week = Math.floor((-daysLeft - 1) / 7);
        planned.push({
          ...base,
          type: 'TASK_OVERDUE',
          title: 'Activitate restantă',
          body: `${label} · termen ${formatDate(deadline)}`,
          dedupeKey: `overdue:${task.id}:${userId}:${deadline}:${week}`,
        });
      } else if (days === 0) {
        planned.push({
          ...base,
          type: 'TASK_DUE_TODAY',
          title: deadline > task.dueDate ? 'Planificat astăzi' : 'Termen astăzi',
          body: label,
          dedupeKey: `due-today:${key}`,
        });
      } else if (days > 0) {
        if (days <= remindDays) {
          planned.push({
            ...base,
            type: 'TASK_DUE_SOON',
            title: 'Termen apropiat',
            body: `${label} · ${days === 1 ? 'mâine' : `în ${days} zile`}`,
            dedupeKey: `due-soon:${key}`,
          });
        }
      } else if (daysLeft === 0) {
        // Data planificată a trecut; perioada se încheie azi.
        planned.push({
          ...base,
          type: 'TASK_DUE_TODAY',
          title: 'Ultima zi din perioadă',
          body: label,
          dedupeKey: `period-last:${task.id}:${userId}:${deadline}`,
        });
      } else if (daysLeft <= remindDays) {
        planned.push({
          ...base,
          type: 'TASK_DUE_SOON',
          title: 'Perioada se încheie curând',
          body: `${label} · de făcut până la ${formatDate(deadline)}`,
          dedupeKey: `period-end:${task.id}:${userId}:${deadline}`,
        });
      }
    }
  }
  return planned;
}
