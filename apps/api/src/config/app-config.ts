import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { DEFAULT_MAX_UPLOAD_MB, DEFAULT_TASK_HORIZON_DAYS, todayIn } from '@alconst/shared';

/** Unde este păstrat conținutul fișierelor încărcate. */
export interface FilesConfig {
  driver: 'local' | 's3';
  /** Directorul folosit de stocarea pe disc. */
  directory: string;
  s3Bucket?: string;
  s3Region?: string;
  /** Doar pentru servicii compatibile S3 (ex. MinIO); pentru Amazon S3 rămâne necompletat. */
  s3Endpoint?: string;
  s3ForcePathStyle: boolean;
}

/** Configurarea aplicației, citită și validată o singură dată la pornire. */
export class AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  /** Originea publică a aplicației web, ex. `https://app.alconst-serv.ro`. */
  appUrl: string;
  /** Interfața pe care ascultă API-ul: `127.0.0.1` în spatele unui proxy de pe aceeași mașină. */
  apiHost: string;
  apiPort: number;
  databaseUrl: string;
  /** Numărul maxim de conexiuni PostgreSQL ținute de acest proces. */
  databasePoolMax: number;
  redisUrl: string;
  /** Prefixul cheilor din Redis, ca aplicația să nu se suprapună cu altele pe același server. */
  queuePrefix: string;
  /** Versiunea instalată (commit-ul), raportată de `/api/ready`. */
  version: string;
  sessionTtlDays: number;
  passwordResetTtlMinutes: number;
  /** Numărul de reverse proxy-uri de încredere din fața API-ului (0 = niciunul). */
  trustProxy: number;
  /** Fusul orar în care se stabilește „azi” pentru termene. */
  timeZone: string;
  /** Cu câte zile în avans se generează task-urile din obligații. */
  taskHorizonDays: number;
  files: FilesConfig;
  /** Dimensiunea maximă a unui fișier încărcat, în MB. */
  maxUploadMb: number;

  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  }

  /** Data de azi (`YYYY-MM-DD`) în fusul orar al firmei. */
  today(): string {
    return todayIn(this.timeZone);
  }

  /** Cookie-urile sunt marcate `Secure` ori de câte ori aplicația este servită prin HTTPS. */
  get secureCookies(): boolean {
    return this.appUrl.startsWith('https://');
  }
}

/**
 * În dezvoltare, variabilele sunt citite din `.env` din rădăcina monorepo-ului.
 * În producție vin exclusiv din mediul containerului.
 */
export function loadRootEnvFile(): void {
  if (process.env.NODE_ENV === 'production') return;
  const file = resolve(import.meta.dirname, '../../../../.env');
  if (existsSync(file)) process.loadEnvFile(file);
}

function required(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key]?.trim();
  if (!value) throw new Error(`Variabila de mediu ${key} este obligatorie.`);
  return value;
}

function integer(env: NodeJS.ProcessEnv, key: string, fallback: number, min: number): number {
  const raw = env[key]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min) {
    throw new Error(`Variabila de mediu ${key} trebuie să fie un număr întreg ≥ ${min}.`);
  }
  return value;
}

/** Prefixul cheilor BullMQ din Redis: litere mici, cifre, `-`, `_` și `:`. */
export function queuePrefix(env: NodeJS.ProcessEnv): string {
  const prefix = env.QUEUE_PREFIX?.trim() || 'alconst';
  if (!/^[a-z0-9:_-]{1,40}$/.test(prefix)) {
    throw new Error('QUEUE_PREFIX poate conține doar litere mici, cifre și caracterele - _ :');
  }
  return prefix;
}

/**
 * Stocarea fișierelor: pe disc (`local`) sau în S3 (`s3`). În producție alegerea trebuie făcută
 * explicit, ca fișierele să nu ajungă din greșeală în sistemul de fișiere al containerului.
 */
function loadFilesConfig(env: NodeJS.ProcessEnv, nodeEnv: string): FilesConfig {
  const driver = env.FILES_STORAGE?.trim() || (nodeEnv === 'production' ? '' : 'local');
  if (driver !== 'local' && driver !== 's3') {
    throw new Error('FILES_STORAGE trebuie să fie „local” sau „s3”.');
  }
  const directory =
    env.FILES_DIR?.trim() ||
    (nodeEnv === 'test'
      ? resolve(tmpdir(), 'alconst-test-files')
      : resolve(import.meta.dirname, '../../../../.data/files'));
  if (driver === 'local' && nodeEnv === 'production' && !env.FILES_DIR?.trim()) {
    throw new Error('Pentru FILES_STORAGE=local, FILES_DIR este obligatoriu în producție.');
  }
  const files: FilesConfig = {
    driver,
    directory,
    s3ForcePathStyle: env.S3_FORCE_PATH_STYLE?.trim() === 'true',
  };
  if (driver === 's3') {
    files.s3Bucket = required(env, 'S3_BUCKET');
    files.s3Region = required(env, 'S3_REGION');
    const endpoint = env.S3_ENDPOINT?.trim();
    if (endpoint) files.s3Endpoint = endpoint;
  }
  return files;
}

export function loadAppConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const nodeEnv = env.NODE_ENV ?? 'development';
  if (nodeEnv !== 'development' && nodeEnv !== 'test' && nodeEnv !== 'production') {
    throw new Error(`NODE_ENV invalid: „${nodeEnv}”.`);
  }

  let appUrl: URL;
  try {
    appUrl = new URL(required(env, 'APP_URL'));
  } catch {
    throw new Error('APP_URL trebuie să fie un URL valid, ex. https://app.alconst-serv.ro');
  }
  if (nodeEnv === 'production' && appUrl.protocol !== 'https:') {
    throw new Error('În producție, APP_URL trebuie să folosească HTTPS.');
  }

  const config = new AppConfig();
  config.nodeEnv = nodeEnv;
  config.appUrl = appUrl.origin;
  config.apiHost = env.API_HOST?.trim() || '0.0.0.0';
  config.apiPort = integer(env, 'API_PORT', 3001, 1);
  config.databaseUrl = required(env, 'DATABASE_URL');
  config.databasePoolMax = integer(env, 'DATABASE_POOL_MAX', 10, 1);
  config.redisUrl = required(env, 'REDIS_URL');
  config.queuePrefix = queuePrefix(env);
  config.version = env.APP_VERSION?.trim() || 'dev';
  config.sessionTtlDays = integer(env, 'SESSION_TTL_DAYS', 14, 1);
  config.passwordResetTtlMinutes = integer(env, 'PASSWORD_RESET_TTL_MINUTES', 60, 5);
  config.trustProxy = integer(env, 'TRUST_PROXY', 0, 0);
  config.timeZone = env.APP_TIMEZONE?.trim() || 'Europe/Bucharest';
  try {
    new Intl.DateTimeFormat('ro-RO', { timeZone: config.timeZone });
  } catch {
    throw new Error(`APP_TIMEZONE invalid: „${config.timeZone}”.`);
  }
  config.taskHorizonDays = integer(env, 'TASK_HORIZON_DAYS', DEFAULT_TASK_HORIZON_DAYS, 1);
  config.files = loadFilesConfig(env, nodeEnv);
  config.maxUploadMb = integer(env, 'MAX_UPLOAD_MB', DEFAULT_MAX_UPLOAD_MB, 1);
  return config;
}
