import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';

export * from './generated/prisma/client.js';

/**
 * Creează un client Prisma conectat prin driverul `pg`.
 * API-ul și worker-ul folosesc aceeași funcție, astfel încât configurarea conexiunii să fie unică.
 */
export function createPrismaClient(connectionString: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

export { generateObligationTasks, type GenerateTasksOptions } from './obligation-tasks.js';
