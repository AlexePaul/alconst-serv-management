import { Injectable } from '@nestjs/common';
import type { Response } from 'express';
import type { Session, User } from '@alconst/database';
import type { ClientInfo } from '../common/request-context.js';
import { AppConfig } from '../config/app-config.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { generateToken, hashToken } from './tokens.js';

const DAY_MS = 24 * 60 * 60 * 1000;
/** `lastUsedAt` se actualizează cel mult o dată la acest interval, pentru a evita scrieri la fiecare cerere. */
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

export interface ValidatedSession {
  session: Session;
  user: User;
  /** Setat atunci când sesiunea a fost prelungită și cookie-ul trebuie retrimis. */
  renewedUntil?: Date;
}

/**
 * Sesiuni opace, stocate în baza de date: cookie-ul conține un token aleatoriu, iar baza de date
 * hash-ul lui. Astfel sesiunile pot fi revocate imediat (logout, dezactivare cont, schimbare parolă).
 */
@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
  ) {}

  /** Prefixul `__Host-` obligă browserul să accepte cookie-ul doar prin HTTPS și doar pentru acest host. */
  get cookieName(): string {
    return this.config.secureCookies ? '__Host-alconst_session' : 'alconst_session';
  }

  private get ttlMs(): number {
    return this.config.sessionTtlDays * DAY_MS;
  }

  async create(userId: string, client: ClientInfo): Promise<{ token: string; expiresAt: Date }> {
    const token = generateToken();
    const now = Date.now();
    const expiresAt = new Date(now + this.ttlMs);
    await this.prisma.db.$transaction([
      this.prisma.db.session.deleteMany({ where: { userId, expiresAt: { lt: new Date(now) } } }),
      this.prisma.db.session.create({
        data: {
          tokenHash: hashToken(token),
          userId,
          expiresAt,
          ip: client.ip,
          userAgent: client.userAgent,
        },
      }),
    ]);
    return { token, expiresAt };
  }

  /**
   * Validează token-ul din cookie. Sesiunile folosite activ sunt prelungite automat
   * (expirare glisantă) odată ce au consumat jumătate din durata de viață.
   */
  async validate(token: string): Promise<ValidatedSession | null> {
    const found = await this.prisma.db.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    });
    if (!found) return null;

    const { user, ...session } = found;
    const now = Date.now();
    if (session.expiresAt.getTime() <= now || !user.isActive) {
      await this.prisma.db.session.deleteMany({ where: { id: session.id } });
      return null;
    }

    if (session.expiresAt.getTime() - now < this.ttlMs / 2) {
      const renewedUntil = new Date(now + this.ttlMs);
      await this.prisma.db.session.updateMany({
        where: { id: session.id },
        data: { expiresAt: renewedUntil, lastUsedAt: new Date(now) },
      });
      return { session: { ...session, expiresAt: renewedUntil }, user, renewedUntil };
    }

    if (now - session.lastUsedAt.getTime() > TOUCH_INTERVAL_MS) {
      await this.prisma.db.session.updateMany({
        where: { id: session.id },
        data: { lastUsedAt: new Date(now) },
      });
    }
    return { session, user };
  }

  async revoke(sessionId: string): Promise<void> {
    await this.prisma.db.session.deleteMany({ where: { id: sessionId } });
  }

  /** Revocă toate sesiunile unui utilizator, opțional cu excepția celei curente. */
  async revokeAllForUser(userId: string, exceptSessionId?: string): Promise<void> {
    await this.prisma.db.session.deleteMany({
      where: { userId, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
    });
  }

  setCookie(response: Response, token: string, expiresAt: Date): void {
    response.cookie(this.cookieName, token, {
      httpOnly: true,
      secure: this.config.secureCookies,
      sameSite: 'strict',
      path: '/',
      expires: expiresAt,
    });
  }

  clearCookie(response: Response): void {
    response.clearCookie(this.cookieName, {
      httpOnly: true,
      secure: this.config.secureCookies,
      sameSite: 'strict',
      path: '/',
    });
  }
}
