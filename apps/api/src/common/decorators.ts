import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { UserRole } from '@alconst/shared';
import { AppException } from './app.exception.js';
import {
  type AuthContext,
  type AuthenticatedRequest,
  type ClientInfo,
  getClientInfo,
} from './request-context.js';

export const IS_PUBLIC_KEY = 'auth:isPublic';
/** Marchează o rută ca accesibilă fără autentificare. Implicit, toate rutele cer autentificare. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const ALLOW_PENDING_PASSWORD_KEY = 'auth:allowPendingPasswordChange';
/** Permite accesul utilizatorilor care încă trebuie să își schimbe parola temporară. */
export const AllowPendingPasswordChange = () => SetMetadata(ALLOW_PENDING_PASSWORD_KEY, true);

export const ROLES_KEY = 'auth:roles';
/** Restricționează ruta la rolurile indicate. */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

/** Injectează contextul de autentificare (utilizator + sesiune) al cererii curente. */
export const CurrentAuth = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthContext => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.auth) throw AppException.unauthenticated();
    return request.auth;
  },
);

/** Injectează IP-ul și user agent-ul clientului. */
export const Client = createParamDecorator((_: unknown, ctx: ExecutionContext): ClientInfo =>
  getClientInfo(ctx.switchToHttp().getRequest<AuthenticatedRequest>()),
);
