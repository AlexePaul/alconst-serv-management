import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@alconst/shared'
import { z } from 'zod'

// Fără caractere ușor de confundat (0/O, 1/l/I), pentru că parola temporară este transmisă verbal sau în scris.
const ALPHABET = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/** Generează o parolă temporară aleatorie, folosind generatorul criptografic al browserului. */
export function generateTemporaryPassword(length = 14): string {
  const result: string[] = []
  // Eșantionare cu respingere, pentru o distribuție uniformă a caracterelor.
  const limit = 256 - (256 % ALPHABET.length)
  while (result.length < length) {
    for (const byte of crypto.getRandomValues(new Uint8Array(length * 2))) {
      if (byte < limit && result.length < length) {
        result.push(ALPHABET.charAt(byte % ALPHABET.length))
      }
    }
  }
  return result.join('')
}

/** Regula comună pentru parole noi – aceeași ca pe server. */
export const newPasswordSchema = z
  .string('Parola este obligatorie.')
  .min(PASSWORD_MIN_LENGTH, `Parola trebuie să aibă cel puțin ${PASSWORD_MIN_LENGTH} caractere.`)
  .max(PASSWORD_MAX_LENGTH, `Parola poate avea cel mult ${PASSWORD_MAX_LENGTH} de caractere.`)

export const emailSchema = z.email('Introdu o adresă de email validă.')
