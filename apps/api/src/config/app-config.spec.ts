import { loadAppConfig } from './app-config.js';

const base = {
  NODE_ENV: 'production',
  APP_URL: 'https://app.alconst-serv.ro/',
  DATABASE_URL: 'postgresql://u:p@db:5432/alconst',
  REDIS_URL: 'redis://redis:6379',
};

describe('loadAppConfig', () => {
  it('normalizează APP_URL la origine și aplică valorile implicite', () => {
    const config = loadAppConfig(base);
    expect(config.appUrl).toBe('https://app.alconst-serv.ro');
    expect(config.secureCookies).toBe(true);
    expect(config.apiPort).toBe(3001);
    expect(config.sessionTtlDays).toBe(14);
  });

  it('refuză HTTP în producție', () => {
    expect(() => loadAppConfig({ ...base, APP_URL: 'http://app.alconst-serv.ro' })).toThrow(
      /HTTPS/,
    );
  });

  it('permite HTTP în dezvoltare, fără cookie-uri Secure', () => {
    const config = loadAppConfig({
      ...base,
      NODE_ENV: 'development',
      APP_URL: 'http://localhost:3000',
    });
    expect(config.secureCookies).toBe(false);
  });

  it.each(['DATABASE_URL', 'REDIS_URL', 'APP_URL'])('cere variabila %s', (key) => {
    expect(() => loadAppConfig({ ...base, [key]: '' })).toThrow();
  });

  it('validează valorile numerice', () => {
    expect(() => loadAppConfig({ ...base, SESSION_TTL_DAYS: '0' })).toThrow(/SESSION_TTL_DAYS/);
    expect(() => loadAppConfig({ ...base, API_PORT: 'abc' })).toThrow(/API_PORT/);
  });
});
