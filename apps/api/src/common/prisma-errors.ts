import { Prisma } from '@alconst/database';

/** Încălcarea unei constrângeri de unicitate. */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/** Încălcarea unei chei străine (ex. ștergerea unei înregistrări încă folosite). */
export function isForeignKeyViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003';
}
