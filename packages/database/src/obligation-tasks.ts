import { addDays, normalizeSearch, occurrencesBetween } from '@alconst/shared';
import type { PrismaClient } from './generated/prisma/client.js';

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function toDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export interface GenerateTasksOptions {
  /** Data de azi (`YYYY-MM-DD`), în fusul orar al firmei. */
  today: string;
  /** Cu câte zile în avans se creează task-uri. */
  horizonDays: number;
  /** Limitează generarea la o singură obligație (ex. imediat după salvarea ei). */
  obligationId?: string;
}

/**
 * Creează task-urile care lipsesc pentru obligațiile active, pentru termenele din
 * intervalul [azi, azi + orizont].
 *
 * Funcția este idempotentă: constrângerea de unicitate (obligație, apariție) face ca rulările
 * repetate sau simultane – din API la salvarea unei obligații și din worker, periodic – să nu
 * producă duplicate. Termenele trecute nu se generează: o obligație introdusă cu o dată de
 * început veche nu creează o listă de restanțe.
 *
 * Folosită atât de API, cât și de worker, de aceea stă lângă clientul de bază de date.
 */
export async function generateObligationTasks(
  db: PrismaClient,
  options: GenerateTasksOptions,
): Promise<number> {
  const until = addDays(options.today, options.horizonDays);
  const obligations = await db.obligation.findMany({
    where: {
      isActive: true,
      startDate: { lte: toDate(until) },
      OR: [{ endDate: null }, { endDate: { gte: toDate(options.today) } }],
      ...(options.obligationId ? { id: options.obligationId } : {}),
      // Obligațiile clienților dezactivați sunt suspendate.
      AND: [{ OR: [{ clientId: null }, { client: { isActive: true } }] }],
    },
  });

  let created = 0;
  for (const obligation of obligations) {
    const dates = occurrencesBetween(
      {
        startDate: toDateOnly(obligation.startDate),
        endDate: obligation.endDate ? toDateOnly(obligation.endDate) : null,
        unit: obligation.recurrenceUnit,
        interval: obligation.recurrenceInterval,
      },
      options.today,
      until,
    );
    if (dates.length === 0) continue;

    const result = await db.task.createMany({
      data: dates.map((date) => ({
        title: obligation.title,
        description: obligation.description,
        kind: obligation.kind,
        priority: obligation.priority,
        dueDate: toDate(date),
        startTime: obligation.startTime,
        endTime: obligation.endTime,
        occurrenceDate: toDate(date),
        obligationId: obligation.id,
        clientId: obligation.clientId,
        locationId: obligation.locationId,
        assigneeId: obligation.assigneeId,
        createdById: obligation.createdById,
        searchText: normalizeSearch(obligation.title),
      })),
      skipDuplicates: true,
    });
    created += result.count;
  }
  return created;
}
