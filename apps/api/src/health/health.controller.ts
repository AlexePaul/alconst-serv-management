import { Controller, Get, HttpStatus } from '@nestjs/common';
import { API_ERROR_CODES } from '@alconst/shared';
import { AppException } from '../common/app.exception.js';
import { Public } from '../common/decorators.js';
import { MailQueueService } from '../mail/mail-queue.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailQueue: MailQueueService,
  ) {}

  /** Folosit de Docker / reverse proxy pentru a verifica dacă API-ul și dependențele lui răspund. */
  @Public()
  @Get()
  async check(): Promise<{ status: 'ok' }> {
    try {
      await Promise.all([this.prisma.db.$queryRaw`SELECT 1`, this.mailQueue.ping()]);
    } catch {
      throw new AppException(
        HttpStatus.SERVICE_UNAVAILABLE,
        API_ERROR_CODES.INTERNAL_ERROR,
        'Serviciul nu este disponibil momentan.',
      );
    }
    return { status: 'ok' };
  }
}
