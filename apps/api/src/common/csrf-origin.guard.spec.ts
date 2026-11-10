import type { ExecutionContext } from '@nestjs/common';
import { AppConfig } from '../config/app-config.js';
import { AppException } from './app.exception.js';
import { CsrfOriginGuard } from './csrf-origin.guard.js';

function contextFor(method: string, headers: Record<string, string>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ method, headers }) }),
  } as unknown as ExecutionContext;
}

describe('CsrfOriginGuard', () => {
  const config = Object.assign(new AppConfig(), { appUrl: 'https://app.alconst-serv.ro' });
  const guard = new CsrfOriginGuard(config);

  it('permite cererile care nu modifică date, indiferent de origine', () => {
    expect(guard.canActivate(contextFor('GET', { origin: 'https://evil.example' }))).toBe(true);
  });

  it('permite cererile venite din aplicația web', () => {
    expect(guard.canActivate(contextFor('POST', { origin: 'https://app.alconst-serv.ro' }))).toBe(
      true,
    );
  });

  it.each([
    'https://evil.example',
    'https://alconst-serv.ro',
    'http://app.alconst-serv.ro',
    'https://app.alconst-serv.ro.evil.example',
    'null',
  ])('respinge originea %s', (origin) => {
    expect(() => guard.canActivate(contextFor('POST', { origin }))).toThrow(AppException);
  });

  it('fără Origin, se bazează pe Sec-Fetch-Site', () => {
    expect(guard.canActivate(contextFor('DELETE', { 'sec-fetch-site': 'same-origin' }))).toBe(true);
    expect(() =>
      guard.canActivate(contextFor('DELETE', { 'sec-fetch-site': 'cross-site' })),
    ).toThrow(AppException);
    expect(() => guard.canActivate(contextFor('PATCH', { 'sec-fetch-site': 'same-site' }))).toThrow(
      AppException,
    );
  });

  it('permite clienții non-browser (fără Origin și fără Sec-Fetch-Site)', () => {
    expect(guard.canActivate(contextFor('POST', {}))).toBe(true);
  });
});
