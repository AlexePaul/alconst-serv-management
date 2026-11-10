import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { QUEUE_MAIL } from '@alconst/shared';
import { AppConfig } from '../config/app-config.js';
import { MailQueueService } from './mail-queue.service.js';

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({ connection: { url: config.redisUrl } }),
    }),
    BullModule.registerQueue({ name: QUEUE_MAIL }),
  ],
  providers: [MailQueueService],
  exports: [MailQueueService],
})
export class MailQueueModule {}
