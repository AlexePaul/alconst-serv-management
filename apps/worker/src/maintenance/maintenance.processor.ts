import { InjectQueue, OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, type OnModuleInit } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { MAINTENANCE_JOB_HOURLY, QUEUE_MAINTENANCE } from '@alconst/shared';
import { WorkerConfig } from '../config/worker-config.js';
import { MaintenanceService } from './maintenance.service.js';

/**
 * Programează și execută rularea periodică. Programarea este ținută în Redis, deci nu se
 * dublează dacă worker-ul este repornit sau dacă rulează mai multe instanțe.
 */
@Processor(QUEUE_MAINTENANCE)
export class MaintenanceProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(MaintenanceProcessor.name);

  constructor(
    private readonly maintenance: MaintenanceService,
    private readonly config: WorkerConfig,
    @InjectQueue(QUEUE_MAINTENANCE) private readonly queue: Queue,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    // O rulare eșuată (de exemplu baza de date indisponibilă pentru moment) este reîncercată
    // de câteva ori, la intervale tot mai mari, fără a aștepta ora următoare.
    const jobOptions = {
      removeOnComplete: 24,
      removeOnFail: 100,
      attempts: 4,
      backoff: { type: 'exponential', delay: 30_000 },
    };
    await this.queue.upsertJobScheduler(
      MAINTENANCE_JOB_HOURLY,
      { pattern: '5 * * * *', tz: this.config.timeZone },
      { name: MAINTENANCE_JOB_HOURLY, opts: jobOptions },
    );
    // O rulare imediată la pornire, ca după o instalare sau o oprire să nu se aștepte ora următoare.
    await this.queue.add('startup', {}, jobOptions);
  }

  async process(): Promise<void> {
    await this.maintenance.run();
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job | undefined, error: Error): void {
    this.logger.error(`Rularea periodică a eșuat (job ${job?.id}): ${error.message}`, error.stack);
  }
}
