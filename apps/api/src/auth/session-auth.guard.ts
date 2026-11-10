import { type CanActivate, type ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import { API_ERROR_CODES } from '@alconst/shared';
import { AppException } from '../common/app.exception.js';
import { ALLOW_PENDING_PASSWORD_KEY, IS_PUBLIC_KEY } from '../common/decorators.js';
import type { AuthenticatedRequest } from '../common/request-context.js';
import { SessionService } from './session.service.js';

/**
 * Guard global: orice rută cere o sesiune validă, cu excepția celor marcate `@Public()`.
 * Utilizatorii cu parolă temporară pot accesa doar rutele marcate `@AllowPendingPasswordChange()`.
 */
@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const http = context.switchToHttp();
    const request = http.getRequest<AuthenticatedRequest>();
    const response = http.getResponse<Response>();

    const token: unknown = request.cookies?.[this.sessions.cookieName];
    if (typeof token !== 'string' || token.length === 0) throw AppException.unauthenticated();

    const validated = await this.sessions.validate(token);
    if (!validated) {
      this.sessions.clearCookie(response);
      throw AppException.unauthenticated('Sesiunea a expirat. Autentifică-te din nou.');
    }
    if (validated.renewedUntil) {
      this.sessions.setCookie(response, token, validated.renewedUntil);
    }

    request.auth = { user: validated.user, sessionId: validated.session.id };

    if (
      validated.user.mustChangePassword &&
      !this.reflector.getAllAndOverride<boolean>(ALLOW_PENDING_PASSWORD_KEY, targets)
    ) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        API_ERROR_CODES.PASSWORD_CHANGE_REQUIRED,
        'Trebuie să îți schimbi parola temporară înainte de a continua.',
      );
    }
    return true;
  }
}
