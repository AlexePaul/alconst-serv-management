import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@alconst/shared';

/** Adresă de email validă, normalizată (fără spații, cu litere mici). */
export function IsNormalizedEmail(): PropertyDecorator {
  return applyDecorators(
    Transform(({ value }: { value: unknown }) =>
      typeof value === 'string' ? value.trim().toLowerCase() : value,
    ),
    IsEmail({}, { message: 'Introdu o adresă de email validă.' }),
    MaxLength(254, { message: 'Adresa de email este prea lungă.' }),
  );
}

/** Parolă nouă, conform politicii comune frontend/backend. */
export function IsNewPassword(): PropertyDecorator {
  return applyDecorators(
    IsString({ message: 'Parola este obligatorie.' }),
    MinLength(PASSWORD_MIN_LENGTH, {
      message: `Parola trebuie să aibă cel puțin ${PASSWORD_MIN_LENGTH} caractere.`,
    }),
    MaxLength(PASSWORD_MAX_LENGTH, {
      message: `Parola poate avea cel mult ${PASSWORD_MAX_LENGTH} de caractere.`,
    }),
  );
}

/** Text obligatoriu, fără spații la capete. */
export function IsTrimmedText(label: string, maxLength: number): PropertyDecorator {
  return applyDecorators(
    Transform(({ value }: { value: unknown }) =>
      typeof value === 'string' ? value.trim() : value,
    ),
    IsString({ message: `${label} este obligatoriu.` }),
    MinLength(1, { message: `${label} este obligatoriu.` }),
    MaxLength(maxLength, { message: `${label} poate avea cel mult ${maxLength} caractere.` }),
  );
}

/** Text opțional: spațiile de la capete sunt eliminate, iar textul gol devine `null` (șterge valoarea). */
export function IsOptionalText(label: string, maxLength: number): PropertyDecorator {
  return applyDecorators(
    Transform(({ value }: { value: unknown }) => {
      if (typeof value !== 'string') return value;
      const trimmed = value.trim();
      return trimmed === '' ? null : trimmed;
    }),
    IsOptional(),
    IsString({ message: `${label} trebuie să fie un text.` }),
    MaxLength(maxLength, { message: `${label} poate avea cel mult ${maxLength} caractere.` }),
  );
}

/** Adresă de email opțională; textul gol devine `null`. */
export function IsOptionalEmail(): PropertyDecorator {
  return applyDecorators(
    Transform(({ value }: { value: unknown }) => {
      if (typeof value !== 'string') return value;
      const trimmed = value.trim().toLowerCase();
      return trimmed === '' ? null : trimmed;
    }),
    IsOptional(),
    IsEmail({}, { message: 'Introdu o adresă de email validă.' }),
    MaxLength(254, { message: 'Adresa de email este prea lungă.' }),
  );
}

/** Dată calendaristică în format `YYYY-MM-DD`. */
export function IsDateOnly(label: string): PropertyDecorator {
  return applyDecorators(
    Matches(/^\d{4}-\d{2}-\d{2}$/, { message: `${label} nu este o dată validă.` }),
    IsISO8601({ strict: true }, { message: `${label} nu este o dată validă.` }),
  );
}

/** Dată opțională în format `YYYY-MM-DD`; textul gol devine `null`. */
export function IsOptionalDateOnly(label: string): PropertyDecorator {
  return applyDecorators(
    Transform(({ value }: { value: unknown }) => (value === '' ? null : value)),
    IsOptional(),
    IsDateOnly(label),
  );
}
