import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { createPrismaClient, type PrismaClient } from '@alconst/database';
import { AppConfig } from '../config/app-config.js';

/** Punct unic de acces la baza de date. Folosire: `this.prisma.db.user.findMany()`. */
@Injectable()
export class PrismaService implements OnModuleDestroy {
  readonly db: PrismaClient;

  constructor(config: AppConfig) {
    this.db = createPrismaClient(config.databaseUrl, { poolMax: config.databasePoolMax });
  }

  async onModuleDestroy(): Promise<void> {
    await this.db.$disconnect();
  }
}
