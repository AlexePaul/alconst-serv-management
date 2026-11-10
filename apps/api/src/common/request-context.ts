import type { Request } from 'express';
import type { User } from '@alconst/database';

/** Datele de autentificare atașate cererii de către `SessionAuthGuard`. */
export interface AuthContext {
  user: User;
  sessionId: string;
}

export interface AuthenticatedRequest extends Request {
  auth?: AuthContext;
}

/** Informații despre originea cererii, folosite în jurnalul de activitate și la sesiuni. */
export interface ClientInfo {
  ip: string | null;
  userAgent: string | null;
}

export function getClientInfo(request: Request): ClientInfo {
  const userAgent = request.headers['user-agent'];
  return {
    ip: request.ip ?? null,
    userAgent: userAgent ? userAgent.slice(0, 500) : null,
  };
}
