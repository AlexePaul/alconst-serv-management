import {
  addDays,
  generationStart,
  normalizeSearch,
  occurrencePeriod,
  occurrencesBetween,
} from '@alconst/shared';
import type { Prisma, PrismaClient } from './generated/prisma/client.js';

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function toDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function periodKey(start: Date | null, end: Date | null): string {
  return `${start ? toDateOnly(start) : ''}:${end ? toDateOnly(end) : ''}`;
}

export interface GenerateTasksOptions {
  /** Data de azi (`YYYY-MM-DD`), în fusul orar al firmei. */
  today: string;
  /** Cu câte zile în avans se creează task-uri. */
  horizonDays: number;
  /** Limitează generarea la o singură obligație (ex. imediat după salvarea ei). */
  obligationId?: string;
  /** Limitează generarea la obligațiile unui client (ex. la reactivarea lui). */
  clientId?: string;
}

/**
 * Blochează rândurile obligațiilor până la sfârșitul tranzacției.
 *
 * Generarea task-urilor și modificările care șterg task-uri neîncepute (schimbarea frecvenței,
 * dezactivarea, arhivarea clientului) iau același blocaj, deci nu se pot intercala: o generare
 * pornită cu datele vechi nu poate recrea task-uri imediat după ce o modificare le-a șters.
 */
export async function lockObligations(
  tx: Prisma.TransactionClient,
  target: { obligationId: string } | { clientId: string },
): Promise<void> {
  if ('obligationId' in target) {
    await tx.$queryRaw`SELECT "id" FROM "obligations" WHERE "id" = ${target.obligationId}::uuid FOR UPDATE`;
  } else {
    await tx.$queryRaw`SELECT "id" FROM "obligations" WHERE "clientId" = ${target.clientId}::uuid FOR UPDATE`;
  }
}

/**
 * Task-urile generate ale unei obligații care pot fi retrase sau înlocuite atunci când obligația
 * se schimbă: neîncepute și încă „la timp” (data apariției sau sfârșitul perioadei lor este de
 * azi încolo). Restanțele și task-urile începute, finalizate sau anulate nu intră aici.
 */
export function pendingGeneratedTasks(today: string): Prisma.TaskWhereInput {
  const day = toDate(today);
  return {
    obligationId: { not: null },
    status: 'TODO',
    OR: [{ occurrenceDate: { gte: day } }, { periodEnd: { gte: day } }],
  };
}

/**
 * Creează task-urile care lipsesc pentru obligațiile active, pentru termenele din
 * intervalul [azi, azi + orizont].
 *
 * La obligațiile cu termen flexibil, fiecare apariție ține de o perioadă (luna sau săptămâna în
 * care cade). Generarea pornește atunci de la începutul perioadei curente – apariția lunii în
 * curs este încă „la timp” – și nu creează un al doilea task pentru o perioadă care are deja
 * unul (de exemplu după mutarea zilei din lună a obligației).
 *
 * Funcția este idempotentă: constrângerea de unicitate (obligație, apariție) face ca rulările
 * repetate sau simultane – din API la salvarea unei obligații și din worker, periodic – să nu
 * producă duplicate. O apariție care are deja un task (finalizat, anulat sau reprogramat) nu
 * este generată din nou. Termenele trecute nu se generează: o obligație introdusă cu o dată de
 * început veche nu creează o listă de restanțe.
 *
 * Fiecare obligație este recitită sub blocaj înainte de generare, astfel încât să fie folosite
 * mereu datele ei curente (vezi `lockObligations`).
 *
 * Folosită atât de API, cât și de worker, de aceea stă lângă clientul de bază de date.
 */
export async function generateObligationTasks(
  db: PrismaClient,
  options: GenerateTasksOptions,
): Promise<number> {
  const until = addDays(options.today, options.horizonDays);
  const where: Prisma.ObligationWhereInput = {
    isActive: true,
    startDate: { lte: toDate(until) },
    ...(options.obligationId ? { id: options.obligationId } : {}),
    ...(options.clientId ? { clientId: options.clientId } : {}),
    AND: [
      // Limita este largă (începutul lunii curente): apariția perioadei în curs poate fi înainte de azi.
      {
        OR: [
          { endDate: null },
          { endDate: { gte: toDate(generationStart('MONTH', true, options.today)) } },
        ],
      },
      // Obligațiile clienților arhivați sunt suspendate.
      { OR: [{ clientId: null }, { client: { isActive: true } }] },
    ],
  };
  const candidates = await db.obligation.findMany({ where, select: { id: true } });

  let created = 0;
  for (const { id } of candidates) {
    created += await db.$transaction(async (tx) => {
      await lockObligations(tx, { obligationId: id });
      // Între selecție și blocaj obligația a putut fi modificată, dezactivată sau ștearsă.
      const obligation = await tx.obligation.findFirst({ where: { AND: [where, { id }] } });
      if (!obligation) return 0;

      const unit = obligation.recurrenceUnit;
      const flexible = obligation.dueWithinPeriod;
      const occurrences = occurrencesBetween(
        {
          startDate: toDateOnly(obligation.startDate),
          endDate: obligation.endDate ? toDateOnly(obligation.endDate) : null,
          unit,
          interval: obligation.recurrenceInterval,
        },
        generationStart(unit, flexible, options.today),
        until,
      ).map((date) => ({ date, period: flexible ? occurrencePeriod(unit, date) : null }));
      if (occurrences.length === 0) return 0;

      // Perioadele care au deja un task al acestei obligații (indiferent de starea lui).
      const taken = new Set(
        (
          await tx.task.findMany({
            where: { obligationId: obligation.id, periodStart: { not: null } },
            select: { periodStart: true, periodEnd: true },
          })
        ).map((task) => periodKey(task.periodStart, task.periodEnd)),
      );
      const missing = occurrences.filter(({ period }) => {
        if (!period) return true;
        const key = `${period.start}:${period.end}`;
        if (taken.has(key)) return false;
        taken.add(key);
        return true;
      });
      if (missing.length === 0) return 0;

      const result = await tx.task.createMany({
        data: missing.map(({ date, period }) => ({
          title: obligation.title,
          description: obligation.description,
          kind: obligation.kind,
          priority: obligation.priority,
          dueDate: toDate(date),
          periodStart: period ? toDate(period.start) : null,
          periodEnd: period ? toDate(period.end) : null,
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
      return result.count;
    });
  }
  return created;
}
