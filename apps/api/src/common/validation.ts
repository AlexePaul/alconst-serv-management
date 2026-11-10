import { ValidationPipe, type ValidationError } from '@nestjs/common';
import { AppException } from './app.exception.js';

function collect(
  errors: ValidationError[],
  parent: string,
  out: Record<string, string[]>,
): Record<string, string[]> {
  for (const error of errors) {
    const path = parent ? `${parent}.${error.property}` : error.property;
    if (error.constraints) {
      out[path] = Object.values(error.constraints);
    }
    if (error.children?.length) collect(error.children, path, out);
  }
  return out;
}

/**
 * Validare globală a DTO-urilor: câmpurile necunoscute sunt respinse,
 * iar erorile sunt returnate pe câmpuri pentru a fi afișate în formulare.
 */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    stopAtFirstError: true,
    exceptionFactory: (errors) =>
      AppException.validation('Verifică datele introduse.', collect(errors, '', {})),
  });
}
