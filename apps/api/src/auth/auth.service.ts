import { HttpStatus, Injectable } from '@nestjs/common';
import type { User } from '@alconst/database';
import { API_ERROR_CODES } from '@alconst/shared';
import { ActivityService } from '../activity/activity.service.js';
import { AppException } from '../common/app.exception.js';
import type { AuthContext, ClientInfo } from '../common/request-context.js';
import { AppConfig } from '../config/app-config.js';
import { MailQueueService } from '../mail/mail-queue.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { hashPassword, verifyAgainstDummy, verifyPassword } from './password.js';
import { SessionService } from './session.service.js';
import { generateToken, hashToken } from './tokens.js';

export interface LoginResult {
  user: User;
  token: string;
  expiresAt: Date;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    private readonly sessions: SessionService,
    private readonly activity: ActivityService,
    private readonly mailQueue: MailQueueService,
  ) {}

  async login(email: string, password: string, client: ClientInfo): Promise<LoginResult> {
    const user = await this.prisma.db.user.findUnique({ where: { email } });

    let failure: string | null = null;
    if (!user) {
      await verifyAgainstDummy(password);
      failure = 'unknown_email';
    } else if (!(await verifyPassword(user.passwordHash, password))) {
      failure = 'wrong_password';
    } else if (!user.isActive) {
      failure = 'inactive_account';
    }

    if (failure || !user) {
      await this.activity.log({
        action: 'auth.login_failed',
        userId: user?.id ?? null,
        metadata: { email, reason: failure },
        ip: client.ip,
      });
      // Același mesaj în toate cazurile, pentru a nu dezvălui ce conturi există.
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        API_ERROR_CODES.INVALID_CREDENTIALS,
        'Email sau parolă incorectă.',
      );
    }

    const { token, expiresAt } = await this.sessions.create(user.id, client);
    const updated = await this.prisma.db.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    await this.activity.log({ action: 'auth.login', userId: user.id, ip: client.ip });
    return { user: updated, token, expiresAt };
  }

  async logout(auth: AuthContext, client: ClientInfo): Promise<void> {
    await this.sessions.revoke(auth.sessionId);
    await this.activity.log({ action: 'auth.logout', userId: auth.user.id, ip: client.ip });
  }

  /** Schimbă parola utilizatorului curent și îl deconectează de pe celelalte dispozitive. */
  async changePassword(
    auth: AuthContext,
    currentPassword: string,
    newPassword: string,
    client: ClientInfo,
  ): Promise<User> {
    if (!(await verifyPassword(auth.user.passwordHash, currentPassword))) {
      throw AppException.validation('Parola curentă nu este corectă.', {
        currentPassword: ['Parola curentă nu este corectă.'],
      });
    }
    if (currentPassword === newPassword) {
      throw AppException.validation('Parola nouă trebuie să fie diferită de cea curentă.', {
        newPassword: ['Parola nouă trebuie să fie diferită de cea curentă.'],
      });
    }

    const updated = await this.prisma.db.user.update({
      where: { id: auth.user.id },
      data: {
        passwordHash: await hashPassword(newPassword),
        mustChangePassword: false,
        passwordChangedAt: new Date(),
      },
    });
    await this.sessions.revokeAllForUser(auth.user.id, auth.sessionId);
    await this.activity.log({
      action: 'auth.password_changed',
      userId: auth.user.id,
      ip: client.ip,
    });
    return updated;
  }

  /**
   * Trimite un link de resetare dacă există un cont activ cu acest email.
   * Apelantul nu află niciodată dacă adresa există.
   */
  async requestPasswordReset(email: string, client: ClientInfo): Promise<void> {
    const user = await this.prisma.db.user.findUnique({ where: { email } });
    if (!user || !user.isActive) return;

    const token = generateToken();
    const ttlMinutes = this.config.passwordResetTtlMinutes;
    await this.prisma.db.$transaction([
      // Un singur link valid la un moment dat.
      this.prisma.db.passwordResetToken.deleteMany({ where: { userId: user.id } }),
      this.prisma.db.passwordResetToken.create({
        data: {
          tokenHash: hashToken(token),
          userId: user.id,
          expiresAt: new Date(Date.now() + ttlMinutes * 60_000),
        },
      }),
    ]);

    await this.mailQueue.enqueue({
      kind: 'password-reset',
      to: user.email,
      firstName: user.firstName,
      resetUrl: `${this.config.appUrl}/resetare-parola?token=${encodeURIComponent(token)}`,
      expiresInMinutes: ttlMinutes,
    });
    await this.activity.log({
      action: 'auth.password_reset_requested',
      userId: user.id,
      ip: client.ip,
    });
  }

  async resetPassword(token: string, newPassword: string, client: ClientInfo): Promise<void> {
    const invalid = () =>
      AppException.validation('Linkul de resetare nu este valid sau a expirat. Solicită unul nou.');

    const record = await this.prisma.db.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    });
    if (!record || record.usedAt || record.expiresAt.getTime() <= Date.now()) throw invalid();
    if (!record.user.isActive) throw invalid();

    const passwordHash = await hashPassword(newPassword);
    // Marcarea token-ului ca folosit este condiționată, astfel încât două cereri simultane
    // cu același link să nu poată reuși amândouă.
    const consumed = await this.prisma.db.$transaction(async (tx) => {
      const { count } = await tx.passwordResetToken.updateMany({
        where: { id: record.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (count === 0) return false;
      await tx.user.update({
        where: { id: record.userId },
        data: { passwordHash, mustChangePassword: false, passwordChangedAt: new Date() },
      });
      await tx.session.deleteMany({ where: { userId: record.userId } });
      return true;
    });
    if (!consumed) throw invalid();

    await this.activity.log({
      action: 'auth.password_reset_completed',
      userId: record.userId,
      ip: client.ip,
    });
  }
}
