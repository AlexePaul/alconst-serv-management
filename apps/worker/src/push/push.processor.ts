import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { type PushJobData, QUEUE_PUSH } from '@alconst/shared';
import { PushSenderService } from './push-sender.service.js';

/** Procesează coada `push`: trimite notificarea pe dispozitivele utilizatorului. */
@Processor(QUEUE_PUSH)
export class PushProcessor extends WorkerHost {
  private readonly logger = new Logger(PushProcessor.name);

  constructor(private readonly sender: PushSenderService) {
    super();
  }

  async process(job: Job<PushJobData>): Promise<void> {
    const result = await this.sender.sendToUser(job.data.userId, job.data.payload);
    // Reîncercăm doar dacă nu a ajuns pe niciun dispozitiv; altfel ar apărea de două ori.
    if (result.sent === 0 && result.failed > 0) {
      throw new Error(`Niciun dispozitiv nu a putut fi contactat (${result.failed} erori).`);
    }
    if (result.sent > 0) this.logger.log(`Notificare push trimisă pe ${result.sent} dispozitive`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<PushJobData> | undefined, error: Error): void {
    // Nu logăm conținutul: poate conține titluri de activități și nume de clienți.
    this.logger.error(
      `Notificare push eșuată (job ${job?.id}, încercarea ${job?.attemptsMade}): ${error.message}`,
    );
  }
}
