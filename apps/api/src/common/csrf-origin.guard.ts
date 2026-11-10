import { type CanActivate, type ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { API_ERROR_CODES } from '@alconst/shared';
import { AppConfig } from '../config/app-config.js';
import { AppException } from './app.exception.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Protecție CSRF pentru autentificarea pe bază de cookie.
 *
 * Cookie-ul de sesiune este `SameSite=Strict`, iar aici verificăm suplimentar că cererile care
 * modifică date provin din aplicația web: antetul `Origin` trebuie să corespundă cu `APP_URL`.
 * Browserele moderne trimit `Origin` la toate cererile non-GET; dacă lipsește, ne bazăm pe
 * `Sec-Fetch-Site`. Clienții non-browser (fără ambele antete) nu transportă cookie-uri ambientale,
 * deci nu sunt expuși la CSRF.
 */
@Injectable()
export class CsrfOriginGuard implements CanActivate {
  constructor(private readonly config: AppConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(request.method)) return true;

    const origin = request.headers.origin;
    if (origin !== undefined) {
      if (origin === this.config.appUrl) return true;
      throw this.rejected();
    }

    const fetchSite = request.headers['sec-fetch-site'];
    if (fetchSite === undefined || fetchSite === 'same-origin' || fetchSite === 'none') {
      return true;
    }
    throw this.rejected();
  }

  private rejected(): AppException {
    return new AppException(
      HttpStatus.FORBIDDEN,
      API_ERROR_CODES.CSRF_REJECTED,
      'Cererea a fost respinsă din motive de securitate.',
    );
  }
}
