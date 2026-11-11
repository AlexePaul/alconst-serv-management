/** Forma erorilor returnate de API. `message` este în limba română și poate fi afișat utilizatorului. */
export interface ApiErrorBody {
  statusCode: number;
  /** Cod stabil, pentru logica din frontend (ex. `PASSWORD_CHANGE_REQUIRED`). */
  code: string;
  message: string;
  /** Erori de validare pe câmpuri, dacă există. */
  fieldErrors?: Record<string, string[]>;
}

export const API_ERROR_CODES = {
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  PASSWORD_CHANGE_REQUIRED: 'PASSWORD_CHANGE_REQUIRED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS',
  CSRF_REJECTED: 'CSRF_REJECTED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES];

export interface Paginated<T> {
  items: T[];
  total: number;
}

/** Numele sub care worker-ul își notează rularea periodică. */
export const MAINTENANCE_HEARTBEAT = 'maintenance';
/** Rularea periodică are loc din oră în oră; după atâtea ore fără una, este considerată oprită. */
export const MAINTENANCE_STALE_HOURS = 3;

/** Starea proceselor de fundal, vizibilă administratorilor. */
export interface SystemStatusDto {
  maintenance: {
    /** Ultima rulare periodică reușită; null dacă nu a avut loc niciodată. */
    lastRunAt: string | null;
    /** False dacă rularea periodică nu a mai avut loc de `MAINTENANCE_STALE_HOURS` ore. */
    healthy: boolean;
  };
}
