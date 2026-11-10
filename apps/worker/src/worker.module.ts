import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { QUEUE_MAIL } from '@alconst/shared';
import { loadWorkerConfig, WorkerConfig } from './config/worker-config.js';
import { MailTransportService } from './mail/mail-transport.service.js';
import { MailProcessor } from './mail/mail.processor.js';

const configProvider = { provide: WorkerConfig, useFactory: () => loadWorkerConfig() };

@Module({
  providers: [configProvider],
  exports: [configProvider],
})
class ConfigModule {}

/**
 * Worker-ul rulează ca proces separat de API și procesează job-urile din cozile BullMQ.
 * Fiecare tip nou de job (generare documente, notificări etc.) se adaugă ca procesor aici.
 */
@Module({
  imports: [
    ConfigModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [WorkerConfig],
      useFactory: (config: WorkerConfig) => ({ connection: { url: config.redisUrl } }),
    }),
    BullModule.registerQueue({ name: QUEUE_MAIL }),
  ],
  providers: [MailTransportService, MailProcessor],
})
export class WorkerModule {}
