import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEFAULT_TASK_HORIZON_DAYS } from '@alconst/shared';

export interface SmtpConfig {
  host: string;
  port: number;
  /** `true` pentru TLS implicit (portul 465); altfel se folosește STARTTLS. */
  secure: boolean;
  user?: string;
  password?: string;
}

/** Configurarea worker-ului, citită și validată o singură dată la pornire. */
export class WorkerConfig {
  nodeEnv: 'development' | 'test' | 'production';
  redisUrl: string;
  /** Prefixul cheilor din Redis; trebuie să fie același ca al API-ului. */
  queuePrefix: string;
  databaseUrl: string;
  /** Numărul maxim de conexiuni PostgreSQL ținute de worker. */
  databasePoolMax: number;
  /** Adresa publică a aplicației, pentru linkurile din emailuri. */
  appUrl: string;
  /** Fusul orar în care se stabilește „azi” pentru termene și ora trimiterii rezumatului. */
  timeZone: string;
  /** Cu câte zile în avans se generează task-urile din obligații. */
  taskHorizonDays: number;
  /** Expeditorul emailurilor, ex. `Alconst Serv <no-reply@alconst-serv.ro>`. */
  mailFrom: string;
  /** `null` = SMTP neconfigurat; permis doar în dezvoltare, unde emailurile se scriu în log. */
  smtp: SmtpConfig | null;
}

/** În dezvoltare, variabilele sunt citite din `.env` din rădăcina monorepo-ului. */
export function loadRootEnvFile(): void {
  if (process.env.NODE_ENV === 'production') return;
  const file = resolve(import.meta.dirname, '../../../../.env');
  if (existsSync(file)) process.loadEnvFile(file);
}

export function loadWorkerConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const nodeEnv = env.NODE_ENV ?? 'development';
  if (nodeEnv !== 'development' && nodeEnv !== 'test' && nodeEnv !== 'production') {
    throw new Error(`NODE_ENV invalid: „${nodeEnv}”.`);
  }

  const redisUrl = env.REDIS_URL?.trim();
  if (!redisUrl) throw new Error('Variabila de mediu REDIS_URL este obligatorie.');
  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('Variabila de mediu DATABASE_URL este obligatorie.');
  let appUrl: string;
  try {
    appUrl = new URL(env.APP_URL?.trim() ?? '').origin;
  } catch {
    throw new Error('APP_URL trebuie să fie un URL valid, ex. https://app.alconst-serv.ro');
  }
  const timeZone = env.APP_TIMEZONE?.trim() || 'Europe/Bucharest';
  try {
    new Intl.DateTimeFormat('ro-RO', { timeZone });
  } catch {
    throw new Error(`APP_TIMEZONE invalid: „${timeZone}”.`);
  }
  const horizonRaw = env.TASK_HORIZON_DAYS?.trim();
  const taskHorizonDays = horizonRaw ? Number(horizonRaw) : DEFAULT_TASK_HORIZON_DAYS;
  if (!Number.isInteger(taskHorizonDays) || taskHorizonDays < 1) {
    throw new Error('TASK_HORIZON_DAYS trebuie să fie un număr întreg ≥ 1.');
  }

  const host = env.SMTP_HOST?.trim();
  let smtp: SmtpConfig | null = null;
  if (host) {
    const port = Number(env.SMTP_PORT?.trim() || 587);
    if (!Number.isInteger(port) || port < 1 || port > 65_535) {
      throw new Error('SMTP_PORT trebuie să fie un port valid.');
    }
    const user = env.SMTP_USER?.trim();
    const password = env.SMTP_PASSWORD;
    smtp = {
      host,
      port,
      secure: env.SMTP_SECURE ? env.SMTP_SECURE === 'true' : port === 465,
      ...(user ? { user } : {}),
      ...(password ? { password } : {}),
    };
  } else if (nodeEnv === 'production') {
    throw new Error('În producție, SMTP_HOST este obligatoriu pentru trimiterea emailurilor.');
  }

  const queuePrefix = env.QUEUE_PREFIX?.trim() || 'alconst';
  if (!/^[a-z0-9:_-]{1,40}$/.test(queuePrefix)) {
    throw new Error('QUEUE_PREFIX poate conține doar litere mici, cifre și caracterele - _ :');
  }
  const poolRaw = env.DATABASE_POOL_MAX?.trim();
  const databasePoolMax = poolRaw ? Number(poolRaw) : 5;
  if (!Number.isInteger(databasePoolMax) || databasePoolMax < 1) {
    throw new Error('DATABASE_POOL_MAX trebuie să fie un număr întreg ≥ 1.');
  }

  const config = new WorkerConfig();
  config.nodeEnv = nodeEnv;
  config.redisUrl = redisUrl;
  config.queuePrefix = queuePrefix;
  config.databaseUrl = databaseUrl;
  config.databasePoolMax = databasePoolMax;
  config.appUrl = appUrl;
  config.timeZone = timeZone;
  config.taskHorizonDays = taskHorizonDays;
  config.mailFrom = env.MAIL_FROM?.trim() || 'Alconst Serv <no-reply@alconst-serv.ro>';
  config.smtp = smtp;
  return config;
}
