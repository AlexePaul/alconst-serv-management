import { Controller, Get, HttpStatus } from '@nestjs/common';
import { API_ERROR_CODES } from '@alconst/shared';
import { AppException } from '../common/app.exception.js';
import { Public } from '../common/decorators.js';
import { AppConfig } from '../config/app-config.js';
import { MailQueueService } from '../mail/mail-queue.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Controller()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailQueue: MailQueueService,
    private readonly config: AppConfig,
  ) {}

  /** Procesul răspunde. Nu verifică dependențele – pentru asta există `/ready`. */
  @Public()
  @Get('health')
  health(): { status: 'ok' } {
    return { status: 'ok' };
  }

  /**
   * Aplicația poate servi cereri: baza de date și Redis răspund. Întoarce și versiunea instalată,
   * astfel încât un deploy să poată verifica faptul că versiunea nouă este cea care răspunde.
   */
  @Public()
  @Get('ready')
  async ready(): Promise<{ status: 'ok'; version: string }> {
    try {
      await Promise.all([this.prisma.db.$queryRaw`SELECT 1`, this.mailQueue.ping()]);
    } catch {
      throw new AppException(
        HttpStatus.SERVICE_UNAVAILABLE,
        API_ERROR_CODES.INTERNAL_ERROR,
        'Serviciul nu este disponibil momentan.',
      );
    }
    return { status: 'ok', version: this.config.version };
  }
}
