import { Controller, Get } from '@nestjs/common';
import {
  MAINTENANCE_HEARTBEAT,
  MAINTENANCE_STALE_HOURS,
  type SystemStatusDto,
} from '@alconst/shared';
import { Roles } from '../common/decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** Starea proceselor de fundal, pentru administratori. */
@Controller('system')
export class SystemController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Rularea periodică a worker-ului generează task-urile recurente, reamintirile și rezumatele pe
   * email. Dacă nu a mai avut loc de câteva ore, administratorii sunt avertizați pe pagina
   * principală – altfel oprirea ei ar trece neobservată.
   */
  @Roles('ADMIN')
  @Get('status')
  async status(): Promise<SystemStatusDto> {
    const heartbeat = await this.prisma.db.workerHeartbeat.findUnique({
      where: { name: MAINTENANCE_HEARTBEAT },
    });
    const lastRunAt = heartbeat?.lastRunAt ?? null;
    const staleAfterMs = MAINTENANCE_STALE_HOURS * 60 * 60 * 1000;
    return {
      maintenance: {
        lastRunAt: lastRunAt?.toISOString() ?? null,
        healthy: lastRunAt !== null && Date.now() - lastRunAt.getTime() < staleAfterMs,
      },
    };
  }
}
