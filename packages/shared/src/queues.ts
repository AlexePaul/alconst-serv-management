/**
 * Contractele cozilor BullMQ. API-ul adaugă job-uri, worker-ul le procesează.
 * Orice coadă nouă se declară aici, împreună cu tipul payload-ului.
 */
export const QUEUE_MAIL = 'mail';

/** Uniune discriminată după `kind`; tipurile noi de email se adaugă aici. */
export type MailJobData =
  | {
      kind: 'password-reset';
      to: string;
      firstName: string;
      resetUrl: string;
      expiresInMinutes: number;
    }
  | {
      /**
       * Notificare trimisă imediat (task atribuit, cerere de preluare). Textul este general:
       * nu conține titluri de task-uri sau nume de clienți, care rămân în aplicație.
       */
      kind: 'notification';
      to: string;
      firstName: string;
      headline: string;
      message: string;
      actionUrl: string;
    }
  | {
      /**
       * Rezumatul zilnic al notificărilor noi. Conține doar numere, nu titluri de task-uri sau
       * nume de clienți: detaliile rămân în aplicație și nu ajung la furnizorul de email.
       */
      kind: 'task-digest';
      to: string;
      firstName: string;
      overdueCount: number;
      dueTodayCount: number;
      dueSoonCount: number;
      appUrl: string;
    };

export type MailJobKind = MailJobData['kind'];

/** Coada activităților periodice: generarea task-urilor, notificări, curățare. */
export const QUEUE_MAINTENANCE = 'maintenance';
export const MAINTENANCE_JOB_HOURLY = 'hourly';

/**
 * Coada notificărilor push (Web Push) către telefoanele și browserele utilizatorilor.
 * Conținutul este criptat de la server până pe dispozitiv: serviciile de push ale Apple sau
 * Google îl transportă, dar nu îl pot citi.
 */
export const QUEUE_PUSH = 'push';

export interface PushJobData {
  userId: string;
  payload: PushPayload;
}

/** Ce primește service worker-ul și afișează ca notificare de sistem. */
export interface PushPayload {
  title: string;
  body?: string;
  /** Pagina deschisă la atingerea notificării (cale relativă, ex. `/task-uri?task=…`). */
  url: string;
  /** Notificările cu același `tag` se înlocuiesc una pe alta în loc să se adune. */
  tag?: string;
  /** Numărul de notificări necitite, afișat pe iconița aplicației (unde sistemul permite). */
  badge?: number;
}
