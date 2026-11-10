import type { Prisma } from '@alconst/database';
import type { TaskDto } from '@alconst/shared';
import { formatDateOnly } from '../common/dates.js';

export const taskInclude = {
  client: {
    select: {
      id: true,
      name: true,
      address: true,
      contactPerson: true,
      phone: true,
      assignments: { select: { userId: true } },
    },
  },
  location: { select: { id: true, name: true, address: true } },
  assignee: { select: { id: true, firstName: true, lastName: true } },
  obligation: { select: { id: true, title: true } },
} satisfies Prisma.TaskInclude;

export type TaskRow = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;

export function toTaskDto(row: TaskRow): TaskDto {
  const responsibleIds = row.client?.assignments.map((assignment) => assignment.userId) ?? [];
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    notes: row.notes,
    kind: row.kind,
    status: row.status,
    priority: row.priority,
    dueDate: formatDateOnly(row.dueDate),
    startTime: row.startTime,
    endTime: row.endTime,
    client: row.client
      ? {
          id: row.client.id,
          name: row.client.name,
          address: row.client.address,
          contactPerson: row.client.contactPerson,
          phone: row.client.phone,
        }
      : null,
    location: row.location,
    assignee: row.assignee,
    // O „înlocuire”: task-ul unui client este executat de cineva care nu îi este responsabil.
    isCover:
      row.assigneeId !== null &&
      responsibleIds.length > 0 &&
      !responsibleIds.includes(row.assigneeId),
    obligation: row.obligation,
    sheetsCompleted: row.sheetsCompletedAt !== null,
    sheetsCompletedAt: row.sheetsCompletedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
