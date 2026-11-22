import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { QUEUE_PUSH } from '@alconst/shared';
import { PushController } from './push.controller.js';
import { PushService } from './push.service.js';

/** Global: notificările (din orice modul) trimit și pe telefon prin acest serviciu. */
@Global()
@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_PUSH })],
  controllers: [PushController],
  providers: [PushService],
  exports: [PushService],
})
export class PushModule {}
