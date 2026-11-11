import type { ApiErrorBody, UserDto } from '@alconst/shared'
import { API_ERROR_CODES } from '@alconst/shared'

/**
 * Clientul HTTP al aplicației. Autentificarea se face prin cookie-ul de sesiune (httpOnly),
 * trimis automat de browser. API-ul este fie pe aceeași origine (`/api`), fie – când interfața
 * este găzduită separat – pe un alt subdomeniu al aceluiași domeniu; de aceea cererile includ
 * explicit cookie-urile (`credentials: 'include'`).
 */
export default defineNuxtPlugin((nuxtApp) => {
  const user = useState<UserDto | null>('auth:user', () => null)
  const toast = useToast()

  const api = $fetch.create({
    baseURL: useRuntimeConfig().public.apiBase,
    credentials: 'include',
    headers: { Accept: 'application/json' },
    async onResponseError({ response }) {
      const body = response._data as ApiErrorBody | undefined

      // Sesiunea a expirat sau a fost revocată în timp ce utilizatorul lucra.
      if (response.status === 401 && body?.code === API_ERROR_CODES.UNAUTHENTICATED && user.value) {
        user.value = null
        toast.add({
          title: 'Sesiunea a expirat',
          description: 'Autentifică-te din nou pentru a continua.',
          color: 'warning',
          icon: 'i-lucide-clock'
        })
        await nuxtApp.runWithContext(() => {
          const route = useRoute()
          return navigateTo({ path: '/login', query: route.path === '/' ? {} : { redirect: route.fullPath } })
        })
      }

      // Un administrator a resetat parola: utilizatorul trebuie să aleagă una nouă.
      if (response.status === 403 && body?.code === API_ERROR_CODES.PASSWORD_CHANGE_REQUIRED) {
        if (user.value) user.value = { ...user.value, mustChangePassword: true }
        await nuxtApp.runWithContext(() => navigateTo('/cont'))
      }
    }
  })

  return { provide: { api } }
})
