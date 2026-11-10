import type { ServiceDto, UserOptionDto } from '@alconst/shared'

/**
 * Date de referință folosite în mai multe componente. Fiecare listă are o singură definiție,
 * astfel încât toate componentele să împartă aceeași cerere și același cache.
 */

/** Catalogul de servicii al firmei. */
export function useServices() {
  const api = useApi()
  return useLazyAsyncData('services', () => api<ServiceDto[]>('/services'), { default: () => [] })
}

/** Utilizatorii activi (nume și rol), pentru alegerea responsabililor. */
export function useUserOptions() {
  const api = useApi()
  return useLazyAsyncData('users:options', () => api<UserOptionDto[]>('/users/options'), { default: () => [] })
}
