import { loadAppConfig } from './app-config.js';

const base = {
  NODE_ENV: 'production',
  APP_URL: 'https://app.alconst-serv.ro/',
  DATABASE_URL: 'postgresql://u:p@db:5432/alconst',
  REDIS_URL: 'redis://redis:6379',
  FILES_STORAGE: 's3',
  S3_BUCKET: 'alconst-documente',
  S3_REGION: 'eu-central-1',
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

  describe('stocarea fișierelor', () => {
    it('în producție trebuie aleasă explicit, cu datele ei', () => {
      const { FILES_STORAGE: _storage, ...withoutStorage } = base;
      expect(() => loadAppConfig(withoutStorage)).toThrow(/FILES_STORAGE/);
      expect(() => loadAppConfig({ ...base, FILES_STORAGE: 'ftp' })).toThrow(/FILES_STORAGE/);
      expect(() => loadAppConfig({ ...base, S3_BUCKET: '' })).toThrow(/S3_BUCKET/);
      expect(() => loadAppConfig({ ...base, FILES_STORAGE: 'local' })).toThrow(/FILES_DIR/);

      expect(loadAppConfig(base).files).toMatchObject({
        driver: 's3',
        s3Bucket: 'alconst-documente',
        s3Region: 'eu-central-1',
        s3ForcePathStyle: false,
      });
      expect(
        loadAppConfig({ ...base, FILES_STORAGE: 'local', FILES_DIR: '/data/files' }).files,
      ).toMatchObject({ driver: 'local', directory: '/data/files' });
    });

    it('în dezvoltare folosește implicit discul local', () => {
      const { FILES_STORAGE: _storage, ...withoutStorage } = base;
      const config = loadAppConfig({
        ...withoutStorage,
        NODE_ENV: 'development',
        APP_URL: 'http://localhost:3000',
      });
      expect(config.files.driver).toBe('local');
      expect(config.files.directory).toContain('.data');
      expect(config.maxUploadMb).toBe(25);
      expect(() => loadAppConfig({ ...base, MAX_UPLOAD_MB: '0' })).toThrow(/MAX_UPLOAD_MB/);
    });
  });
});
