import { AppException } from '../common/app.exception.js';

/**
 * Intervalul orar este opțional. Poate avea doar început („de la 10:00”), dar nu doar sfârșit,
 * iar sfârșitul trebuie să fie după început.
 */
export function assertTimeRange(startTime: string | null, endTime: string | null): void {
  if (endTime && !startTime) {
    throw AppException.validation('Completează și ora de început a intervalului.', {
      startTime: ['Completează și ora de început.'],
    });
  }
  if (startTime && endTime && endTime <= startTime) {
    throw AppException.validation('Ora de sfârșit trebuie să fie după ora de început.', {
      endTime: ['Ora de sfârșit trebuie să fie după ora de început.'],
    });
  }
}
