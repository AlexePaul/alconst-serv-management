import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';

export * from './generated/prisma/client.js';

/**
 * Creează un client Prisma conectat prin driverul `pg`.
 * API-ul și worker-ul folosesc aceeași funcție, astfel încât configurarea conexiunii să fie unică.
 */
export function createPrismaClient(
  connectionString: string,
  options: { poolMax?: number } = {},
): PrismaClient {
  // Limita de conexiuni este explicită: pe un server PostgreSQL împărțit cu alte aplicații,
  // `max_connections` este comun, deci fiecare proces își declară cât poate ocupa.
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString,
      ...(options.poolMax ? { max: options.poolMax } : {}),
    }),
  });
}

export {
  generateObligationTasks,
  type GenerateTasksOptions,
  lockObligations,
  pendingGeneratedTasks,
} from './obligation-tasks.js';
