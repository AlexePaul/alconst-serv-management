import { loadWorkerConfig } from './worker-config.js';

const base = {
  NODE_ENV: 'production',
  REDIS_URL: 'redis://redis:6379',
  DATABASE_URL: 'postgresql://u:p@db:5432/alconst',
  APP_URL: 'https://app.alconst-serv.ro/',
};

describe('loadWorkerConfig', () => {
  it('deduce TLS implicit din portul 465 (ex. Resend) și STARTTLS pentru 587', () => {
    const resend = loadWorkerConfig({
      ...base,
      SMTP_HOST: 'smtp.resend.com',
      SMTP_PORT: '465',
      SMTP_USER: 'resend',
      SMTP_PASSWORD: 'cheie',
      SMTP_SECURE: '',
    });
    expect(resend.smtp).toMatchObject({
      host: 'smtp.resend.com',
      port: 465,
      secure: true,
      user: 'resend',
    });

    const starttls = loadWorkerConfig({ ...base, SMTP_HOST: 'smtp.example.ro', SMTP_PORT: '587' });
    expect(starttls.smtp?.secure).toBe(false);
  });

  it('respectă valoarea explicită a SMTP_SECURE', () => {
    const config = loadWorkerConfig({
      ...base,
      SMTP_HOST: 'h',
      SMTP_PORT: '2465',
      SMTP_SECURE: 'true',
    });
    expect(config.smtp?.secure).toBe(true);
  });

  it('cere SMTP în producție, dar nu și în dezvoltare', () => {
    expect(() => loadWorkerConfig(base)).toThrow(/SMTP_HOST/);
    expect(loadWorkerConfig({ ...base, NODE_ENV: 'development' }).smtp).toBeNull();
  });

  it('cere REDIS_URL, DATABASE_URL și APP_URL', () => {
    expect(() => loadWorkerConfig({ ...base, REDIS_URL: '' })).toThrow(/REDIS_URL/);
    expect(() => loadWorkerConfig({ ...base, DATABASE_URL: '' })).toThrow(/DATABASE_URL/);
    expect(() => loadWorkerConfig({ ...base, APP_URL: '' })).toThrow(/APP_URL/);
  });

  it('aplică valorile implicite pentru fus orar și orizont', () => {
    const config = loadWorkerConfig({ ...base, SMTP_HOST: 'h' });
    expect(config).toMatchObject({
      appUrl: 'https://app.alconst-serv.ro',
      timeZone: 'Europe/Bucharest',
      taskHorizonDays: 60,
    });
    expect(() =>
      loadWorkerConfig({ ...base, SMTP_HOST: 'h', APP_TIMEZONE: 'Marte/Olimp' }),
    ).toThrow(/APP_TIMEZONE/);
  });
});
