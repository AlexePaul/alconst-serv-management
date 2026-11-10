import type { Prisma } from '@alconst/database';
import type { TaskDto } from '@alconst/shared';
import { formatDateOnly } from '../common/dates.js';

export const taskInclude = {
  client: { select: { id: true, name: true } },
  location: { select: { id: true, name: true } },
  assignee: { select: { id: true, firstName: true, lastName: true } },
  obligation: { select: { id: true, title: true } },
} satisfies Prisma.TaskInclude;

export type TaskRow = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;

export function toTaskDto(row: TaskRow): TaskDto {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    notes: row.notes,
    kind: row.kind,
    status: row.status,
    priority: row.priority,
    dueDate: formatDateOnly(row.dueDate),
    client: row.client,
    location: row.location,
    assignee: row.assignee,
    obligation: row.obligation,
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
