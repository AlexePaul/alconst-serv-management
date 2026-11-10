import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEFAULT_TASK_HORIZON_DAYS, todayIn } from '@alconst/shared';

/** Configurarea aplicației, citită și validată o singură dată la pornire. */
export class AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  /** Originea publică a aplicației web, ex. `https://app.alconst-serv.ro`. */
  appUrl: string;
  apiPort: number;
  databaseUrl: string;
  redisUrl: string;
  sessionTtlDays: number;
  passwordResetTtlMinutes: number;
  /** Numărul de reverse proxy-uri de încredere din fața API-ului (0 = niciunul). */
  trustProxy: number;
  /** Fusul orar în care se stabilește „azi” pentru termene. */
  timeZone: string;
  /** Cu câte zile în avans se generează task-urile din obligații. */
  taskHorizonDays: number;

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
  config.apiPort = integer(env, 'API_PORT', 3001, 1);
  config.databaseUrl = required(env, 'DATABASE_URL');
  config.redisUrl = required(env, 'REDIS_URL');
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
  return config;
}
