import { createECDH } from 'node:crypto';
import type { PrismaClient } from './generated/prisma/client.js';

/** Cheile VAPID ale aplicației (format base64url, ca în specificația Web Push). */
export interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

const VAPID_SETTING_KEY = 'web-push.vapid';

/**
 * Serviciile de push ale browserelor la care serverul are voie să trimită. Adresa vine de la
 * browser, deci este verificată: altfel un utilizator ar putea face serverul să trimită cereri
 * către adrese interne.
 */
const PUSH_SERVICE_HOSTS = [
  /^fcm\.googleapis\.com$/, // Chrome, Edge pe Android, Samsung Internet
  /^android\.googleapis\.com$/,
  /^([a-z0-9-]+\.)*push\.apple\.com$/, // Safari (iPhone, iPad, Mac)
  /^([a-z0-9-]+\.)*push\.services\.mozilla\.com$/, // Firefox
  /^([a-z0-9-]+\.)*notify\.windows\.com$/, // Edge pe Windows
];

export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  return (
    url.protocol === 'https:' &&
    url.port === '' &&
    PUSH_SERVICE_HOSTS.some((pattern) => pattern.test(url.hostname))
  );
}

/** O pereche nouă de chei P-256, exact formatul cerut de VAPID. */
export function generateVapidKeys(): VapidKeys {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  return {
    publicKey: ecdh.getPublicKey().toString('base64url'),
    privateKey: ecdh.getPrivateKey().toString('base64url'),
  };
}

/**
 * Cheile VAPID ale instalării. Sunt generate automat la prima nevoie și păstrate în baza de date,
 * deci nu necesită configurare și supraviețuiesc restaurării unui backup. Dacă s-ar schimba,
 * abonamentele existente ar înceta să funcționeze.
 *
 * Generarea simultană din API și worker este sigură: prima inserare câștigă, iar ambele procese
 * citesc apoi aceeași valoare.
 */
export async function getVapidKeys(db: PrismaClient): Promise<VapidKeys> {
  const existing = await db.appSetting.findUnique({ where: { key: VAPID_SETTING_KEY } });
  if (existing) return JSON.parse(existing.value) as VapidKeys;
  await db.appSetting.createMany({
    data: [{ key: VAPID_SETTING_KEY, value: JSON.stringify(generateVapidKeys()) }],
    skipDuplicates: true,
  });
  const stored = await db.appSetting.findUniqueOrThrow({ where: { key: VAPID_SETTING_KEY } });
  return JSON.parse(stored.value) as VapidKeys;
}
