import type { PushPayload } from '@alconst/shared';

/** 1 reamintire, 2 reamintiri, 20 de reamintiri. */
function countLabel(count: number, one: string, many: string): string {
  if (count === 1) return `1 ${one}`;
  const lastTwo = count % 100;
  return count === 0 || (lastTwo > 0 && lastTwo < 20) ? `${count} ${many}` : `${count} de ${many}`;
}

export interface PendingReminder {
  type: string;
  title: string;
  body: string | null;
  taskId: string | null;
}

/** Reamintirile se trimit pe telefon doar în acest interval (ora locală), ca să nu trezească pe nimeni. */
export const PUSH_FROM_HOUR = 7;
export const PUSH_UNTIL_HOUR = 21;

/**
 * Reamintirile noi ale unui utilizator, strânse într-o singură notificare pe telefon.
 * O singură reamintire apare ca atare și deschide activitatea; mai multe apar ca rezumat.
 */
export function reminderPushPayload(reminders: PendingReminder[]): PushPayload | null {
  const [first] = reminders;
  if (!first) return null;
  if (reminders.length === 1) {
    return {
      title: first.title,
      ...(first.body ? { body: first.body } : {}),
      url: first.taskId ? `/task-uri?task=${first.taskId}` : '/notificari',
      tag: 'reminders',
    };
  }
  const count = (type: string) => reminders.filter((reminder) => reminder.type === type).length;
  const parts = [
    count('TASK_OVERDUE') > 0 ? countLabel(count('TASK_OVERDUE'), 'restantă', 'restante') : null,
    count('TASK_DUE_TODAY') > 0 ? `${count('TASK_DUE_TODAY')} azi` : null,
    count('TASK_DUE_SOON') > 0 ? `${count('TASK_DUE_SOON')} în zilele următoare` : null,
  ].filter(Boolean);
  return {
    title: `Ai ${countLabel(reminders.length, 'reamintire', 'reamintiri')}`,
    body: `${parts.join(' · ')}. Atinge pentru a vedea ce ai de făcut.`,
    url: '/',
    tag: 'reminders',
  };
}
