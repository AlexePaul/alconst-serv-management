import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { Response } from 'express';
import { API_ERROR_CODES, type ApiErrorBody, type ApiErrorCode } from '@alconst/shared';
import { AppException } from './app.exception.js';

const STATUS_DEFAULTS: Partial<Record<number, { code: ApiErrorCode; message: string }>> = {
  [HttpStatus.BAD_REQUEST]: {
    code: API_ERROR_CODES.VALIDATION_FAILED,
    message: 'Cererea nu este validă.',
  },
  [HttpStatus.UNAUTHORIZED]: {
    code: API_ERROR_CODES.UNAUTHENTICATED,
    message: 'Trebuie să te autentifici pentru a continua.',
  },
  [HttpStatus.FORBIDDEN]: {
    code: API_ERROR_CODES.FORBIDDEN,
    message: 'Nu ai permisiunea de a efectua această operațiune.',
  },
  [HttpStatus.NOT_FOUND]: {
    code: API_ERROR_CODES.NOT_FOUND,
    message: 'Resursa căutată nu există.',
  },
  [HttpStatus.CONFLICT]: {
    code: API_ERROR_CODES.CONFLICT,
    message: 'Operațiunea intră în conflict cu datele existente.',
  },
  [HttpStatus.PAYLOAD_TOO_LARGE]: {
    code: API_ERROR_CODES.VALIDATION_FAILED,
    message: 'Datele trimise depășesc dimensiunea permisă.',
  },
};

/**
 * Uniformizează toate erorile API în forma `ApiErrorBody`.
 * Detaliile erorilor neașteptate ajung doar în loguri, niciodată la client.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ApiExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const body = this.toBody(exception);
    response.status(body.statusCode).json(body);
  }

  private toBody(exception: unknown): ApiErrorBody {
    if (exception instanceof AppException) {
      return {
        statusCode: exception.getStatus(),
        code: exception.code,
        message: exception.message,
        ...(exception.fieldErrors ? { fieldErrors: exception.fieldErrors } : {}),
      };
    }

    if (exception instanceof ThrottlerException) {
      return {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        code: API_ERROR_CODES.TOO_MANY_REQUESTS,
        message: 'Prea multe încercări. Așteaptă puțin și încearcă din nou.',
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const fallback = STATUS_DEFAULTS[status];
      if (status >= 500) this.logger.error(exception.message, exception.stack);
      return {
        statusCode: status,
        code: fallback?.code ?? API_ERROR_CODES.INTERNAL_ERROR,
        message: fallback?.message ?? 'A apărut o eroare. Încearcă din nou.',
      };
    }

    this.logger.error(
      exception instanceof Error ? exception.message : String(exception),
      exception instanceof Error ? exception.stack : undefined,
    );
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: API_ERROR_CODES.INTERNAL_ERROR,
      message: 'A apărut o eroare neașteptată. Încearcă din nou.',
    };
  }
}
