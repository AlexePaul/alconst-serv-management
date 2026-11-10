import { BullModule } from '@nestjs/bullmq';
import { Inject, Module, type OnModuleDestroy } from '@nestjs/common';
import { createPrismaClient, type PrismaClient } from '@alconst/database';
import { QUEUE_MAIL, QUEUE_MAINTENANCE } from '@alconst/shared';
import { loadWorkerConfig, WorkerConfig } from './config/worker-config.js';
import { MailTransportService } from './mail/mail-transport.service.js';
import { MailProcessor } from './mail/mail.processor.js';
import { MaintenanceProcessor } from './maintenance/maintenance.processor.js';
import { MaintenanceService, PRISMA } from './maintenance/maintenance.service.js';

const configProvider = { provide: WorkerConfig, useFactory: () => loadWorkerConfig() };

@Module({
  providers: [configProvider],
  exports: [configProvider],
})
class ConfigModule {}

const prismaProvider = {
  provide: PRISMA,
  inject: [WorkerConfig],
  useFactory: (config: WorkerConfig) => createPrismaClient(config.databaseUrl),
};

/**
 * Worker-ul rulează ca proces separat de API și procesează job-urile din cozile BullMQ:
 *  - `mail`: trimiterea emailurilor;
 *  - `maintenance`: rularea periodică (generarea task-urilor din obligații, reamintiri, curățare).
 * Fiecare tip nou de job (generare documente etc.) se adaugă ca procesor aici.
 */
@Module({
  imports: [
    ConfigModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [WorkerConfig],
      useFactory: (config: WorkerConfig) => ({ connection: { url: config.redisUrl } }),
    }),
    BullModule.registerQueue({ name: QUEUE_MAIL }, { name: QUEUE_MAINTENANCE }),
  ],
  providers: [
    prismaProvider,
    MailTransportService,
    MailProcessor,
    MaintenanceService,
    MaintenanceProcessor,
  ],
})
export class WorkerModule implements OnModuleDestroy {
  constructor(@Inject(PRISMA) private readonly db: PrismaClient) {}

  async onModuleDestroy(): Promise<void> {
    await this.db.$disconnect();
  }
}
