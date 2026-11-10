import type { ApiErrorBody } from '@alconst/shared'
import { FetchError } from 'ofetch'

const NETWORK_ERROR = 'Nu s-a putut contacta serverul. Verifică conexiunea la internet și încearcă din nou.'

/** Extrage corpul standard de eroare al API-ului, dacă există. */
export function getApiError(error: unknown): ApiErrorBody | null {
  if (!(error instanceof FetchError)) return null
  const data: unknown = error.data
  if (data && typeof data === 'object' && 'code' in data && 'message' in data) {
    return data as ApiErrorBody
  }
  return null
}

/** Mesaj în română, potrivit pentru a fi afișat utilizatorului. */
export function apiErrorMessage(error: unknown): string {
  return getApiError(error)?.message ?? NETWORK_ERROR
}

/** Erorile de validare de pe server, în formatul așteptat de `UForm.setErrors`. */
export function apiFormErrors(error: unknown): { name: string, message: string }[] {
  const fieldErrors = getApiError(error)?.fieldErrors ?? {}
  return Object.entries(fieldErrors).flatMap(([name, messages]) =>
    messages[0] ? [{ name, message: messages[0] }] : []
  )
}
