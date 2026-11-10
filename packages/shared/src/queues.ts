/**
 * Contractele cozilor BullMQ. API-ul adaugă job-uri, worker-ul le procesează.
 * Orice coadă nouă se declară aici, împreună cu tipul payload-ului.
 */
export const QUEUE_MAIL = 'mail';

/** Uniune discriminată după `kind`; tipurile noi de email se adaugă aici. */
export type MailJobData = {
  kind: 'password-reset';
  to: string;
  firstName: string;
  resetUrl: string;
  expiresInMinutes: number;
};

export type MailJobKind = MailJobData['kind'];
