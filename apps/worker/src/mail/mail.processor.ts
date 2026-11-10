import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { type MailJobData, QUEUE_MAIL } from '@alconst/shared';
import { MailTransportService } from './mail-transport.service.js';
import { renderMail } from './mail.templates.js';

/** Procesează coada `mail`: construiește mesajul și îl trimite prin SMTP. */
@Processor(QUEUE_MAIL)
export class MailProcessor extends WorkerHost {
  private readonly logger = new Logger(MailProcessor.name);

  constructor(private readonly transport: MailTransportService) {
    super();
  }

  async process(job: Job<MailJobData>): Promise<void> {
    await this.transport.send(job.data.to, renderMail(job.data));
    this.logger.log(`Email „${job.data.kind}” trimis (job ${job.id})`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<MailJobData> | undefined, error: Error): void {
    // Nu logăm payload-ul: conține adrese de email și linkuri de resetare.
    this.logger.error(
      `Email „${job?.data.kind ?? 'necunoscut'}” eșuat (job ${job?.id}, încercarea ${job?.attemptsMade}): ${error.message}`,
    );
  }
}
