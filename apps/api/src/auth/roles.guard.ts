import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '@alconst/shared';
import { AppException } from '../common/app.exception.js';
import { ROLES_KEY } from '../common/decorators.js';
import type { AuthenticatedRequest } from '../common/request-context.js';

/** Aplică restricțiile declarate cu `@Roles(...)`. Rulează după `SessionAuthGuard`. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles || roles.length === 0) return true;

    const { auth } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!auth) throw AppException.unauthenticated();
    if (!roles.includes(auth.user.role)) throw AppException.forbidden();
    return true;
  }
}
