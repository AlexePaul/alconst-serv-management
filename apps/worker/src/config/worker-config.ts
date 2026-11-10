import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

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

  const config = new WorkerConfig();
  config.nodeEnv = nodeEnv;
  config.redisUrl = redisUrl;
  config.mailFrom = env.MAIL_FROM?.trim() || 'Alconst Serv <no-reply@alconst-serv.ro>';
  config.smtp = smtp;
  return config;
}
