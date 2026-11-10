import { Injectable } from '@nestjs/common';
import { Prisma, type User } from '@alconst/database';
import { ActivityService } from '../activity/activity.service.js';
import { hashPassword } from '../auth/password.js';
import { SessionService } from '../auth/session.service.js';
import { AppException } from '../common/app.exception.js';
import type { AuthContext, ClientInfo } from '../common/request-context.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateUserDto, UpdateUserDto } from './dto/users.dto.js';
import { fullName } from './user.mapper.js';

const EMAIL_TAKEN = 'Există deja un utilizator cu această adresă de email.';

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/** Administrarea conturilor interne. Conturile nu se șterg, doar se dezactivează (pentru audit). */
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly activity: ActivityService,
  ) {}

  list(): Promise<User[]> {
    return this.prisma.db.user.findMany({
      orderBy: [{ isActive: 'desc' }, { lastName: 'asc' }, { firstName: 'asc' }],
    });
  }

  async get(id: string): Promise<User> {
    const user = await this.prisma.db.user.findUnique({ where: { id } });
    if (!user) throw AppException.notFound('Utilizatorul nu există.');
    return user;
  }

  async create(dto: CreateUserDto, actor: AuthContext, client: ClientInfo): Promise<User> {
    let user: User;
    try {
      user = await this.prisma.db.user.create({
        data: {
          email: dto.email,
          firstName: dto.firstName,
          lastName: dto.lastName,
          role: dto.role,
          passwordHash: await hashPassword(dto.password),
          mustChangePassword: true,
        },
      });
    } catch (error) {
      if (isUniqueViolation(error))
        throw AppException.conflict(EMAIL_TAKEN, { email: [EMAIL_TAKEN] });
      throw error;
    }

    await this.activity.log({
      action: 'user.created',
      userId: actor.user.id,
      entityType: 'user',
      entityId: user.id,
      entityLabel: fullName(user),
      metadata: { role: user.role },
      ip: client.ip,
    });
    return user;
  }

  async update(
    id: string,
    dto: UpdateUserDto,
    actor: AuthContext,
    client: ClientInfo,
  ): Promise<User> {
    const existing = await this.get(id);
    const isSelf = existing.id === actor.user.id;

    // Un administrator nu își poate retrage singur accesul; astfel rămâne mereu
    // cel puțin un administrator activ în sistem.
    if (isSelf && dto.isActive === false) {
      throw AppException.validation('Nu îți poți dezactiva propriul cont.');
    }
    if (isSelf && dto.role !== undefined && dto.role !== existing.role) {
      throw AppException.validation('Nu îți poți modifica propriul rol.');
    }

    const changes: Prisma.UserUpdateInput = {};
    const changedFields: string[] = [];
    for (const field of ['email', 'firstName', 'lastName', 'role', 'isActive'] as const) {
      const value = dto[field];
      if (value !== undefined && value !== existing[field]) {
        Object.assign(changes, { [field]: value });
        changedFields.push(field);
      }
    }
    if (changedFields.length === 0) return existing;

    let updated: User;
    try {
      updated = await this.prisma.db.user.update({ where: { id }, data: changes });
    } catch (error) {
      if (isUniqueViolation(error))
        throw AppException.conflict(EMAIL_TAKEN, { email: [EMAIL_TAKEN] });
      throw error;
    }

    const statusChanged = changedFields.includes('isActive');
    if (statusChanged && !updated.isActive) {
      await this.sessions.revokeAllForUser(id);
    }

    const otherFields = changedFields.filter((field) => field !== 'isActive');
    const base = {
      userId: actor.user.id,
      entityType: 'user',
      entityId: updated.id,
      entityLabel: fullName(updated),
      ip: client.ip,
    };
    if (statusChanged) {
      await this.activity.log({
        ...base,
        action: updated.isActive ? 'user.activated' : 'user.deactivated',
      });
    }
    if (otherFields.length > 0) {
      await this.activity.log({
        ...base,
        action: 'user.updated',
        metadata: { fields: otherFields },
      });
    }
    return updated;
  }

  /** Setează o parolă temporară și deconectează utilizatorul de pe toate dispozitivele. */
  async resetPassword(
    id: string,
    password: string,
    actor: AuthContext,
    client: ClientInfo,
  ): Promise<User> {
    const existing = await this.get(id);
    if (existing.id === actor.user.id) {
      throw AppException.validation(
        'Pentru propriul cont folosește „Schimbă parola” din pagina Contul meu.',
      );
    }

    const updated = await this.prisma.db.user.update({
      where: { id },
      data: {
        passwordHash: await hashPassword(password),
        mustChangePassword: true,
        passwordChangedAt: new Date(),
      },
    });
    await this.sessions.revokeAllForUser(id);
    await this.prisma.db.passwordResetToken.deleteMany({ where: { userId: id } });
    await this.activity.log({
      action: 'user.password_reset_by_admin',
      userId: actor.user.id,
      entityType: 'user',
      entityId: updated.id,
      entityLabel: fullName(updated),
      ip: client.ip,
    });
    return updated;
  }
}
