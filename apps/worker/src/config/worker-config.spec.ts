import { loadWorkerConfig } from './worker-config.js';

const base = { NODE_ENV: 'production', REDIS_URL: 'redis://redis:6379' };

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

  it('cere REDIS_URL', () => {
    expect(() => loadWorkerConfig({ NODE_ENV: 'development' })).toThrow(/REDIS_URL/);
  });
});
