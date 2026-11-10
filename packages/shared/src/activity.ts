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
