import { HttpException, HttpStatus } from '@nestjs/common';
import { API_ERROR_CODES, type ApiErrorCode } from '@alconst/shared';

/** Eroare de aplicație cu un cod stabil și un mesaj în română, afișabil utilizatorului. */
export class AppException extends HttpException {
  constructor(
    status: HttpStatus,
    readonly code: ApiErrorCode,
    message: string,
    readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message, status);
  }

  static unauthenticated(message = 'Trebuie să te autentifici pentru a continua.'): AppException {
    return new AppException(HttpStatus.UNAUTHORIZED, API_ERROR_CODES.UNAUTHENTICATED, message);
  }

  static forbidden(message = 'Nu ai permisiunea de a efectua această operațiune.'): AppException {
    return new AppException(HttpStatus.FORBIDDEN, API_ERROR_CODES.FORBIDDEN, message);
  }

  static notFound(message = 'Resursa căutată nu există.'): AppException {
    return new AppException(HttpStatus.NOT_FOUND, API_ERROR_CODES.NOT_FOUND, message);
  }

  static conflict(message: string, fieldErrors?: Record<string, string[]>): AppException {
    return new AppException(HttpStatus.CONFLICT, API_ERROR_CODES.CONFLICT, message, fieldErrors);
  }

  static validation(message: string, fieldErrors?: Record<string, string[]>): AppException {
    return new AppException(
      HttpStatus.BAD_REQUEST,
      API_ERROR_CODES.VALIDATION_FAILED,
      message,
      fieldErrors,
    );
  }
}
