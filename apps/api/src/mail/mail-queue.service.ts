import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { type MailJobData, QUEUE_MAIL } from '@alconst/shared';

/** Trimiterea emailurilor se face asincron: API-ul doar adaugă job-ul, worker-ul îl procesează. */
@Injectable()
export class MailQueueService {
  constructor(@InjectQueue(QUEUE_MAIL) private readonly queue: Queue<MailJobData>) {}

  async enqueue(data: MailJobData): Promise<void> {
    await this.queue.add(data.kind, data, {
      attempts: 5,
      backoff: { type: 'exponential', delay: 30_000 },
      removeOnComplete: true,
      // Job-urile eșuate conțin linkuri de resetare; nu le păstrăm mai mult decât e necesar.
      removeOnFail: { age: 24 * 60 * 60 },
    });
  }

  /** Verifică disponibilitatea Redis (folosit de health check). */
  async ping(): Promise<void> {
    await this.queue.getJobCounts('waiting');
  }
}
