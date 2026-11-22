import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { getVapidKeys, isAllowedPushEndpoint } from '@alconst/database';
import {
  type PushConfigDto,
  type PushJobData,
  type PushPayload,
  QUEUE_PUSH,
} from '@alconst/shared';
import { AppException } from '../common/app.exception.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { SubscribePushDto } from './dto/push.dto.js';

/**
 * Notificările push (Web Push): abonarea dispozitivelor și punerea în coadă a mesajelor.
 * Trimiterea propriu-zisă o face worker-ul, ca la emailuri.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_PUSH) private readonly queue: Queue<PushJobData>,
  ) {}

  async config(userId: string): Promise<PushConfigDto> {
    const [keys, devices] = await Promise.all([
      getVapidKeys(this.prisma.db),
      this.prisma.db.pushSubscription.count({ where: { userId } }),
    ]);
    return { publicKey: keys.publicKey, devices };
  }

  /** Înregistrează (sau mută la utilizatorul curent) abonamentul unui dispozitiv. */
  async subscribe(userId: string, dto: SubscribePushDto): Promise<PushConfigDto> {
    if (!isAllowedPushEndpoint(dto.endpoint)) {
      throw AppException.validation(
        'Acest browser nu este acceptat pentru notificări. Folosește Safari, Chrome, Edge sau Firefox.',
      );
    }
    const data = {
      userId,
      p256dh: dto.keys.p256dh,
      auth: dto.keys.auth,
      deviceLabel: dto.deviceLabel ?? null,
    };
    await this.prisma.db.pushSubscription.upsert({
      where: { endpoint: dto.endpoint },
      create: { endpoint: dto.endpoint, ...data },
      update: data,
    });
    return this.config(userId);
  }

  async unsubscribe(userId: string, endpoint: string): Promise<PushConfigDto> {
    await this.prisma.db.pushSubscription.deleteMany({ where: { endpoint, userId } });
    return this.config(userId);
  }

  /** Trimite o notificare de probă pe toate dispozitivele utilizatorului. */
  async sendTest(userId: string): Promise<void> {
    const devices = await this.prisma.db.pushSubscription.count({ where: { userId } });
    if (devices === 0) {
      throw AppException.validation('Notificările nu sunt pornite pe niciun dispozitiv.');
    }
    await this.enqueue(userId, {
      title: 'Notificările funcționează',
      body: 'De acum primești pe acest dispozitiv ce ai de făcut și ce îți trimit colegii.',
      url: '/notificari',
      tag: 'test',
    });
  }

  /**
   * Pune în coadă o notificare push dacă utilizatorul are cel puțin un dispozitiv abonat.
   * Întoarce `true` dacă a fost pusă în coadă. Erorile nu sunt propagate: notificarea din
   * aplicație rămâne oricum.
   */
  async notifyUser(userId: string, payload: Omit<PushPayload, 'badge'>): Promise<boolean> {
    try {
      const devices = await this.prisma.db.pushSubscription.count({ where: { userId } });
      if (devices === 0) return false;
      const badge = await this.prisma.db.notification.count({ where: { userId, readAt: null } });
      await this.enqueue(userId, { ...payload, badge });
      return true;
    } catch (error) {
      this.logger.error(
        'Notificarea push nu a putut fi pusă în coadă',
        error instanceof Error ? error.stack : String(error),
      );
      return false;
    }
  }

  private async enqueue(userId: string, payload: PushPayload): Promise<void> {
    await this.queue.add(
      'push',
      { userId, payload },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: true,
        removeOnFail: { age: 24 * 60 * 60 },
      },
    );
  }
}
