import { Inject, Injectable, Logger } from '@nestjs/common';
import webpush, { WebPushError } from 'web-push';
import { getVapidKeys, isAllowedPushEndpoint, type PrismaClient } from '@alconst/database';
import type { PushPayload } from '@alconst/shared';
import { WorkerConfig } from '../config/worker-config.js';
import { PRISMA } from '../maintenance/maintenance.service.js';

export interface PushResult {
  sent: number;
  /** Abonamente expirate sau retrase de utilizator, șterse acum. */
  removed: number;
  /** Erori temporare (serviciul de push indisponibil etc.). */
  failed: number;
}

/** O notificare nevăzută într-o zi nu mai este utilă; serviciul de push o poate renunța. */
const TTL_SECONDS = 24 * 60 * 60;

/** Trimite notificări push către toate dispozitivele unui utilizator. */
@Injectable()
export class PushSenderService {
  private readonly logger = new Logger(PushSenderService.name);

  constructor(
    @Inject(PRISMA) private readonly db: PrismaClient,
    private readonly config: WorkerConfig,
  ) {}

  /**
   * Identificarea serverului față de serviciile de push: o adresă https a aplicației sau, în
   * dezvoltare, adresa de email a expeditorului.
   */
  private subject(): string {
    if (this.config.appUrl.startsWith('https://')) return this.config.appUrl;
    const email = /<([^>]+)>/.exec(this.config.mailFrom)?.[1] ?? this.config.mailFrom;
    return `mailto:${email.trim()}`;
  }

  async sendToUser(userId: string, payload: PushPayload): Promise<PushResult> {
    const result: PushResult = { sent: 0, removed: 0, failed: 0 };
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: { isActive: true, pushSubscriptions: true },
    });
    if (!user?.isActive || user.pushSubscriptions.length === 0) return result;

    const keys = await getVapidKeys(this.db);
    const vapidDetails = { subject: this.subject(), ...keys };
    const body = JSON.stringify(payload);

    for (const subscription of user.pushSubscriptions) {
      // Verificat și la abonare; repetat aici ca protecție pentru datele mai vechi.
      if (!isAllowedPushEndpoint(subscription.endpoint)) {
        await this.db.pushSubscription.delete({ where: { id: subscription.id } });
        result.removed++;
        continue;
      }
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          body,
          { vapidDetails, TTL: TTL_SECONDS, urgency: 'normal' },
        );
        await this.db.pushSubscription.update({
          where: { id: subscription.id },
          data: { lastSuccessAt: new Date() },
        });
        result.sent++;
      } catch (error) {
        // 404/410: abonamentul nu mai există (aplicația ștearsă, permisiunea retrasă).
        if (error instanceof WebPushError && [403, 404, 410].includes(error.statusCode)) {
          await this.db.pushSubscription.deleteMany({ where: { id: subscription.id } });
          result.removed++;
        } else {
          result.failed++;
          this.logger.warn(
            `Notificarea push nu a putut fi trimisă: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }
    return result;
  }
}
