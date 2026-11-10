/**
 * Acțiunile înregistrate în jurnalul de activitate (audit log).
 * Lista se extinde odată cu modulele aplicației.
 */
export const ACTIVITY_ACTIONS = [
  'auth.login',
  'auth.login_failed',
  'auth.logout',
  'auth.password_changed',
  'auth.password_reset_requested',
  'auth.password_reset_completed',
  'user.created',
  'user.updated',
  'user.activated',
  'user.deactivated',
  'user.password_reset_by_admin',
  'client.created',
  'client.updated',
  'client.activated',
  'client.deactivated',
  'client.responsibles_updated',
  'client.transferred',
  'client.transfer_requested',
  'client.transfer_declined',
  'client.transfer_cancelled',
  'client.services_updated',
  'client.employee_count_updated',
  'location.created',
  'location.updated',
  'location.activated',
  'location.deactivated',
  'contract.created',
  'contract.updated',
  'contract.ended',
  'service.created',
  'service.updated',
  'service.deleted',
  'obligation.created',
  'obligation.updated',
  'obligation.deleted',
  'task.created',
  'task.updated',
  'task.status_changed',
  'task.deleted',
] as const;
export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];

export const ACTIVITY_ACTION_LABELS: Record<ActivityAction, string> = {
  'auth.login': 'S-a autentificat',
  'auth.login_failed': 'Autentificare eșuată',
  'auth.logout': 'S-a deconectat',
  'auth.password_changed': 'Și-a schimbat parola',
  'auth.password_reset_requested': 'A solicitat resetarea parolei',
  'auth.password_reset_completed': 'Și-a resetat parola',
  'user.created': 'A creat un utilizator',
  'user.updated': 'A modificat un utilizator',
  'user.activated': 'A activat un utilizator',
  'user.deactivated': 'A dezactivat un utilizator',
  'user.password_reset_by_admin': 'A resetat parola unui utilizator',
  'client.created': 'A adăugat un client',
  'client.updated': 'A modificat un client',
  'client.activated': 'A reactivat un client',
  'client.deactivated': 'A arhivat un client',
  'client.responsibles_updated': 'A modificat responsabilii unui client',
  'client.transferred': 'A transferat un client',
  'client.transfer_requested': 'A cerut predarea unui client',
  'client.transfer_declined': 'A refuzat predarea unui client',
  'client.transfer_cancelled': 'A retras cererea de predare a unui client',
  'client.services_updated': 'A modificat serviciile unui client',
  'client.employee_count_updated': 'A actualizat numărul de angajați ai unui client',
  'location.created': 'A adăugat un punct de lucru',
  'location.updated': 'A modificat un punct de lucru',
  'location.activated': 'A reactivat un punct de lucru',
  'location.deactivated': 'A arhivat un punct de lucru',
  'contract.created': 'A adăugat un contract',
  'contract.updated': 'A modificat un contract',
  'contract.ended': 'A încheiat un contract',
  'service.created': 'A adăugat un serviciu',
  'service.updated': 'A modificat un serviciu',
  'service.deleted': 'A șters un serviciu',
  'obligation.created': 'A adăugat o obligație',
  'obligation.updated': 'A modificat o obligație',
  'obligation.deleted': 'A șters o obligație',
  'task.created': 'A creat un task',
  'task.updated': 'A modificat un task',
  'task.status_changed': 'A schimbat statusul unui task',
  'task.deleted': 'A șters un task',
};

export interface ActivityLogDto {
  id: string;
  action: ActivityAction | string;
  entityType: string | null;
  entityId: string | null;
  /** Descriere scurtă a entității afectate (ex. numele utilizatorului). */
  entityLabel: string | null;
  createdAt: string;
  user: { id: string; firstName: string; lastName: string } | null;
}
